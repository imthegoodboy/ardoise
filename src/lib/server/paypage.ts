/** What the public invoice page and its status endpoint may reveal about an invoice. */
import { error } from '@sveltejs/kit';
import { balanceOf } from '#lib/ledger.ts';
import { config } from './config.ts';
import { getCustomerByPayToken } from './customers.ts';
import { listEntries } from './entries.ts';
import { getInvoice, refreshInvoice, type Invoice } from './invoices.ts';
import { getShop, type Shop } from './shops.ts';

export function publicInvoice(invoice: Invoice) {
	return {
		publicId: invoice.publicId,
		amountXof: invoice.amountXof,
		amountSats: invoice.amountSats,
		xofPerBtc: invoice.xofPerBtc,
		rateSources: invoice.rateSources,
		bolt11: invoice.bolt11,
		status: invoice.status,
		expiresAt: invoice.expiresAt.toISOString(),
		paidAt: invoice.paidAt?.toISOString() ?? null
	};
}

export type PublicInvoice = ReturnType<typeof publicInvoice>;

/** Resolve token + invoice id together: an invoice is only visible through its own tab's link. */
export async function loadPayerInvoice(token: string, publicId: string) {
	const customer = await getCustomerByPayToken(token);
	if (!customer) error(404, 'Not found');
	const invoice = await getInvoice(publicId);
	if (!invoice || invoice.customerId !== customer.id) error(404, 'Not found');
	const shop = await getShop(invoice.shopId);
	if (!shop) error(404, 'Not found');
	const fresh = await refreshInvoice(invoice, shop);
	const balanceXof = balanceOf(await listEntries(customer.id));
	return { customer, shop, invoice: fresh, balanceXof };
}

/** Which play-money button, if any, the demo shows. Never on a real shop. */
export function demoPayment(shop: Shop, invoice: Invoice): 'simulate' | 'faucet' | null {
	if (!shop.isDemo) return null;
	if (invoice.walletKind === 'demo') return 'simulate';
	if (config.demo === 'faucet' && !config.demoShopNwcUrl) return 'faucet';
	return null;
}
