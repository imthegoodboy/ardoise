/**
 * Fixed-window rate limiting kept in the database, so limits hold across
 * restarts and across serverless instances that share nothing else.
 *
 * Keys never contain raw identifiers: callers pass a keyed hash of the phone
 * number or IP address (see `clientKey`).
 */
import { lookupHash } from './crypto.ts';
import { getDb } from './db/index.ts';

export interface Limit {
	/** Maximum hits allowed inside one window. */
	max: number;
	windowSeconds: number;
}

export interface LimitResult {
	allowed: boolean;
	remaining: number;
	/** Seconds until the current window ends. */
	retryAfter: number;
}

function windowStart(limit: Limit, now: number): Date {
	const size = limit.windowSeconds * 1000;
	return new Date(Math.floor(now / size) * size);
}

/** Count one hit against `key` and report whether it is still within the limit. */
export async function hit(key: string, limit: Limit, now = Date.now()): Promise<LimitResult> {
	const db = await getDb();
	const start = windowStart(limit, now);
	const rows = await db.query<{ count: number }>(
		`insert into rate_limits (key, window_start, count) values ($1, $2::timestamptz, 1)
		 on conflict (key, window_start) do update set count = rate_limits.count + 1
		 returning count`,
		[key, start.toISOString()]
	);
	const count = rows[0].count;
	if (Math.random() < 0.02) void sweep().catch(() => {});
	return {
		allowed: count <= limit.max,
		remaining: Math.max(0, limit.max - count),
		retryAfter: Math.ceil((start.getTime() + limit.windowSeconds * 1000 - now) / 1000)
	};
}

/** Read the current count without adding to it. */
export async function peek(key: string, limit: Limit, now = Date.now()): Promise<LimitResult> {
	const db = await getDb();
	const start = windowStart(limit, now);
	const rows = await db.query<{ count: number }>(
		'select count from rate_limits where key = $1 and window_start = $2::timestamptz',
		[key, start.toISOString()]
	);
	const count = rows[0]?.count ?? 0;
	return {
		allowed: count < limit.max,
		remaining: Math.max(0, limit.max - count),
		retryAfter: Math.ceil((start.getTime() + limit.windowSeconds * 1000 - now) / 1000)
	};
}

/** Forget a key, e.g. after a successful login. */
export async function reset(key: string): Promise<void> {
	const db = await getDb();
	await db.query('delete from rate_limits where key = $1', [key]);
}

/** Drop windows that ended more than a day ago. */
export async function sweep(): Promise<void> {
	const db = await getDb();
	await db.query(`delete from rate_limits where window_start < now() - interval '1 day'`);
}

/** A stable, non-reversible key for an IP address or other client identifier. */
export function clientKey(scope: string, identifier: string): string {
	return scope + ':' + lookupHash(identifier, 'ratelimit').slice(0, 32);
}
