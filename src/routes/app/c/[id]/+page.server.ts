import { randomUUID } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';
import { getCustomer, rotatePayToken, setArchived, updateCustomer } from '#lib/server/customers.ts';
import { addEntry, listEntries, quickItems, setVoided } from '#lib/server/entries.ts';
import { listCustomerInvoices, refreshInvoice } from '#lib/server/invoices.ts';
import { cleanText, entrySchema, isUuid, readCustomerForm } from '#lib/server/validate.ts';
import type { Actions, PageServerLoad } from './$types';

async function ownCustomer(shopId: string, id: string) {
	if (!isUuid(id)) error(404, 'Not found');
	const customer = await getCustomer(shopId, id);
	if (!customer || customer.archived) error(404, 'Not found');
	return customer;
}

export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
	depends('app:tab');
	const shop = locals.shop!;
	const customer = await ownCustomer(shop.id, params.id);

	// Bring any payment in flight up to date before drawing the tab.
	const recent = await listCustomerInvoices(customer.id, 10);
	const open = recent.filter(
		(invoice) =>
			invoice.status === 'pending' ||
			(invoice.status === 'expired' && Date.now() - invoice.expiresAt.getTime() < 3_600_000)
	);
	if (open.length) {
		await Promise.race([
			Promise.allSettled(open.map((invoice) => refreshInvoice(invoice, shop))),
			new Promise((resolve) => setTimeout(resolve, 2_500))
		]);
	}
	const invoices = open.length ? await listCustomerInvoices(customer.id, 10) : recent;

	const [entries, quick] = await Promise.all([listEntries(customer.id), quickItems(shop.id)]);
	return {
		customer: {
			id: customer.id,
			name: customer.name,
			phone: customer.phone,
			creditLimitXof: customer.creditLimitXof
		},
		entries,
		quickItems: quick,
		paying: invoices
			.filter((invoice) => invoice.status === 'pending' && invoice.expiresAt.getTime() > Date.now())
			.map((invoice) => ({ amountXof: invoice.amountXof, payerName: invoice.payerName })),
		payUrl: `${url.origin}/p/${customer.payToken}`,
		newEntryId: randomUUID()
	};
};

export const actions: Actions = {
	/** The no-JavaScript path; with JavaScript, entries go through /api/entries. */
	add: async ({ request, locals, params }) => {
		const shop = locals.shop!;
		const customer = await ownCustomer(shop.id, params.id);
		const form = await request.formData();
		const parsed = entrySchema.safeParse({
			id: form.get('id'),
			customerId: customer.id,
			kind: form.get('kind'),
			amountXof: form.get('amount'),
			label: form.get('label')
		});
		if (!parsed.success) return fail(400, { addError: 'amount' as const });
		const entry = parsed.data;
		const label = entry.label || (entry.kind === 'payment_cash' ? 'Espèces' : '');
		await addEntry(shop.id, { ...entry, label });
		return { added: true };
	},

	void: async ({ request, locals, params }) => {
		const shop = locals.shop!;
		await ownCustomer(shop.id, params.id);
		const form = await request.formData();
		const entryId = form.get('entryId');
		if (!isUuid(entryId)) return fail(400, { lineError: true });
		await setVoided(shop.id, entryId, form.get('voided') === '1');
		return { voided: true };
	},

	edit: async ({ request, locals, params }) => {
		const shop = locals.shop!;
		const customer = await ownCustomer(shop.id, params.id);
		const form = await request.formData();
		const result = readCustomerForm(form);
		if (!result.ok) {
			return fail(400, {
				editError: result.error,
				name: cleanText(form.get('name'), 60),
				phone: cleanText(form.get('phone'), 30),
				limit: cleanText(form.get('limit'), 20)
			});
		}
		await updateCustomer(shop.id, customer.id, result.value);
		return { saved: true };
	},

	archive: async ({ locals, params }) => {
		const shop = locals.shop!;
		const customer = await ownCustomer(shop.id, params.id);
		await setArchived(shop.id, customer.id, true);
		redirect(303, '/app');
	},

	rotate: async ({ locals, params }) => {
		const shop = locals.shop!;
		const customer = await ownCustomer(shop.id, params.id);
		await rotatePayToken(shop.id, customer.id);
		return { rotated: true };
	}
};
