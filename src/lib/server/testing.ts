/** Test helpers. Each test file gets its own empty in-memory Postgres. */
import { openMemoryDb, setDb, type Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { hashPin, lookupHash } from './crypto.ts';
import { insertShop, type Shop } from './shops.ts';

export async function freshDb(): Promise<Db> {
	const db = await openMemoryDb();
	await migrate(db);
	setDb(db);
	return db;
}

/** Empty every table, keeping the schema: far cheaper than a new database per test. */
export async function wipeDb(db: Db): Promise<void> {
	await db.exec('truncate shops, sessions, customers, invoices, entries, rate_limits, kv cascade');
}

let counter = 0;

export async function makeShop(db: Db, name = 'Boutique Test'): Promise<Shop> {
	counter += 1;
	return insertShop(db, {
		name,
		place: 'Dakar',
		phoneHmac: lookupHash('+22177000' + String(counter).padStart(4, '0'), 'phone'),
		pinHash: await hashPin('482915'),
		locale: 'fr'
	});
}
