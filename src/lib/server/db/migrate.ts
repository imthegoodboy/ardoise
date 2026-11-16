/**
 * Forward-only migrations, bundled into the server at build time so the same
 * code path runs under Docker, a plain `node build`, serverless and tests.
 */
import type { Db } from './index.ts';

const files = import.meta.glob<string>('./migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});

export const migrations = Object.entries(files)
	.map(([file, sql]) => ({
		name: file
			.split('/')
			.pop()!
			.replace(/\.sql$/, ''),
		sql
	}))
	.sort((a, b) => a.name.localeCompare(b.name));

/** Arbitrary constant: every instance starting at once queues on the same lock. */
const LOCK_ID = 7272_7401;

export async function migrate(db: Db): Promise<string[]> {
	await db.exec(
		`create table if not exists schema_migrations (
			name text primary key,
			applied_at timestamptz not null default now()
		)`
	);

	const applied: string[] = [];
	for (const migration of migrations) {
		await db.tx(async (q) => {
			await q.query('select pg_advisory_xact_lock($1)', [LOCK_ID]);
			const done = await q.query('select 1 from schema_migrations where name = $1', [
				migration.name
			]);
			if (done.length) return;
			await q.exec(migration.sql);
			await q.query('insert into schema_migrations (name) values ($1)', [migration.name]);
			applied.push(migration.name);
		});
	}
	return applied;
}
