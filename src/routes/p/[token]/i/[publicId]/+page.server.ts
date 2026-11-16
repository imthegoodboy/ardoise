import { fail } from '@sveltejs/kit';
import { refreshInvoice } from '#lib/server/invoices.ts';
import { demoPayment, loadPayerInvoice, publicInvoice } from '#lib/server/paypage.ts';
import { clientKey, hit } from '#lib/server/ratelimit.ts';
import { simulatePayment } from '#lib/server/wallet/demo.ts';
import { payWithFaucet } from '#lib/server/wallet/faucet.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, depends }) => {
	depends('pay:invoice');
	const { shop, invoice, balanceXof } = await loadPayerInvoice(params.token, params.publicId);
	return {
		shop: { name: shop.name, place: shop.place },
		invoice: publicInvoice(invoice),
		balanceXof,
		demo: demoPayment(shop, invoice)
	};
};

export const actions: Actions = {
	/** "I have paid, check": the no-JavaScript way to refresh. The load does the work. */
	check: async () => ({ checked: true }),

	/** Demo shops only: stand in for the relative's wallet. */
	demo: async ({ params, locals }) => {
		const { shop, invoice } = await loadPayerInvoice(params.token, params.publicId);
		const mode = demoPayment(shop, invoice);
		if (!mode || invoice.status !== 'pending') return fail(400, { demoError: true });
		const limit = await hit(clientKey('demo-pay', locals.client), { max: 30, windowSeconds: 600 });
		if (!limit.allowed) return fail(429, { demoError: true });

		const paid =
			mode === 'simulate'
				? await simulatePayment(invoice.paymentHash)
				: await payWithFaucet(invoice.bolt11);
		if (!paid) return fail(400, { demoError: true });

		// Faucet payments travel over real relays; give the settlement a moment to show.
		let current = invoice;
		for (let attempt = 0; attempt < 6 && current.status !== 'paid'; attempt++) {
			if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_200));
			current = await refreshInvoice({ ...current, lastCheckedAt: null }, shop);
		}
		return { demoPaid: current.status === 'paid' };
	}
};
