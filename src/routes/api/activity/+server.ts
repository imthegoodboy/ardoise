import { getDb } from '#lib/server/db/index.ts';
import { recentLightningPayments } from '#lib/server/entries.ts';
import { reconcileQuietly } from '#lib/server/invoices.ts';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';

/** On Vercel: Settles fresh invoices before answering. */
export const config: Config = { maxDuration: 30 };

const WEEK_MS = 7 * 86_400_000;
/** Overlap between polls, so a settlement committing at the boundary is not missed. */
const OVERLAP_MS = 15_000;

/**
 * Polled by the shop app: settles any invoice that was just paid, then reports
 * Lightning payments that landed since `since`, so the shopkeeper hears about
 * a payment from abroad the moment it arrives, whatever screen is open, and
 * about the ones that came while the app was closed (up to a week back).
 * Times are the database's own clock, the one that stamps the payments.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const shop = locals.shop!;
	const db = await getDb();
	const [{ now }] = await db.query<{ now: number }>(
		'select (extract(epoch from now()) * 1000)::float8 as now'
	);
	if (!url.searchParams.has('since')) return Response.json({ now, payments: [] });

	const raw = Number(url.searchParams.get('since'));
	const floor = now - WEEK_MS;
	const since = new Date(Math.max(Number.isFinite(raw) ? raw : floor, floor) - OVERLAP_MS);

	await reconcileQuietly(shop.id, 2_000);
	const payments = await recentLightningPayments(shop.id, since);
	return Response.json({ now, payments });
};
