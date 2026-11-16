import { error, fail, redirect } from '@sveltejs/kit';
import { annotateSettled, balanceOf, openLines } from '#lib/ledger.ts';
import { MAX_PAYMENT_XOF, MIN_PAYMENT_XOF, parseAmount } from '#lib/money.ts';
import { getCustomerByPayToken } from '#lib/server/customers.ts';
import { listEntries } from '#lib/server/entries.ts';
import { createInvoice } from '#lib/server/invoices.ts';
import { getShop } from '#lib/server/shops.ts';
import { cleanText } from '#lib/server/validate.ts';
import type { Actions, PageServerLoad } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';

/** On Vercel: Asking the shop's wallet for an invoice goes over Nostr relays. */
export const config: Config = { maxDuration: 60 };

/**
 * The page a relative abroad opens from WhatsApp. It shows only what they
 * need: the shop, the first name on the tab, what is still owed and why.
 * Never the customer's phone number, never other customers.
 */
export const load: PageServerLoad = async ({ params }) => {
	const customer = await getCustomerByPayToken(params.token);
	if (!customer) error(404, 'Not found');
	const shop = await getShop(customer.shopId);
	if (!shop) error(404, 'Not found');

	const entries = await listEntries(customer.id);
	const owed = openLines(annotateSettled(entries));
	return {
		shop: { name: shop.name, place: shop.place, isDemo: shop.isDemo },
		firstName: customer.name.split(' ')[0],
		balanceXof: balanceOf(entries),
		lines: owed.slice(-30).map((line) => ({
			id: line.id,
			label: line.label,
			occurredAt: line.occurredAt,
			amountXof: line.amountXof,
			owedXof: line.owedXof
		})),
		hiddenLines: Math.max(0, owed.length - 30),
		// The debt started with the oldest open line, which may be beyond the 30 shown.
		oldestOpenAt: owed[0]?.occurredAt ?? null,
		canPay: shop.walletKind !== 'none',
		limits: { min: MIN_PAYMENT_XOF, max: MAX_PAYMENT_XOF }
	};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const form = await request.formData();
		const amountXof = parseAmount(form.get('amount'));
		const payerName = cleanText(form.get('name'), 40);
		if (amountXof === null) return fail(400, { error: 'amount' as const, payerName });

		const result = await createInvoice({
			payToken: params.token,
			amountXof,
			payerName,
			client: locals.client
		});
		if (!result.ok)
			return fail(result.error === 'slow_down' ? 429 : 400, { error: result.error, payerName });
		redirect(303, `/p/${params.token}/i/${result.invoice.publicId}`);
	}
};
