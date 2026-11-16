import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { annotateSettled, balanceOf } from '../ledger.ts';
import {
	confirmPin,
	createSession,
	destroySession,
	isWeakPin,
	logIn,
	readSession,
	signUp
} from './auth.ts';
import {
	createCustomer,
	getCustomer,
	getCustomerByPayToken,
	listCustomers,
	rotatePayToken,
	setArchived,
	updateCustomer
} from './customers.ts';
import type { Db } from './db/index.ts';
import { migrate, migrations } from './db/migrate.ts';
import { addEntry, listEntries, quickItems, setVoided, shopTotals } from './entries.ts';
import { hit, peek } from './ratelimit.ts';
import { freshDb, makeShop } from './testing.ts';

let db: Db;

beforeAll(async () => {
	db = await freshDb();
});

describe('migrations', () => {
	it('apply once and are recorded', async () => {
		expect(migrations.length).toBeGreaterThan(0);
		expect(await migrate(db)).toEqual([]);
		const rows = await db.query('select name from schema_migrations order by name');
		expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name));
	});
});

describe('customers', () => {
	it('stores names and phone numbers encrypted', async () => {
		const shop = await makeShop(db);
		const customer = await createCustomer(shop.id, {
			name: 'Fatou Ndiaye',
			phone: '+221771234567'
		});
		const [raw] = await db.query('select * from customers where id = $1', [customer.id]);
		expect(JSON.stringify(raw)).not.toContain('Fatou');
		expect(JSON.stringify(raw)).not.toContain('771234567');
		expect((await getCustomer(shop.id, customer.id))?.name).toBe('Fatou Ndiaye');
		expect((await getCustomer(shop.id, customer.id))?.phone).toBe('+221771234567');
	});

	it('never crosses shops', async () => {
		const a = await makeShop(db);
		const b = await makeShop(db);
		const customer = await createCustomer(a.id, { name: 'Moussa' });
		expect(await getCustomer(b.id, customer.id)).toBeNull();
		expect(await updateCustomer(b.id, customer.id, { name: 'Hacked' })).toBe(false);
		expect(await setArchived(b.id, customer.id, true)).toBe(false);
		expect(await rotatePayToken(b.id, customer.id)).toBeNull();
		expect(
			await addEntry(b.id, {
				id: randomUUID(),
				customerId: customer.id,
				kind: 'purchase',
				amountXof: 500,
				label: 'Pain'
			})
		).toBe('unknown_customer');
		expect(await listEntries(customer.id)).toEqual([]);
	});

	it('resolves a pay link until it is rotated or the tab is archived', async () => {
		const shop = await makeShop(db);
		const customer = await createCustomer(shop.id, { name: 'Awa' });
		expect((await getCustomerByPayToken(customer.payToken))?.id).toBe(customer.id);

		const fresh = await rotatePayToken(shop.id, customer.id);
		expect(fresh).not.toBe(customer.payToken);
		expect(await getCustomerByPayToken(customer.payToken)).toBeNull();
		expect((await getCustomerByPayToken(fresh!))?.id).toBe(customer.id);

		await setArchived(shop.id, customer.id, true);
		expect(await getCustomerByPayToken(fresh!)).toBeNull();
		expect(await getCustomerByPayToken("' or 1=1 --")).toBeNull();
	});
});

describe('entries', () => {
	it('add up into balances and shop totals', async () => {
		const shop = await makeShop(db);
		const fatou = await createCustomer(shop.id, { name: 'Fatou' });
		const omar = await createCustomer(shop.id, { name: 'Omar' });
		const add = (customerId: string, kind: 'purchase' | 'payment_cash', amountXof: number) =>
			addEntry(shop.id, { id: randomUUID(), customerId, kind, amountXof, label: 'Riz 1 kg' });

		expect(await add(fatou.id, 'purchase', 4500)).toBe('created');
		expect(await add(fatou.id, 'purchase', 1500)).toBe('created');
		expect(await add(fatou.id, 'payment_cash', 2000)).toBe('created');
		expect(await add(omar.id, 'payment_cash', 1000)).toBe('created');

		const list = await listCustomers(shop.id);
		expect(list.find((c) => c.id === fatou.id)?.balanceXof).toBe(4000);
		expect(list.find((c) => c.id === omar.id)?.balanceXof).toBe(-1000);

		const entries = await listEntries(fatou.id);
		expect(balanceOf(entries)).toBe(4000);
		expect(annotateSettled(entries).filter((l) => l.settled)).toHaveLength(0);

		const totals = await shopTotals(shop.id);
		expect(totals.owedXof).toBe(4000);
		expect(totals.customersOwing).toBe(1);
	});

	it('are idempotent on the client-generated id', async () => {
		const shop = await makeShop(db);
		const customer = await createCustomer(shop.id, { name: 'Ibou' });
		const entry = {
			id: randomUUID(),
			customerId: customer.id,
			kind: 'purchase' as const,
			amountXof: 750,
			label: 'Sucre'
		};
		expect(await addEntry(shop.id, entry)).toBe('created');
		expect(await addEntry(shop.id, entry)).toBe('duplicate');
		expect(await listEntries(customer.id)).toHaveLength(1);
	});

	it('reject impossible amounts', async () => {
		const shop = await makeShop(db);
		const customer = await createCustomer(shop.id, { name: 'Ibou' });
		const base = { customerId: customer.id, kind: 'purchase' as const, label: '' };
		expect(await addEntry(shop.id, { ...base, id: randomUUID(), amountXof: 0 })).toBe('invalid');
		expect(await addEntry(shop.id, { ...base, id: randomUUID(), amountXof: -5 })).toBe('invalid');
		expect(await addEntry(shop.id, { ...base, id: randomUUID(), amountXof: 1.5 })).toBe('invalid');
		expect(await addEntry(shop.id, { ...base, id: randomUUID(), amountXof: 5e7 })).toBe('invalid');
	});

	it('can be voided and restored, which moves the balance', async () => {
		const shop = await makeShop(db);
		const customer = await createCustomer(shop.id, { name: 'Khady' });
		const id = randomUUID();
		await addEntry(shop.id, {
			id,
			customerId: customer.id,
			kind: 'purchase',
			amountXof: 900,
			label: ''
		});
		expect(await setVoided(shop.id, id, true)).toBe(true);
		expect(balanceOf(await listEntries(customer.id))).toBe(0);
		expect(await setVoided(shop.id, id, false)).toBe(true);
		expect(balanceOf(await listEntries(customer.id))).toBe(900);
	});

	it('learns quick items from what the shop writes most', async () => {
		const shop = await makeShop(db);
		const customer = await createCustomer(shop.id, { name: 'Khady' });
		for (let i = 0; i < 3; i++) {
			await addEntry(shop.id, {
				id: randomUUID(),
				customerId: customer.id,
				kind: 'purchase',
				amountXof: 2885,
				label: 'Gaz 6 kg'
			});
		}
		const items = await quickItems(shop.id);
		expect(items[0]).toEqual({ label: 'Gaz 6 kg', amountXof: 2885 });
		expect(items).toHaveLength(8);
	});
});

describe('accounts', () => {
	const client = 'client-a';

	it('rejects weak PINs', () => {
		for (const pin of [
			'000000',
			'123456',
			'654321',
			'121212',
			'123123',
			'890123',
			'12345',
			'abcdef'
		])
			expect(isWeakPin(pin), pin).toBe(true);
		for (const pin of ['482915', '170394', '905512']) expect(isWeakPin(pin), pin).toBe(false);
	});

	it('signs up, signs in, and keeps the phone number out of the database', async () => {
		const result = await signUp({
			name: 'Boutique Diallo',
			place: 'Médina',
			phone: '77 555 01 01',
			pin: '482915',
			locale: 'fr',
			clientKey: client
		});
		expect(result.ok).toBe(true);

		const rows = await db.query('select * from shops where name = $1', ['Boutique Diallo']);
		expect(JSON.stringify(rows)).not.toContain('5550101');
		expect(JSON.stringify(rows)).not.toContain('482915');

		const again = await signUp({
			name: 'Copy',
			place: '',
			phone: '+221775550101',
			pin: '482915',
			locale: 'fr',
			clientKey: client
		});
		expect(again).toEqual({ ok: false, error: 'phone_taken' });

		const good = await logIn({ phone: '00221 77 555 01 01', pin: '482915', clientKey: client });
		expect(good.ok).toBe(true);
	});

	it('gives the same answer for a wrong PIN and an unknown number', async () => {
		const wrongPin = await logIn({ phone: '775550101', pin: '111222', clientKey: client });
		const unknown = await logIn({ phone: '775559999', pin: '111222', clientKey: client });
		expect(wrongPin).toEqual({ ok: false, error: 'invalid' });
		expect(unknown).toEqual({ ok: false, error: 'invalid' });
	});

	it('locks a number after five wrong PINs, even for the right one', async () => {
		await signUp({
			name: 'Boutique Sow',
			place: '',
			phone: '775550202',
			pin: '482915',
			locale: 'fr',
			clientKey: client
		});
		for (let i = 0; i < 5; i++) {
			await logIn({ phone: '775550202', pin: '999000', clientKey: 'attacker-' + i });
		}
		const locked = await logIn({ phone: '775550202', pin: '482915', clientKey: 'owner' });
		expect(locked.ok).toBe(false);
		expect(locked.ok === false && locked.error).toBe('locked');
	});

	it('runs sessions by hashed token', async () => {
		const shop = await makeShop(db);
		const session = await createSession(shop.id);
		const rows = await db.query('select token_hash from sessions where shop_id = $1', [shop.id]);
		expect(rows[0].token_hash).not.toBe(session.token);

		expect((await readSession(session.token))?.shop.id).toBe(shop.id);
		expect(await readSession(session.token + 'x')).toBeNull();
		expect(await readSession(undefined)).toBeNull();

		await destroySession(session.token);
		expect(await readSession(session.token)).toBeNull();
	});

	it('ignores expired sessions', async () => {
		const shop = await makeShop(db);
		const session = await createSession(shop.id, -1);
		expect(await readSession(session.token)).toBeNull();
	});

	it('confirms the PIN before sensitive changes', async () => {
		const shop = await makeShop(db);
		expect(await confirmPin(shop.id, '482915')).toBe('ok');
		expect(await confirmPin(shop.id, '000111')).toBe('invalid');
	});
});

describe('rate limits', () => {
	it('allow up to the maximum inside a window, then refuse', async () => {
		const limit = { max: 3, windowSeconds: 60 };
		const now = Date.parse('2026-11-16T12:00:10Z');
		const results = [];
		for (let i = 0; i < 4; i++) results.push((await hit('t:one', limit, now)).allowed);
		expect(results).toEqual([true, true, true, false]);
		expect((await peek('t:one', limit, now)).retryAfter).toBe(50);
		expect((await hit('t:one', limit, now + 60_000)).allowed).toBe(true);
		expect((await hit('t:other', limit, now)).allowed).toBe(true);
	});
});
