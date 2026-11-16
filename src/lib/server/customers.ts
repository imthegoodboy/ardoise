/**
 * Customers and their tabs. Names and phone numbers are encrypted at rest;
 * every query is scoped by shop id so one shop can never read another's tab.
 */
import { randomUUID } from 'node:crypto';
import { open, randomToken, seal } from './crypto.ts';
import { getDb, type Queryable, type Row } from './db/index.ts';

export interface Customer {
	id: string;
	shopId: string;
	name: string;
	phone: string | null;
	payToken: string;
	creditLimitXof: number | null;
	archived: boolean;
	createdAt: Date;
}

export interface CustomerSummary extends Customer {
	/** What they owe. Negative when they have paid ahead. */
	balanceXof: number;
	lastActivityAt: Date | null;
}

const nameContext = (id: string) => 'customers.name:' + id;
const phoneContext = (id: string) => 'customers.phone:' + id;

function toCustomer(row: Row): Customer {
	return {
		id: row.id,
		shopId: row.shop_id,
		name: open(row.name_sealed, nameContext(row.id)),
		phone: row.phone_sealed ? open(row.phone_sealed, phoneContext(row.id)) : null,
		payToken: row.pay_token,
		creditLimitXof: row.credit_limit_xof,
		archived: row.archived_at !== null,
		createdAt: row.created_at
	};
}

/** 128 bits of randomness: short enough for a WhatsApp message, impossible to guess. */
const newPayToken = () => randomToken(16);

export interface CustomerInput {
	name: string;
	phone?: string | null;
	creditLimitXof?: number | null;
}

export async function createCustomer(
	shopId: string,
	input: CustomerInput,
	q?: Queryable
): Promise<Customer> {
	const db = q ?? (await getDb());
	const id = randomUUID();
	const rows = await db.query(
		`insert into customers (id, shop_id, name_sealed, phone_sealed, pay_token, credit_limit_xof)
		 values ($1, $2, $3, $4, $5, $6)
		 returning *`,
		[
			id,
			shopId,
			seal(input.name, nameContext(id)),
			input.phone ? seal(input.phone, phoneContext(id)) : null,
			newPayToken(),
			input.creditLimitXof ?? null
		]
	);
	return toCustomer(rows[0]);
}

const BALANCE = `coalesce(sum(
	case when e.voided_at is not null then 0
	     when e.kind = 'purchase' then e.amount_xof
	     else -e.amount_xof end
), 0)::float8`;

export async function listCustomers(shopId: string): Promise<CustomerSummary[]> {
	const db = await getDb();
	const rows = await db.query(
		`select c.*, ${BALANCE} as balance_xof, max(e.occurred_at) as last_activity_at
		 from customers c
		 left join entries e on e.customer_id = c.id
		 where c.shop_id = $1 and c.archived_at is null
		 group by c.id
		 order by max(e.occurred_at) desc nulls last, c.created_at desc`,
		[shopId]
	);
	return rows.map((row) => ({
		...toCustomer(row),
		balanceXof: row.balance_xof,
		lastActivityAt: row.last_activity_at
	}));
}

export async function getCustomer(shopId: string, id: string): Promise<Customer | null> {
	const db = await getDb();
	const rows = await db.query('select * from customers where id = $1 and shop_id = $2', [
		id,
		shopId
	]);
	return rows[0] ? toCustomer(rows[0]) : null;
}

/** Resolve a public pay link. Archived tabs no longer answer. */
export async function getCustomerByPayToken(token: string): Promise<Customer | null> {
	if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
	const db = await getDb();
	const rows = await db.query(
		'select * from customers where pay_token = $1 and archived_at is null',
		[token]
	);
	return rows[0] ? toCustomer(rows[0]) : null;
}

export async function updateCustomer(
	shopId: string,
	id: string,
	input: CustomerInput
): Promise<boolean> {
	const db = await getDb();
	const rows = await db.query(
		`update customers set name_sealed = $3, phone_sealed = $4, credit_limit_xof = $5
		 where id = $1 and shop_id = $2
		 returning id`,
		[
			id,
			shopId,
			seal(input.name, nameContext(id)),
			input.phone ? seal(input.phone, phoneContext(id)) : null,
			input.creditLimitXof ?? null
		]
	);
	return rows.length > 0;
}

export async function setArchived(shopId: string, id: string, archived: boolean): Promise<boolean> {
	const db = await getDb();
	const rows = await db.query(
		`update customers set archived_at = case when $3 then now() else null end
		 where id = $1 and shop_id = $2
		 returning id`,
		[id, shopId, archived]
	);
	return rows.length > 0;
}

/**
 * Replace the pay link. The old link stops working at once, which is how a
 * shopkeeper takes a tab back if a link was forwarded to the wrong person.
 */
export async function rotatePayToken(shopId: string, id: string): Promise<string | null> {
	const db = await getDb();
	const rows = await db.query<{ pay_token: string }>(
		'update customers set pay_token = $3 where id = $1 and shop_id = $2 returning pay_token',
		[id, shopId, newPayToken()]
	);
	return rows[0]?.pay_token ?? null;
}

export async function countCustomers(shopId: string): Promise<number> {
	const db = await getDb();
	const rows = await db.query<{ n: number }>(
		'select count(*)::int as n from customers where shop_id = $1',
		[shopId]
	);
	return rows[0].n;
}

/** Every customer of a shop, archived ones included: for the export. */
export async function listAllCustomers(shopId: string): Promise<Customer[]> {
	const db = await getDb();
	const rows = await db.query('select * from customers where shop_id = $1 order by created_at', [
		shopId
	]);
	return rows.map(toCustomer);
}
