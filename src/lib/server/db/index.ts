/**
 * A thin database layer: plain SQL over one small interface with two drivers.
 *
 * - Postgres (`pg`) when DATABASE_URL is set: Docker, production, serverless.
 * - PGlite (Postgres compiled to WebAssembly) otherwise: `npm run dev` and the
 *   test suite work with nothing installed, against the same SQL dialect.
 *
 * Conventions that keep both drivers returning identical JavaScript values:
 *   - money and counters are `integer`; aggregates are cast (`::float8`, `::int`)
 *   - JSON goes in as a string with a `::jsonb` cast
 *   - timestamps go in as ISO strings and come back as `Date`
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../config.ts';

// Rows are loosely typed here and narrowed by the service that issued the query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Queryable {
	query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
	/** Run one or more statements without parameters (migrations). */
	exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
	readonly kind: 'postgres' | 'pglite';
	tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
	close(): Promise<void>;
}

async function openPostgres(url: string): Promise<Db> {
	const { default: pg } = await import('pg');
	const pool = new pg.Pool({
		connectionString: url,
		max: Number(process.env.DATABASE_POOL_MAX) || 8,
		idleTimeoutMillis: 20_000,
		connectionTimeoutMillis: 10_000
	});
	// An idle client dropping its connection must not crash the process.
	pool.on('error', () => {});

	return {
		kind: 'postgres',
		async query<T = Row>(sql: string, params: unknown[] = []) {
			const result = await pool.query(sql, params);
			return result.rows as T[];
		},
		async exec(sql) {
			await pool.query(sql);
		},
		async tx(fn) {
			const client = await pool.connect();
			const q: Queryable = {
				async query<T = Row>(sql: string, params: unknown[] = []) {
					const result = await client.query(sql, params);
					return result.rows as T[];
				},
				async exec(sql) {
					await client.query(sql);
				}
			};
			try {
				await client.query('begin');
				const value = await fn(q);
				await client.query('commit');
				return value;
			} catch (err) {
				await client.query('rollback').catch(() => {});
				throw err;
			} finally {
				client.release();
			}
		},
		async close() {
			await pool.end();
		}
	};
}

async function openPglite(dataDir: string | undefined): Promise<Db> {
	const { PGlite } = await import('@electric-sql/pglite');
	if (dataDir) mkdirSync(dataDir, { recursive: true });
	const lite = dataDir ? new PGlite(dataDir) : new PGlite();
	await lite.waitReady;

	return {
		kind: 'pglite',
		async query<T = Row>(sql: string, params: unknown[] = []) {
			const result = await lite.query(sql, params);
			return result.rows as T[];
		},
		async exec(sql) {
			await lite.exec(sql);
		},
		async tx(fn) {
			return (await lite.transaction(async (tx) => {
				return fn({
					async query<T = Row>(sql: string, params: unknown[] = []) {
						const result = await tx.query(sql, params);
						return result.rows as T[];
					},
					async exec(sql) {
						await tx.exec(sql);
					}
				});
			})) as Awaited<ReturnType<typeof fn>>;
		},
		async close() {
			await lite.close();
		}
	};
}

/** Open a fresh, empty in-memory database. Used by the test suite. */
export function openMemoryDb(): Promise<Db> {
	return openPglite(undefined);
}

let instance: Promise<Db> | undefined;

/** The process-wide database, opened on first use. */
export function getDb(): Promise<Db> {
	if (!instance) {
		instance = config.databaseUrl
			? openPostgres(config.databaseUrl)
			: config.isTest
				? openPglite(undefined)
				: openPglite(path.join(config.dataDir, 'pglite'));
		instance.catch(() => {
			instance = undefined;
		});
	}
	return instance;
}

/** Replace the process-wide database. Tests use this to isolate each file. */
export function setDb(db: Db | undefined): void {
	instance = db ? Promise.resolve(db) : undefined;
}

export const nowIso = () => new Date().toISOString();
