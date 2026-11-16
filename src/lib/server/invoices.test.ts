import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { balanceOf } from '../ledger.ts';
import { xofToSats, XOF_PER_EUR } from '../money.ts';
import { createCustomer, type Customer } from './customers.ts';
import type { Db } from './db/index.ts';
import { addEntry, listEntries } from './entries.ts';
import {
	createInvoice,
	getInvoice,
	reconcile,
	refreshInvoice,
	settleInvoice,
	type Invoice
} from './invoices.ts';
import { currentRate, fetchLiveRate, OFFLINE_EUR_PER_BTC, setRateFetch } from './rates.ts';
import { setWallet, type Shop } from './shops.ts';
import { freshDb, makeShop, wipeDb } from './testing.ts';
import { readInvoice } from './wallet/bolt11.ts';
import { simulatePayment } from './wallet/demo.ts';

let db: Db;
let shop: Shop;
let customer: Customer;
let n = 0;
const client = () => 'test-client-' + ++n;

async function invoiceFor(amountXof: number, payerName?: string): Promise<Invoice> {
	const result = await createInvoice({
		payToken: customer.payToken,
		amountXof,
		payerName,
		client: client()
	});
	if (!result.ok) throw new Error('expected an invoice, got ' + result.error);
	return result.invoice;
}

beforeAll(async () => {
	db = await freshDb();
});

beforeEach(async () => {
	await wipeDb(db);
	shop = { ...(await makeShop(db, 'Boutique Diallo')), isDemo: true, walletKind: 'demo' };
	await db.query('update shops set is_demo = true where id = $1', [shop.id]);
	await setWallet(shop.id, { kind: 'demo', secret: null, label: 'Démo' });
	customer = await createCustomer(shop.id, { name: 'Awa Ndiaye' });
	await addEntry(shop.id, {
		id: randomUUID(),
		customerId: customer.id,
		kind: 'purchase',
		amountXof: 5000,
		label: 'Riz 5 kg',
		occurredAt: new Date(Date.now() - 86_400_000)
	});
});

afterEach(() => setRateFetch(undefined));

describe('creating an invoice', () => {
	it('issues a verified invoice in sats at the quoted rate', async () => {
		const invoice = await invoiceFor(5000, 'Moussa');
		const rate = OFFLINE_EUR_PER_BTC * XOF_PER_EUR;
		expect(invoice.amountSats).toBe(xofToSats(5000, rate));
		expect(invoice.rateSources).toEqual(['offline-fallback']);
		expect(invoice.status).toBe('pending');
		expect(invoice.payerName).toBe('Moussa');
		expect(readInvoice(invoice.bolt11).amountMsat).toBe(BigInt(invoice.amountSats) * 1000n);
		expect(readInvoice(invoice.bolt11).description).toBe('Boutique Diallo');
		expect(invoice.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
		expect((await getInvoice(invoice.publicId))?.id).toBe(invoice.id);
	});

	it('hands back the same invoice when pay is pressed twice', async () => {
		const first = await invoiceFor(5000);
		const second = await createInvoice({
			payToken: customer.payToken,
			amountXof: 5000,
			payerName: 'Fatou',
			client: client()
		});
		expect(second.ok && second.reused).toBe(true);
		expect(second.ok && second.invoice.id).toBe(first.id);
		expect(second.ok && second.invoice.payerName).toBe('Fatou');
	});

	it('refuses bad requests', async () => {
		const ask = (payToken: string, amountXof: number) =>
			createInvoice({ payToken, amountXof, client: client() });
		expect(await ask('nope', 5000)).toEqual({ ok: false, error: 'not_found' });
		expect(await ask(customer.payToken, 50)).toEqual({ ok: false, error: 'amount' });
		expect(await ask(customer.payToken, 600_000)).toEqual({ ok: false, error: 'amount' });
		expect(await ask(customer.payToken, 1000.5)).toEqual({ ok: false, error: 'amount' });
	});

	it('limits how many invoices one pay link can mint', async () => {
		const results = [];
		for (let i = 0; i < 8; i++) {
			results.push(
				await createInvoice({ payToken: customer.payToken, amountXof: 1000 + i, client: 'same' })
			);
		}
		expect(results.filter((result) => result.ok)).toHaveLength(6);
		expect(results.at(-1)).toEqual({ ok: false, error: 'slow_down' });
	});

	it('needs a wallet, and a live price for real money', async () => {
		await db.query("update shops set wallet_kind = 'none', is_demo = false where id = $1", [
			shop.id
		]);
		expect(
			await createInvoice({ payToken: customer.payToken, amountXof: 5000, client: client() })
		).toEqual({ ok: false, error: 'no_wallet' });

		// A real wallet with every price feed down: no invoice, rather than a guessed price.
		await setWallet(shop.id, {
			kind: 'nwc',
			secret:
				'nostr+walletconnect://' +
				'a'.repeat(64) +
				'?relay=wss://relay.example&secret=' +
				'b'.repeat(64),
			label: 'Test'
		});
		expect(
			await createInvoice({ payToken: customer.payToken, amountXof: 5000, client: client() })
		).toEqual({ ok: false, error: 'no_rate' });
	});
});

describe('settling', () => {
	it('strikes the tab when the payment arrives, exactly once', async () => {
		const invoice = await invoiceFor(5000, 'Moussa');
		expect((await refreshInvoice(invoice)).status).toBe('pending');

		expect(await simulatePayment(invoice.paymentHash)).toBe(true);
		await db.query('update invoices set last_checked_at = null where id = $1', [invoice.id]);

		// The payer's page, the shopkeeper's page and the cron job all check at once.
		const results = await Promise.all([
			refreshInvoice(invoice),
			refreshInvoice(invoice),
			reconcile({ shopId: shop.id }),
			settleInvoice(invoice.id, { preimage: null, settledAt: null })
		]);
		const paid = await getInvoice(invoice.publicId);
		expect(paid?.status).toBe('paid');
		expect(paid?.paidAt).toBeInstanceOf(Date);
		expect(results).toHaveLength(4);

		const entries = await listEntries(customer.id);
		const payments = entries.filter((entry) => entry.kind === 'payment_lightning');
		expect(payments).toHaveLength(1);
		expect(payments[0].amountXof).toBe(5000);
		expect(payments[0].receiptId).toBe(invoice.publicId);
		expect(payments[0].payerName).toBe('Moussa');
		expect(balanceOf(entries)).toBe(0);

		expect(await settleInvoice(invoice.id, { preimage: null, settledAt: null })).toBe(false);
		expect((await listEntries(customer.id)).length).toBe(entries.length);
	});

	it('stores the preimage as proof of payment', async () => {
		const invoice = await invoiceFor(2000);
		await simulatePayment(invoice.paymentHash);
		const paid = await refreshInvoice(invoice);
		expect(paid.status).toBe('paid');
		expect(paid.preimage).toMatch(/^[0-9a-f]{64}$/);
	});

	it('expires unpaid invoices, but still catches a payment that lands at the last second', async () => {
		const late = await invoiceFor(1000);
		const never = await invoiceFor(1500);
		await simulatePayment(late.paymentHash);
		const past = new Date(Date.now() - 60_000).toISOString();
		await db.query(
			"update invoices set expires_at = $1::timestamptz, status = 'expired', last_checked_at = null where id = $2",
			[past, late.id]
		);
		await db.query('update invoices set expires_at = $1::timestamptz where id = $2', [
			past,
			never.id
		]);

		const outcome = await reconcile();
		expect(outcome.settled).toBe(1);
		expect((await getInvoice(late.publicId))?.status).toBe('paid');
		expect((await getInvoice(never.publicId))?.status).toBe('expired');
	});
});

describe('exchange rate', () => {
	const respond = (body: unknown) => Promise.resolve(Response.json(body));
	const feeds = (prices: Record<string, number | null>) =>
		((url: string) => {
			if (url.includes('kraken')) {
				return prices.kraken === null
					? Promise.reject(new Error('down'))
					: respond({ result: { XXBTZEUR: { c: [String(prices.kraken), '1'] } } });
			}
			if (url.includes('coinbase')) {
				return prices.coinbase === null
					? Promise.reject(new Error('down'))
					: respond({ data: { amount: String(prices.coinbase) } });
			}
			if (url.includes('bitstamp')) {
				return prices.bitstamp === null
					? Promise.reject(new Error('down'))
					: respond({ last: String(prices.bitstamp) });
			}
			return prices.coingecko === null
				? Promise.reject(new Error('down'))
				: respond({ bitcoin: { eur: prices.coingecko } });
		}) as unknown as typeof fetch;

	it('takes the median of the feeds that agree', async () => {
		const rate = await fetchLiveRate(
			feeds({ kraken: 58_000, coinbase: 58_100, bitstamp: 58_050, coingecko: 90_000 })
		);
		expect(rate?.eurPerBtc).toBe(58_050);
		expect(rate?.sources).toEqual(['kraken', 'coinbase', 'bitstamp']);
		expect(rate?.xofPerBtc).toBeCloseTo(58_050 * XOF_PER_EUR, 6);
	});

	it('refuses to quote when fewer than two feeds agree', async () => {
		expect(
			await fetchLiveRate(
				feeds({ kraken: 58_000, coinbase: null, bitstamp: null, coingecko: null })
			)
		).toBeNull();
		expect(
			await fetchLiveRate(
				feeds({ kraken: 40_000, coinbase: 58_000, bitstamp: null, coingecko: 80_000 })
			)
		).toBeNull();
	});

	it('falls back to the last good price for a while', async () => {
		setRateFetch(feeds({ kraken: 60_000, coinbase: 60_000, bitstamp: 60_000, coingecko: 60_000 }));
		expect((await currentRate())?.stale).toBe(false);
		setRateFetch(feeds({ kraken: null, coinbase: null, bitstamp: null, coingecko: null }));
		const cached = await currentRate();
		expect(cached?.stale).toBe(true);
		expect(cached?.eurPerBtc).toBe(60_000);
	});
});

describe('demo shop', () => {
	it('builds a private sandbox with real-looking tabs and a verifiable receipt', async () => {
		const { createDemoShop } = await import('./demo.ts');
		const { listCustomers } = await import('./customers.ts');
		const { preimageMatches } = await import('./wallet/bolt11.ts');
		const result = await createDemoShop('demo-visitor', 'fr', 'simulated');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const customers = await listCustomers(result.shop.id);
		expect(customers.length).toBe(7);
		const awa = customers.find((c) => c.name === 'Awa Ndiaye');
		expect(awa?.balanceXof).toBe(14250 - 2000);
		const fatou = customers.find((c) => c.name === 'Fatou Diop');
		expect(fatou?.balanceXof).toBe(0);
		const entries = await listEntries(fatou!.id);
		const paid = entries.find((e) => e.kind === 'payment_lightning');
		expect(paid?.payerName).toBe('Cheikh');
		const receipt = await getInvoice(paid!.receiptId!);
		expect(receipt?.status).toBe('paid');
		expect(preimageMatches(receipt!.preimage!, receipt!.paymentHash)).toBe(true);
		for (const entry of entries) {
			expect(new Date(entry.occurredAt).getTime()).toBeLessThan(Date.now());
		}
		expect(await createDemoShop('demo-visitor', 'fr', 'off')).toEqual({ ok: false, error: 'off' });
	});
});
