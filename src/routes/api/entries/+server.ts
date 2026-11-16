import { addEntry } from '#lib/server/entries.ts';
import { clientKey, hit } from '#lib/server/ratelimit.ts';
import { entrySchema } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

const LIMIT = { max: 240, windowSeconds: 600 };

/**
 * Write one ledger line. Called by the tab page and by the offline outbox.
 * The entry id comes from the phone, so a retry of the same line is a no-op.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const shop = locals.shop!;

	// JSON bodies need a CORS preflight from other origins, and we never answer
	// one; checking Origin as well costs nothing.
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return Response.json({ error: 'origin' }, { status: 403 });

	const limit = await hit(clientKey('entries', shop.id), LIMIT);
	if (!limit.allowed) {
		return Response.json(
			{ error: 'slow_down' },
			{ status: 429, headers: { 'retry-after': String(limit.retryAfter) } }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid' }, { status: 400 });
	}
	const parsed = entrySchema.safeParse(body);
	if (!parsed.success) return Response.json({ error: 'invalid' }, { status: 400 });

	const entry = parsed.data;
	const label = entry.label || (entry.kind === 'payment_cash' ? 'Espèces' : '');
	const result = await addEntry(shop.id, { ...entry, label });
	if (result === 'unknown_customer') return Response.json({ error: result }, { status: 404 });
	if (result === 'invalid') return Response.json({ error: result }, { status: 400 });
	return Response.json({ result }, { status: result === 'created' ? 201 : 200 });
};
