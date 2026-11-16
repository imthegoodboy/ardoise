/**
 * Lightning invoices for a tab, from "Pay 12 500 F" to a struck-through line.
 *
 * The payer never touches the shop's wallet: they open a public pay link,
 * choose an amount, and get an invoice the shop's own wallet issued. Ardoise
 * then asks the wallet whether it was paid. Settlement is idempotent, so the
 * payer's polling, the shopkeeper's page load and the cron job can all race
 * to settle the same invoice and the tab still gets exactly one payment line.
 */
import { randomUUID } from 'node:crypto';
import { MAX_PAYMENT_XOF, MIN_PAYMENT_XOF, xofToSats } from '#lib/money.ts';
import { getCustomerByPayToken } from './customers.ts';
import { open, randomToken, seal } from './crypto.ts';
import { getDb, type Row } from './db/index.ts';
import { describeError, log } from './log.ts';
import { currentRate } from './rates.ts';
import { clientKey, hit } from './ratelimit.ts';
import { getShop, type Shop } from './shops.ts';
import { preimageMatches } from './wallet/bolt11.ts';
import { demoWallet } from './wallet/demo.ts';
import {
	connectionForShop,
	walletForShop,
	WalletError,
	type PaymentState,
	type Wallet
} from './wallet/index.ts';
import { nwcWallet } from './wallet/nwc.ts';

export type InvoiceStatus = 'pending' | 'paid' | 'expired';

export interface Invoice {
	id: string;
	publicId: string;
	shopId: string;
	customerId: string;
	amountXof: number;
	amountSats: number;
	xofPerBtc: number;
	rateSources: string[];
	walletKind: 'nwc' | 'demo';
	bolt11: string;
	paymentHash: string;
	preimage: string | null;
	status: InvoiceStatus;
	payerName: string | null;
	createdAt: Date;
	expiresAt: Date;
	paidAt: Date | null;
	lastCheckedAt: Date | null;
}

/** How long a payer has to scan and pay. */
export const INVOICE_TTL_SECONDS = 15 * 60;
/** A pending invoice for the same amount is reused while it has this long left. */
const REUSE_MIN_LEFT_MS = 3 * 60_000;
/** Payments that land right at expiry are still picked up for this long. */
const GRACE_MS = 72 * 3_600_000;
/** Polling faster than this is answered from the database. */
const LOOKUP_GAP_MS = 2_000;

export const INVOICE_LIMITS = {
	perLink: { max: 6, windowSeconds: 600 },
	perClient: { max: 20, windowSeconds: 600 }
};

export const payerContext = (invoiceId: string) => 'invoices.payer:' + invoiceId;

function toInvoice(row: Row): Invoice {
	return {
		id: row.id,
		publicId: row.public_id,
		shopId: row.shop_id,
		customerId: row.customer_id,
		amountXof: row.amount_xof,
		amountSats: row.amount_sats,
		xofPerBtc: row.xof_per_btc,
		rateSources: row.rate_sources ? String(row.rate_sources).split(',') : [],
		walletKind: row.wallet_kind,
		bolt11: row.bolt11,
		paymentHash: row.payment_hash,
		preimage: row.preimage,
		status: row.status,
		payerName: row.payer_name_sealed ? open(row.payer_name_sealed, payerContext(row.id)) : null,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		paidAt: row.paid_at,
		lastCheckedAt: row.last_checked_at
	};
}

/** First name only, trimmed: the shopkeeper needs "Awa paid", not an identity. */
export function cleanPayerName(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const name = input
		.normalize('NFC')
		.replace(/[\p{C}<>]/gu, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 40);
	return name || null;
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
	const db = await getDb();
	const rows = await db.query('select * from invoices where id = $1', [id]);
	return rows[0] ? toInvoice(rows[0]) : null;
}

export async function getInvoice(publicId: string): Promise<Invoice | null> {
	if (!/^[A-Za-z0-9_-]{16,32}$/.test(publicId)) return null;
	const db = await getDb();
	const rows = await db.query('select * from invoices where public_id = $1', [publicId]);
	return rows[0] ? toInvoice(rows[0]) : null;
}

export async function listCustomerInvoices(customerId: string, limit = 20): Promise<Invoice[]> {
	const db = await getDb();
	const rows = await db.query(
		'select * from invoices where customer_id = $1 order by created_at desc limit $2',
		[customerId, limit]
	);
	return rows.map(toInvoice);
}

export type CreateInvoiceError =
	| 'not_found'
	| 'no_wallet'
	| 'amount'
	| 'slow_down'
	| 'no_rate'
	| 'wallet_unreachable'
	| 'wallet_refused';

export type CreateInvoiceResult =
	{ ok: true; invoice: Invoice; reused: boolean } | { ok: false; error: CreateInvoiceError };

export async function createInvoice(input: {
	payToken: string;
	amountXof: number;
	payerName?: string | null;
	/** Something stable about the requester (IP), hashed before it is stored. */
	client: string;
}): Promise<CreateInvoiceResult> {
	const customer = await getCustomerByPayToken(input.payToken);
	if (!customer) return { ok: false, error: 'not_found' };
	const shop = await getShop(customer.shopId);
	if (!shop) return { ok: false, error: 'not_found' };

	const amountXof = input.amountXof;
	if (
		!Number.isSafeInteger(amountXof) ||
		amountXof < MIN_PAYMENT_XOF ||
		amountXof > MAX_PAYMENT_XOF
	) {
		return { ok: false, error: 'amount' };
	}

	const connection = await connectionForShop(shop);
	if (!connection) return { ok: false, error: 'no_wallet' };

	// One request at a time per tab on this server; the unique index on pending
	// invoices covers several servers.
	return serialized(customer.id, () =>
		issue({
			shop,
			customerId: customer.id,
			payToken: customer.payToken,
			amountXof,
			connection,
			input
		})
	);
}

const queues = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(key) ?? Promise.resolve();
	const next = previous.then(task, task);
	const settled = next.finally(() => {
		if (queues.get(key) === settled) queues.delete(key);
	});
	queues.set(
		key,
		settled.catch(() => {})
	);
	return next;
}

async function issue(args: {
	shop: Shop;
	customerId: string;
	payToken: string;
	amountXof: number;
	connection: NonNullable<Awaited<ReturnType<typeof connectionForShop>>>;
	input: { payerName?: string | null; client: string };
}): Promise<CreateInvoiceResult> {
	const { shop, customerId: customerIdValue, payToken, amountXof, connection, input } = args;
	const customer = { id: customerIdValue, payToken };
	const wallet = connection.wallet;
	const payerName = cleanPayerName(input.payerName);
	const db = await getDb();
	// Who is asking (hashed): reuse is per person, never across relatives.
	const requester = clientKey('invoice-requester', input.client);

	// Pressing "pay" twice, or reloading, shows the same invoice instead of minting another.
	const [open_] = await db.query(
		`select * from invoices
		 where customer_id = $1 and amount_xof = $2 and status = 'pending' and wallet_ref = $3
		   and requester = $5 and expires_at > $4::timestamptz
		 order by created_at desc limit 1`,
		[
			customer.id,
			amountXof,
			connection.ref,
			new Date(Date.now() + REUSE_MIN_LEFT_MS).toISOString(),
			requester
		]
	);
	if (open_) {
		if (payerName && !open_.payer_name_sealed) {
			await db.query('update invoices set payer_name_sealed = $2 where id = $1', [
				open_.id,
				seal(payerName, payerContext(open_.id))
			]);
		}
		return {
			ok: true,
			invoice: (await getInvoiceById(open_.id)) ?? toInvoice(open_),
			reused: true
		};
	}

	const perLink = await hit(clientKey('invoice-link', customer.payToken), INVOICE_LIMITS.perLink);
	const perClient = await hit(clientKey('invoice-client', input.client), INVOICE_LIMITS.perClient);
	if (!perLink.allowed || !perClient.allowed) return { ok: false, error: 'slow_down' };

	// This requester's own invoice for the same amount, about to expire, makes way
	// for the new one (it is still checked for payment during the grace period).
	await db.query(
		`update invoices set status = 'expired'
		 where customer_id = $1 and amount_xof = $2 and wallet_ref = $3 and requester = $4
		   and status = 'pending'`,
		[customer.id, amountXof, connection.ref, requester]
	);

	// The fixed fallback price exists for the simulated wallet only, never for real sats.
	const rate = await currentRate({ allowOffline: wallet.kind === 'demo' });
	if (!rate) return { ok: false, error: 'no_rate' };
	const amountSats = xofToSats(amountXof, rate.xofPerBtc);

	let made;
	try {
		made = await wallet.makeInvoice({
			sats: amountSats,
			memo: shop.name.slice(0, 60),
			expirySeconds: INVOICE_TTL_SECONDS
		});
	} catch (err) {
		const code = err instanceof WalletError ? err.code : 'unreachable';
		log.warn('invoice.wallet_failed', { shop: shop.id, code, reason: describeError(err) });
		return { ok: false, error: code === 'unreachable' ? 'wallet_unreachable' : 'wallet_refused' };
	}

	const id = randomUUID();
	let rows;
	try {
		rows = await db.query(
			`insert into invoices (id, public_id, shop_id, customer_id, amount_xof, amount_sats,
			xof_per_btc, rate_sources, wallet_kind, bolt11, payment_hash, payer_name_sealed, expires_at,
			wallet_ref, wallet_secret, requester)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz, $14, $15, $16)
		 returning *`,
			[
				id,
				randomToken(12),
				shop.id,
				customer.id,
				amountXof,
				amountSats,
				rate.xofPerBtc,
				rate.sources.join(','),
				wallet.kind,
				made.bolt11,
				made.paymentHash,
				payerName ? seal(payerName, payerContext(id)) : null,
				made.expiresAt.toISOString(),
				connection.ref,
				connection.secret ? seal(connection.secret, walletContext(id)) : null,
				requester
			]
		);
	} catch (err) {
		// Another server won the race for this tab and amount: show its invoice.
		if ((err as { code?: string }).code !== '23505') throw err;
		const [winner] = await db.query(
			`select id from invoices where customer_id = $1 and amount_xof = $2 and wallet_ref = $3
			   and requester = $4 and status = 'pending'`,
			[customer.id, amountXof, connection.ref, requester]
		);
		const existing = winner ? await getInvoiceById(winner.id) : null;
		if (!existing) throw err;
		return { ok: true, invoice: existing, reused: true };
	}
	log.info('invoice.created', {
		shop: shop.id,
		invoice: id,
		sats: amountSats,
		wallet: wallet.kind
	});
	return { ok: true, invoice: toInvoice(rows[0]), reused: false };
}

/**
 * Record a payment. Safe to call any number of times, from anywhere, at once:
 * only the call that flips the invoice to paid writes the ledger line.
 */
export async function settleInvoice(
	invoiceId: string,
	proof: { preimage: string | null; settledAt: Date | null }
): Promise<boolean> {
	const db = await getDb();
	return db.tx(async (q) => {
		const now = Date.now();
		const settledAt =
			proof.settledAt && proof.settledAt.getTime() <= now + 60_000
				? proof.settledAt
				: new Date(now);
		const rows = await q.query(
			`update invoices set status = 'paid', preimage = coalesce($2, preimage), wallet_secret = null,
				paid_at = coalesce(paid_at, greatest($3::timestamptz, created_at))
			 where id = $1 and status <> 'paid'
			 returning shop_id, customer_id, amount_xof, paid_at`,
			[invoiceId, proof.preimage, settledAt.toISOString()]
		);
		if (!rows.length) return false;
		const row = rows[0];
		await q.query(
			`insert into entries (id, shop_id, customer_id, kind, amount_xof, label, invoice_id, occurred_at)
			 values ($1::uuid, $2::uuid, $3::uuid, 'payment_lightning', $4::int, '', $5::uuid, $6::timestamptz)
			 on conflict (invoice_id) do nothing`,
			[
				randomUUID(),
				row.shop_id,
				row.customer_id,
				row.amount_xof,
				invoiceId,
				(row.paid_at as Date).toISOString()
			]
		);
		log.info('invoice.settled', { shop: row.shop_id, invoice: invoiceId });
		return true;
	});
}

/**
 * A tab is only credited with proof: the preimage whose SHA-256 is the
 * invoice's payment hash. A wallet that says "settled" without it is not
 * believed, whatever the reason.
 */
function acceptable(
	invoice: Invoice,
	state: PaymentState
): state is Extract<PaymentState, { state: 'settled' }> {
	if (state.state !== 'settled') return false;
	if (!state.preimage || !preimageMatches(state.preimage, invoice.paymentHash)) {
		log.warn('invoice.unproven_settlement', {
			invoice: invoice.id,
			preimage: Boolean(state.preimage)
		});
		return false;
	}
	return true;
}

const walletContext = (invoiceId: string) => 'invoices.wallet:' + invoiceId;

/** The wallet that issued this invoice, even if the shop has connected another since. */
async function walletForInvoice(invoice: Invoice, shop: Shop | null): Promise<Wallet | null> {
	if (invoice.walletKind === 'demo') return demoWallet();
	const db = await getDb();
	const [row] = await db.query<{ wallet_secret: string | null }>(
		'select wallet_secret from invoices where id = $1',
		[invoice.id]
	);
	if (row?.wallet_secret) return nwcWallet(open(row.wallet_secret, walletContext(invoice.id)));
	// Invoices from before wallets were recorded per invoice: the shop's current wallet.
	const current = shop ? await walletForShop(shop) : null;
	return current?.kind === invoice.walletKind ? current : null;
}

/**
 * Bring an invoice up to date with the wallet. Cheap to call often: lookups
 * are spaced out, and only one caller at a time does one.
 */
export async function refreshInvoice(
	invoice: Invoice,
	shop?: Shop | null,
	options: { force?: boolean } = {}
): Promise<Invoice> {
	if (invoice.status === 'paid') return invoice;
	const now = Date.now();
	// Long past the grace period, an invoice that was already given one last
	// check is left alone. A pending one is never expired without that check:
	// the money may have arrived while nobody was watching.
	if (now > invoice.expiresAt.getTime() + GRACE_MS && invoice.status === 'expired') return invoice;

	const db = await getDb();
	const gap = options.force ? 0 : LOOKUP_GAP_MS / 1000;
	const claimed = await db.query(
		`update invoices set last_checked_at = now()
		 where id = $1 and status <> 'paid'
		   and (last_checked_at is null or last_checked_at <= now() - make_interval(secs => $2::float8))
		 returning id`,
		[invoice.id, gap]
	);
	if (!claimed.length) return (await getInvoiceById(invoice.id)) ?? invoice;

	const owner = shop ?? (await getShop(invoice.shopId));
	const wallet = await walletForInvoice(invoice, owner);
	if (wallet) {
		try {
			const state = await wallet.lookupInvoice(invoice.paymentHash);
			if (acceptable(invoice, state)) {
				await settleInvoice(invoice.id, { preimage: state.preimage, settledAt: state.settledAt });
			}
		} catch (err) {
			log.warn('invoice.lookup_failed', { invoice: invoice.id, reason: describeError(err) });
		}
	}

	const fresh = (await getInvoiceById(invoice.id)) ?? invoice;
	if (fresh.status === 'pending' && now > fresh.expiresAt.getTime()) {
		return (await markExpired(fresh.id)) ?? fresh;
	}
	return fresh;
}

async function markExpired(id: string): Promise<Invoice | null> {
	const db = await getDb();
	const rows = await db.query(
		`update invoices set status = 'expired' where id = $1 and status = 'pending' returning *`,
		[id]
	);
	return rows[0] ? toInvoice(rows[0]) : getInvoiceById(id);
}

/**
 * Check every invoice that could still turn into a payment: pending ones,
 * and expired ones inside the grace window. Runs on shopkeeper page loads
 * (for that shop) and from the cron endpoint (for everyone).
 */
export async function reconcile(options: { shopId?: string; limit?: number } = {}): Promise<{
	checked: number;
	settled: number;
}> {
	const db = await getDb();
	const params: unknown[] = [new Date(Date.now() - GRACE_MS).toISOString(), options.limit ?? 25];
	let scope = '';
	if (options.shopId) {
		params.push(options.shopId);
		scope = 'and shop_id = $3';
	}
	const rows = await db.query(
		`select * from invoices
		 where (status = 'pending' or (status = 'expired' and expires_at > $1::timestamptz))
		   and (last_checked_at is null or last_checked_at < now() - interval '15 seconds')
		   ${scope}
		 order by last_checked_at nulls first, created_at
		 limit $2`,
		params
	);
	if (!options.shopId) {
		await db.query(
			`update invoices set wallet_secret = null
			 where wallet_secret is not null and status <> 'pending' and expires_at < $1::timestamptz`,
			[params[0]]
		);
	}
	const results = await Promise.allSettled(rows.map((row) => refreshInvoice(toInvoice(row))));
	const settled = results.filter(
		(result) => result.status === 'fulfilled' && result.value.status === 'paid'
	).length;
	return { checked: rows.length, settled };
}

/** Reconcile a shop's open invoices without ever holding a page load hostage. */
export async function reconcileQuietly(shopId: string, budgetMs = 2_500): Promise<void> {
	await Promise.race([
		reconcile({ shopId, limit: 10 }).catch((err) =>
			log.warn('invoice.reconcile_failed', { reason: describeError(err) })
		),
		new Promise((resolve) => setTimeout(resolve, budgetMs).unref?.())
	]);
}
