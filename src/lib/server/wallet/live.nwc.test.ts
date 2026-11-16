/**
 * End to end over real infrastructure: a wallet from faucet.nwc.dev, reached
 * through public Nostr relays with the production NWC driver, paid by the
 * faucet standing in for a relative abroad, settled into the tab.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceOf } from '../../ledger.ts';
import { createCustomer } from '../customers.ts';
import { addEntry, listEntries } from '../entries.ts';
import { createInvoice, refreshInvoice } from '../invoices.ts';
import { setRateFetch } from '../rates.ts';
import { setWallet } from '../shops.ts';
import { freshDb, makeShop } from '../testing.ts';
import { preimageMatches, readInvoice } from './bolt11.ts';
import { createFaucetWallet, payWithFaucet } from './faucet.ts';
import { closeAllNwcClients, inspectNwc, nwcWallet } from './nwc.ts';

let url = '';

beforeAll(async () => {
	setRateFetch(fetch);
	url = await createFaucetWallet(5_000);
});

afterAll(() => {
	setRateFetch(undefined);
	closeAllNwcClients();
});

describe('a real NWC wallet', () => {
	it('is refused while it can spend, and accepted when spending is allowed for a demo', async () => {
		await expect(inspectNwc(url)).rejects.toMatchObject({ code: 'can_spend' });
		const details = await inspectNwc(url, { allowSpending: true });
		expect(details.methods).toContain('make_invoice');
		expect(details.methods).toContain('lookup_invoice');
		expect(details.canSpend).toBe(true);
		expect(details.relayHosts.length).toBeGreaterThan(0);
	});

	it('issues an invoice that matches the request exactly', async () => {
		const wallet = nwcWallet(url);
		const invoice = await wallet.makeInvoice({
			sats: 21,
			memo: 'Boutique Diallo',
			expirySeconds: 600
		});
		const read = readInvoice(invoice.bolt11);
		expect(read.amountMsat).toBe(21_000n);
		expect(read.paymentHash).toBe(invoice.paymentHash);
		expect(await wallet.lookupInvoice(invoice.paymentHash)).toEqual({ state: 'pending' });
	});

	it('takes a payment from the pay link all the way to a settled tab', async () => {
		const db = await freshDb();
		const shop = await makeShop(db, 'Boutique Diallo');
		await db.query('update shops set is_demo = true where id = $1', [shop.id]);
		await setWallet(shop.id, { kind: 'nwc', secret: url, label: 'Faucet' });
		const customer = await createCustomer(shop.id, { name: 'Awa Ndiaye' });
		await addEntry(shop.id, {
			id: randomUUID(),
			customerId: customer.id,
			kind: 'purchase',
			amountXof: 1500,
			label: 'Riz 1 kg, huile'
		});

		const created = await createInvoice({
			payToken: customer.payToken,
			amountXof: 1500,
			payerName: 'Moussa',
			client: 'live-test'
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const invoice = created.invoice;
		expect(invoice.walletKind).toBe('nwc');
		expect(invoice.rateSources.length).toBeGreaterThanOrEqual(2);

		// The shop switches to another wallet before the money lands. The payment
		// went to the first wallet, and must still be credited.
		const replacement = await createFaucetWallet(1_000);
		await setWallet(shop.id, { kind: 'nwc', secret: replacement, label: 'Second wallet' });

		expect(await payWithFaucet(invoice.bolt11)).toBe(true);

		let current = invoice;
		for (let attempt = 0; attempt < 10 && current.status !== 'paid'; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 2_500));
			current = await refreshInvoice(current);
		}
		expect(current.status).toBe('paid');
		// Credited only with the cryptographic proof of payment.
		expect(preimageMatches(current.preimage ?? '', current.paymentHash)).toBe(true);

		const entries = await listEntries(customer.id);
		expect(entries.filter((entry) => entry.kind === 'payment_lightning')).toHaveLength(1);
		expect(balanceOf(entries)).toBe(0);
	});
});
