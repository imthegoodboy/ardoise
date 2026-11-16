import type { RequestHandler } from './$types';

/**
 * Where a successful "sign out everywhere" or "delete the shop" lands. Clearing
 * this phone's offline book and outbox happens here, after the server has done
 * its part, never before (a wrong PIN must not cost unsent lines).
 *
 * Only our own redirect may trigger the wipe: a link from another site, or a
 * visit while still signed in, just goes home with nothing cleared.
 */
export const GET: RequestHandler = ({ url, request, locals }) => {
	const fromUs = (request.headers.get('sec-fetch-site') ?? 'same-origin') === 'same-origin';
	const headers: Record<string, string> = {
		location: url.searchParams.get('to') === 'login' ? '/login' : '/'
	};
	if (fromUs && !locals.shop) headers['clear-site-data'] = '"cache", "storage"';
	return new Response(null, { status: 303, headers });
};
