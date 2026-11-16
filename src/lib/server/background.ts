/**
 * Work that should finish after the response is sent: reconciling invoices
 * nobody is watching, sweeping old rows. On Vercel the function would be
 * frozen once the response is out, so the platform is told to wait for it.
 */
import { waitUntil } from '@vercel/functions';
import { sweepSessions } from './auth.ts';
import { getDb } from './db/index.ts';
import { reconcile } from './invoices.ts';
import { describeError, log } from './log.ts';
import { sweep } from './ratelimit.ts';

export function inBackground(task: Promise<unknown>): void {
	const safe = task.catch((err) => log.warn('background.failed', { reason: describeError(err) }));
	if (process.env.VERCEL) waitUntil(safe);
}

/** Everything the scheduled job does: settle late payments, then tidy up. */
export async function housekeeping(limit = 50) {
	const outcome = await reconcile({ limit });
	const db = await getDb();
	await Promise.all([
		sweep(),
		sweepSessions(),
		// Demo shops are throwaway sandboxes: gone after a day.
		db.query("delete from shops where is_demo and created_at < now() - interval '1 day'")
	]);
	return outcome;
}

/**
 * Called on ordinary requests. At most once a minute across all servers (the
 * row update is the lock), so a site with any traffic catches payments made
 * while every page was closed, even where the platform's cron is daily.
 */
export async function tick(): Promise<void> {
	const db = await getDb();
	const due = await db.query(
		`insert into kv (key, value, updated_at) values ('housekeeping:last', '{}'::jsonb, now())
		 on conflict (key) do update set updated_at = now()
		 where kv.updated_at < now() - interval '60 seconds'
		 returning key`
	);
	if (!due.length) return;
	const outcome = await housekeeping(25);
	if (outcome.checked) log.info('housekeeping', outcome);
}
