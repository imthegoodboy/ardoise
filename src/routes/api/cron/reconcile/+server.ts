import { sweepSessions } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { safeEqual } from '#lib/server/crypto.ts';
import { reconcile } from '#lib/server/invoices.ts';
import { log } from '#lib/server/log.ts';
import { sweep } from '#lib/server/ratelimit.ts';
import type { RequestHandler } from './$types';

/**
 * Catch payments nobody was watching (the payer closed the page, the shop
 * was offline). Vercel Cron calls this with `Authorization: Bearer CRON_SECRET`;
 * in Docker, the app's own timer does the same work (see hooks.server.ts).
 */
export const GET: RequestHandler = async ({ request }) => {
	const expected = config.cronSecret ? 'Bearer ' + config.cronSecret : '';
	const given = request.headers.get('authorization') ?? '';
	if (!expected || !safeEqual(given, expected)) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}
	const outcome = await reconcile({ limit: 100 });
	await Promise.all([sweep(), sweepSessions()]);
	log.info('cron.reconcile', outcome);
	return Response.json(outcome);
};
