import { error } from '@sveltejs/kit';
import { getInvoice } from '#lib/server/invoices.ts';
import { getShop } from '#lib/server/shops.ts';
import { readInvoice } from '#lib/server/wallet/bolt11.ts';
import type { PageServerLoad } from './$types';

/**
 * A receipt anyone holding its link can check. It names the shop and the
 * amount, never the customer or the payer: it may be forwarded.
 */
export const load: PageServerLoad = async ({ params }) => {
	const invoice = await getInvoice(params.publicId);
	if (!invoice) error(404, 'Not found');
	const shop = await getShop(invoice.shopId);
	if (!shop) error(404, 'Not found');

	let network = '';
	try {
		network = readInvoice(invoice.bolt11).network;
	} catch {
		// A receipt is still a receipt if its invoice can no longer be decoded.
	}
	return {
		shop: { name: shop.name, place: shop.place },
		receipt: {
			paid: invoice.status === 'paid',
			amountXof: invoice.amountXof,
			amountSats: invoice.amountSats,
			xofPerBtc: invoice.xofPerBtc,
			rateSources: invoice.rateSources,
			paidAt: invoice.paidAt?.toISOString() ?? null,
			paymentHash: invoice.paymentHash,
			// The original invoice, so the browser can read the hash from it itself.
			bolt11: invoice.bolt11,
			preimage: invoice.status === 'paid' ? invoice.preimage : null,
			network,
			// Demo shops use play money even when the invoice format is mainnet (NWC faucet).
			testNetwork: network !== 'bc' || shop.isDemo
		}
	};
};
