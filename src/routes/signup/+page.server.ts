import { fail, redirect } from '@sveltejs/kit';
import { signUp } from '#lib/server/auth.ts';
import { clientKey } from '#lib/server/ratelimit.ts';
import { setLocaleCookie, startSession } from '#lib/server/session.ts';
import { cleanText } from '#lib/server/validate.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.shop) redirect(303, '/app');
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const name = cleanText(form.get('name'), 60);
		const place = cleanText(form.get('place'), 60);
		const phone = cleanText(form.get('phone'), 30);
		const pin = cleanText(form.get('pin'), 12);
		const locale = form.get('locale') === 'en' ? 'en' : 'fr';
		const values = { name, place, phone, locale };

		if (!name) return fail(400, { ...values, error: 'name_required' as const });
		const result = await signUp({
			name,
			place,
			phone,
			pin,
			locale,
			clientKey: clientKey('signup', locals.client)
		});
		if (!result.ok) return fail(400, { ...values, error: result.error });

		await startSession(cookies, result.shop.id);
		setLocaleCookie(cookies, locale);
		redirect(303, '/app');
	}
};
