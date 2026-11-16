import { endSession } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

// POST only: a link or an image tag elsewhere must not be able to sign a shop out.
export const POST: RequestHandler = async ({ cookies }) => {
	await endSession(cookies);
	return new Response(null, {
		status: 303,
		headers: {
			location: '/',
			// Wipe the offline copy of the book and the outbox on a shared phone.
			'clear-site-data': '"cache", "storage"'
		}
	});
};
