import { redirect } from '@sveltejs/kit';
import { setLocaleCookie, safeNext } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

/** `/lang?to=en&next=/p/abc`: switch language, return to the same page. Works without JS. */
export const GET: RequestHandler = ({ url, cookies }) => {
	const to = url.searchParams.get('to');
	if (to === 'fr' || to === 'en') setLocaleCookie(cookies, to);
	redirect(303, safeNext(url.searchParams.get('next'), '/'));
};
