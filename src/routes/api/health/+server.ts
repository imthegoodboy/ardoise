import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/** For Docker and uptime checks: the server answers and the database does too. */
export const GET: RequestHandler = async () => {
	try {
		const db = await getDb();
		await db.query('select 1');
		return Response.json({ ok: true, db: db.kind });
	} catch {
		return Response.json({ ok: false }, { status: 503 });
	}
};
