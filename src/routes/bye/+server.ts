import type { RequestHandler } from './$types';

/**
 * Where a successful "sign out everywhere" or "delete the shop" lands. Clearing
 * this phone's offline book and outbox happens here, after the server has done
 * its part, never before (a wrong PIN must not cost unsent lines).
 */
export const GET: RequestHandler = ({ url }) =>
	new Response(null, {
		status: 303,
		headers: {
			location: url.searchParams.get('to') === 'login' ? '/login' : '/',
			'clear-site-data': '"cache", "storage"'
		}
	});
