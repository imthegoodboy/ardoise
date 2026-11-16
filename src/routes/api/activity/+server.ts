import { recentLightningPayments } from '#lib/server/entries.ts';
import { reconcileQuietly } from '#lib/server/invoices.ts';
import type { RequestHandler } from './$types';

/**
 * Polled by the shop app: settles any invoice that was just paid, then reports
 * Lightning payments that landed since `since`, so the shopkeeper hears about
 * a payment from abroad the moment it arrives, whatever screen is open.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const shop = locals.shop!;
	// First call: just learn the server's clock, so the client never depends on its own.
	if (!url.searchParams.has('since')) return Response.json({ now: Date.now(), payments: [] });
	const raw = Number(url.searchParams.get('since'));
	// Never look further back than ten minutes: this is a feed, not a history.
	const floor = Date.now() - 10 * 60_000;
	const since = new Date(Number.isFinite(raw) && raw > floor ? raw : floor);

	await reconcileQuietly(shop.id, 2_000);
	const payments = await recentLightningPayments(shop.id, since);
	return Response.json({ now: Date.now(), payments });
};
