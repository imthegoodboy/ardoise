import { fail, redirect } from '@sveltejs/kit';
import { logIn } from '#lib/server/auth.ts';
import { clientKey } from '#lib/server/ratelimit.ts';
import { safeNext, startSession } from '#lib/server/session.ts';
import { cleanText } from '#lib/server/validate.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.shop) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url }) => {
		const form = await request.formData();
		const phone = cleanText(form.get('phone'), 30);
		const pin = cleanText(form.get('pin'), 12);

		const result = await logIn({ phone, pin, clientKey: clientKey('login', locals.client) });
		if (!result.ok) {
			const minutes = Math.max(1, Math.ceil((result.retryAfter ?? 60) / 60));
			return fail(result.error === 'locked' ? 429 : 400, {
				phone,
				error: result.error === 'locked' ? ('locked' as const) : ('invalid_login' as const),
				minutes
			});
		}
		await startSession(cookies, result.shop.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
