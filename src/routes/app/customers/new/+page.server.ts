import { fail, redirect } from '@sveltejs/kit';
import { createCustomer } from '#lib/server/customers.ts';
import { cleanText, readCustomerForm } from '#lib/server/validate.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const result = readCustomerForm(form);
		if (!result.ok) {
			return fail(400, {
				error: result.error,
				name: cleanText(form.get('name'), 60),
				phone: cleanText(form.get('phone'), 30),
				limit: cleanText(form.get('limit'), 20)
			});
		}
		const customer = await createCustomer(locals.shop!.id, result.value);
		redirect(303, `/app/c/${customer.id}`);
	}
};
