/**
 * Nostr Wallet Connect (NIP-47) driver, on top of the Alby SDK.
 *
 * The shopkeeper keeps their own wallet (Alby Hub, a phone wallet with NWC,
 * a node at home). Ardoise only holds a connection that can create invoices
 * and look them up, and it checks that claim instead of trusting it:
 * a connection that is able to spend is refused at the door.
 */
import {
	NWCClient,
	Nip47NetworkError,
	Nip47TimeoutError,
	Nip47WalletError
} from '@getalby/sdk/nwc';
import { sha256Hex } from '../crypto.ts';
import { config } from '../config.ts';
import { describeError, log } from '../log.ts';
import { checkInvoice } from './bolt11.ts';
import { assertPublicRelay, relaysOf } from './hosts.ts';
import { WalletError, type PaymentState, type Wallet } from './types.ts';

const REQUIRED_METHODS = ['make_invoice', 'lookup_invoice'];

/** Any of these means the connection can move money out, or mint itself more rights. */
export const SPENDING_METHODS = [
	'pay_invoice',
	'pay_keysend',
	'multi_pay_invoice',
	'multi_pay_keysend',
	'create_connection'
];

/** In production only real bitcoin is accepted; development may use test networks. */
export function acceptedNetworks(): string[] {
	return config.isProduction ? ['bc'] : ['bc', 'tb', 'tbs', 'bcrt'];
}

export interface ParsedNwcUrl {
	walletPubkey: string;
	relayUrls: string[];
}

/** Structural validation only: no network. Throws `bad_url` or `bad_relay`. */
export function parseNwcUrl(raw: string): ParsedNwcUrl {
	const url = raw.trim();
	if (url.length > 2000 || !/^nostr\+walletconnect:(\/\/)?[0-9a-f]{64}\?/i.test(url)) {
		throw new WalletError('bad_url');
	}
	let options;
	try {
		options = NWCClient.parseWalletConnectUrl(url);
	} catch {
		throw new WalletError('bad_url');
	}
	if (!/^[0-9a-f]{64}$/i.test(options.walletPubkey)) throw new WalletError('bad_url');
	if (!options.secret || !/^([0-9a-f]{64}|nsec1[a-z0-9]{58})$/i.test(options.secret)) {
		throw new WalletError('bad_url');
	}
	if (!options.relayUrls?.length || options.relayUrls.length > 5) {
		throw new WalletError('bad_relay');
	}
	return { walletPubkey: options.walletPubkey.toLowerCase(), relayUrls: options.relayUrls };
}

// --- connection reuse -------------------------------------------------------

const IDLE_MS = 45_000;
const clients = new Map<string, { client: NWCClient; timer: ReturnType<typeof setTimeout> }>();

function drop(key: string) {
	const entry = clients.get(key);
	if (!entry) return;
	clearTimeout(entry.timer);
	clients.delete(key);
	try {
		entry.client.close();
	} catch {
		// Closing a socket that already died is fine.
	}
}

async function clientFor(url: string): Promise<{ key: string; client: NWCClient }> {
	const key = sha256Hex(url);
	let entry = clients.get(key);
	if (entry) {
		clearTimeout(entry.timer);
	} else {
		// Every new socket re-checks where its relays resolve now, not where they
		// resolved when the wallet was connected (DNS rebinding).
		const relays = relaysOf(url);
		if (!relays.length) throw new WalletError('bad_relay');
		for (const relay of relays) await assertPublicRelay(relay);
		entry = { client: new NWCClient({ nostrWalletConnectUrl: url }), timer: setTimeout(() => {}) };
	}
	entry.timer = setTimeout(() => drop(key), IDLE_MS);
	entry.timer.unref?.();
	clients.set(key, entry);
	return { key, client: entry.client };
}

export function closeAllNwcClients() {
	for (const key of [...clients.keys()]) drop(key);
}

function toWalletError(err: unknown): WalletError {
	if (err instanceof WalletError) return err;
	if (err instanceof Nip47WalletError) {
		return new WalletError('wallet_refused', 'Wallet error ' + err.code);
	}
	if (err instanceof Nip47TimeoutError || err instanceof Nip47NetworkError) {
		return new WalletError('unreachable');
	}
	return new WalletError('unreachable', describeError(err));
}

async function call<T>(
	url: string,
	timeoutMs: number,
	fn: (client: NWCClient) => Promise<T>
): Promise<T> {
	const { key, client } = await clientFor(url);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			fn(client),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new WalletError('unreachable')), timeoutMs);
			})
		]);
	} catch (err) {
		// A stale socket (sleeping laptop, frozen serverless instance) fails here;
		// dropping it makes the next call start clean.
		if (!(err instanceof Nip47WalletError)) drop(key);
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

// --- the driver -------------------------------------------------------------

export function nwcWallet(url: string): Wallet {
	return {
		kind: 'nwc',

		async makeInvoice({ sats, memo, expirySeconds }) {
			let tx;
			try {
				tx = await call(url, 20_000, (client) =>
					client.makeInvoice({ amount: sats * 1000, description: memo, expiry: expirySeconds })
				);
			} catch (err) {
				throw toWalletError(err);
			}
			if (!tx?.invoice) throw new WalletError('wallet_refused', 'No invoice returned');
			const invoice = checkInvoice(tx.invoice, {
				sats,
				paymentHash: tx.payment_hash || undefined,
				networks: acceptedNetworks()
			});
			return {
				bolt11: tx.invoice.trim().toLowerCase(),
				paymentHash: invoice.paymentHash,
				expiresAt: invoice.expiresAt
			};
		},

		async lookupInvoice(paymentHash): Promise<PaymentState> {
			let tx;
			try {
				tx = await call(url, 10_000, (client) =>
					client.lookupInvoice({ payment_hash: paymentHash })
				);
			} catch (err) {
				if (err instanceof Nip47WalletError && err.code === 'NOT_FOUND')
					return { state: 'pending' };
				throw toWalletError(err);
			}
			const settled = tx.state === 'settled' || (tx.state === undefined && Boolean(tx.settled_at));
			if (!settled) return { state: 'pending' };
			return {
				state: 'settled',
				preimage: tx.preimage ? tx.preimage.toLowerCase() : null,
				settledAt: tx.settled_at ? new Date(tx.settled_at * 1000) : null
			};
		}
	};
}

export interface NwcDetails {
	alias: string;
	relayHosts: string[];
	methods: string[];
	canSpend: boolean;
}

/**
 * Vet a connection string before it is stored: shape, relay safety, least
 * privilege, and a real round trip (make a 1-sat invoice, look it up).
 */
export async function inspectNwc(
	raw: string,
	options: { allowSpending?: boolean } = {}
): Promise<NwcDetails> {
	const url = raw.trim();
	const parsed = parseNwcUrl(url);
	for (const relay of parsed.relayUrls) await assertPublicRelay(relay);

	let info;
	try {
		info = await call(url, 15_000, (client) => client.getInfo());
	} catch (err) {
		log.warn('nwc.inspect.unreachable', { reason: describeError(err) });
		throw toWalletError(err);
	}

	const methods = (info.methods ?? []).map(String);
	if (!REQUIRED_METHODS.every((method) => methods.includes(method))) {
		throw new WalletError('missing_permission');
	}
	const canSpend = SPENDING_METHODS.some((method) => methods.includes(method));
	if (canSpend && !options.allowSpending && !config.allowSpendCapableNwc) {
		throw new WalletError('can_spend');
	}

	const wallet = nwcWallet(url);
	const probe = await wallet.makeInvoice({
		sats: 1,
		memo: 'Ardoise: test de connexion',
		expirySeconds: 600
	});
	await wallet.lookupInvoice(probe.paymentHash);

	return {
		alias: String(info.alias || '').slice(0, 40),
		relayHosts: parsed.relayUrls.map((relay) => new URL(relay).hostname),
		methods,
		canSpend
	};
}
