import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../testing.ts';
import { checkInvoice, encodeTestInvoice, preimageMatches, readInvoice } from './bolt11.ts';
import { demoWallet, simulatePayment } from './demo.ts';
import { assertPublicRelay, isPrivateAddress } from './hosts.ts';
import { parseNwcUrl } from './nwc.ts';
import { WalletError } from './types.ts';

const PUBKEY = 'b889ff5b1513b641e2a139f661a661364979c5beee91842f8f0ef42ab558e9d4';
const SECRET = '71a8c14c1407c113601079c4302dab36460f0ccd0ad506f1f2dc73b5100e4f3c';

function codeOf(fn: () => unknown): string {
	try {
		fn();
	} catch (err) {
		return err instanceof WalletError ? err.code : 'other';
	}
	return 'none';
}

describe('bolt11', () => {
	it('round-trips a test invoice through the decoder', () => {
		const made = encodeTestInvoice({ sats: 4321, memo: 'Boutique Diallo', expirySeconds: 900 });
		const read = readInvoice(made.bolt11);
		expect(made.bolt11.startsWith('lnbcrt')).toBe(true);
		expect(read.network).toBe('bcrt');
		expect(read.amountMsat).toBe(4_321_000n);
		expect(read.paymentHash).toBe(made.paymentHash);
		expect(read.description).toBe('Boutique Diallo');
		expect(read.expiresAt.getTime() - read.createdAt.getTime()).toBe(900_000);
	});

	it.each([1, 7, 100, 2500, 100_000, 123_456, 1_500_000])('encodes %i sats exactly', (sats) => {
		const made = encodeTestInvoice({ sats, memo: 'x', expirySeconds: 600 });
		expect(readInvoice(made.bolt11).amountMsat).toBe(BigInt(sats) * 1000n);
	});

	it('keeps accents in the memo', () => {
		const made = encodeTestInvoice({ sats: 10, memo: 'Épicerie Ndèye', expirySeconds: 600 });
		expect(readInvoice(made.bolt11).description).toBe('Épicerie Ndèye');
	});

	it('accepts an invoice that matches the request', () => {
		const made = encodeTestInvoice({ sats: 500, memo: 'x', expirySeconds: 600 });
		const checked = checkInvoice(made.bolt11, {
			sats: 500,
			paymentHash: made.paymentHash,
			networks: ['bcrt']
		});
		expect(checked.paymentHash).toBe(made.paymentHash);
	});

	it('refuses a different amount, hash, network, or a dying invoice', () => {
		const made = encodeTestInvoice({ sats: 500, memo: 'x', expirySeconds: 600 });
		const ok = { sats: 500, paymentHash: made.paymentHash, networks: ['bcrt'] };
		expect(codeOf(() => checkInvoice(made.bolt11, { ...ok, sats: 501 }))).toBe('invoice_mismatch');
		expect(codeOf(() => checkInvoice(made.bolt11, { ...ok, paymentHash: 'ab'.repeat(32) }))).toBe(
			'invoice_mismatch'
		);
		expect(codeOf(() => checkInvoice(made.bolt11, { ...ok, networks: ['bc'] }))).toBe(
			'invoice_mismatch'
		);

		const old = encodeTestInvoice({
			sats: 500,
			memo: 'x',
			expirySeconds: 600,
			now: new Date(Date.now() - 580_000)
		});
		expect(codeOf(() => checkInvoice(old.bolt11, { sats: 500, networks: ['bcrt'] }))).toBe(
			'invoice_mismatch'
		);
	});

	it('refuses garbage', () => {
		expect(codeOf(() => readInvoice('lnbc1notaninvoice'))).toBe('invoice_mismatch');
		expect(codeOf(() => readInvoice(''))).toBe('invoice_mismatch');
	});

	it('recognises the preimage as proof of payment', () => {
		const made = encodeTestInvoice({ sats: 500, memo: 'x', expirySeconds: 600 });
		expect(preimageMatches(made.preimage, made.paymentHash)).toBe(true);
		expect(preimageMatches(made.preimage.toUpperCase(), made.paymentHash)).toBe(true);
		expect(preimageMatches('00'.repeat(32), made.paymentHash)).toBe(false);
		expect(preimageMatches('not hex', made.paymentHash)).toBe(false);
	});
});

describe('relay address guard', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.9',
		'172.31.255.255',
		'192.168.1.20',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'224.0.0.1',
		'::1',
		'::',
		'fe80::1',
		'fd12:3456::1',
		'::ffff:10.0.0.1',
		'not-an-ip'
	])('treats %s as private', (ip) => {
		expect(isPrivateAddress(ip)).toBe(true);
	});

	it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
		'treats %s as public',
		(ip) => {
			expect(isPrivateAddress(ip)).toBe(false);
		}
	);

	it.each([
		'ws://relay.example.com',
		'https://relay.example.com',
		'wss://user:pass@relay.example.com',
		'wss://127.0.0.1',
		'wss://[::1]:4848',
		'wss://169.254.169.254/latest/meta-data',
		'wss://localhost',
		'wss://db',
		'wss://relay.internal',
		'not a url'
	])('refuses %s', async (relay) => {
		await expect(assertPublicRelay(relay)).rejects.toMatchObject({ code: 'bad_relay' });
	});

	it('accepts a public literal address', async () => {
		await expect(assertPublicRelay('wss://8.8.8.8')).resolves.toBeUndefined();
	});
});

describe('connection string parsing', () => {
	const relay = encodeURIComponent('wss://relay.getalby.com/v1');

	it('reads a well-formed connection', () => {
		const parsed = parseNwcUrl(`nostr+walletconnect://${PUBKEY}?relay=${relay}&secret=${SECRET}`);
		expect(parsed.walletPubkey).toBe(PUBKEY);
		expect(parsed.relayUrls).toEqual(['wss://relay.getalby.com/v1']);
	});

	it.each([
		['empty', ''],
		['a web link', 'https://example.com/?secret=' + SECRET],
		['a lightning invoice', 'lnbc10n1pexample'],
		['a short pubkey', `nostr+walletconnect://abcd?relay=${relay}&secret=${SECRET}`],
		['no secret', `nostr+walletconnect://${PUBKEY}?relay=${relay}`],
		['a bad secret', `nostr+walletconnect://${PUBKEY}?relay=${relay}&secret=hunter2`]
	])('refuses %s', (_label, url) => {
		expect(codeOf(() => parseNwcUrl(url))).toBe('bad_url');
	});

	it('refuses a connection without a relay', () => {
		expect(codeOf(() => parseNwcUrl(`nostr+walletconnect://${PUBKEY}?secret=${SECRET}`))).toMatch(
			/^bad_(url|relay)$/
		);
	});
});

describe('demo wallet', () => {
	beforeEach(async () => {
		await freshDb();
	});

	it('issues an invoice that settles only once it is "paid"', async () => {
		const wallet = demoWallet();
		const invoice = await wallet.makeInvoice({ sats: 2100, memo: 'Démo', expirySeconds: 900 });
		expect(await wallet.lookupInvoice(invoice.paymentHash)).toEqual({ state: 'pending' });

		expect(await simulatePayment(invoice.paymentHash)).toBe(true);
		const state = await wallet.lookupInvoice(invoice.paymentHash);
		expect(state.state).toBe('settled');
		if (state.state !== 'settled') return;
		expect(preimageMatches(state.preimage ?? '', invoice.paymentHash)).toBe(true);

		// Paying twice changes nothing.
		expect(await simulatePayment(invoice.paymentHash)).toBe(true);
	});

	it('cannot pay an invoice it never issued', async () => {
		expect(await simulatePayment('ab'.repeat(32))).toBe(false);
		expect(await demoWallet().lookupInvoice('ab'.repeat(32))).toEqual({ state: 'pending' });
	});
});
