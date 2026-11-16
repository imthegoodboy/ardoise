import { housekeeping } from '#lib/server/background.ts';
import { config as settings } from '#lib/server/config.ts';
import { safeEqual } from '#lib/server/crypto.ts';
import { log } from '#lib/server/log.ts';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';

/** On Vercel: Checks up to a hundred invoices. */
export const config: Config = { maxDuration: 300 };

/**
 * Catch payments nobody was watching and tidy old rows. Vercel Cron calls this
 * with `Authorization: Bearer CRON_SECRET`; in Docker the app's own timer does
 * the same work, and on any host ordinary traffic triggers it once a minute
 * (see background.ts).
 */
export const GET: RequestHandler = async ({ request }) => {
	const expected = settings.cronSecret ? 'Bearer ' + settings.cronSecret : '';
	const given = request.headers.get('authorization') ?? '';
	if (!expected || !safeEqual(given, expected)) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}
	const outcome = await housekeeping(100);
	log.info('cron.reconcile', outcome);
	return Response.json(outcome);
};
