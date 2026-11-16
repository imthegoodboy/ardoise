/**
 * Ledger entries: purchases taken on credit and payments against them.
 *
 * Entry ids come from the client. Writing the same id twice is a no-op, so a
 * double tap, a retry on a bad connection or an offline queue flushing twice
 * can never put the same line on a tab twice.
 */
import type { EntryKind, LedgerEntry } from '../ledger.ts';
import { MAX_ENTRY_XOF } from '../money.ts';
import { open } from './crypto.ts';
import { getDb, type Queryable, type Row } from './db/index.ts';

export interface NewEntry {
	id: string;
	customerId: string;
	kind: 'purchase' | 'payment_cash';
	amountXof: number;
	label: string;
	/** Defaults to now. May be in the past (imported notebook pages), never the future. */
	occurredAt?: Date;
}

export type AddEntryResult = 'created' | 'duplicate' | 'unknown_customer' | 'invalid';

export function toLedgerEntry(row: Row): LedgerEntry {
	const entry: LedgerEntry = {
		id: row.id,
		kind: row.kind as EntryKind,
		amountXof: row.amount_xof,
		label: row.label,
		occurredAt: (row.occurred_at as Date).toISOString(),
		voided: row.voided_at !== null
	};
	if (row.receipt_id) {
		entry.receiptId = row.receipt_id;
		// Same context string as invoices.payerContext; kept literal to avoid an import cycle.
		entry.payerName = row.payer_name_sealed
			? open(row.payer_name_sealed, 'invoices.payer:' + row.invoice_id)
			: null;
	}
	return entry;
}

export async function addEntry(
	shopId: string,
	entry: NewEntry,
	q?: Queryable
): Promise<AddEntryResult> {
	if (!Number.isInteger(entry.amountXof) || entry.amountXof < 1) return 'invalid';
	if (entry.amountXof > MAX_ENTRY_XOF) return 'invalid';

	const db = q ?? (await getDb());
	let occurredAt = entry.occurredAt ?? new Date();
	if (occurredAt.getTime() > Date.now() + 60_000) occurredAt = new Date();

	// The customer check is part of the insert, so the entry can only land on a
	// tab that belongs to this shop.
	const rows = await db.query(
		`insert into entries (id, shop_id, customer_id, kind, amount_xof, label, occurred_at)
		 select $1::uuid, c.shop_id, c.id, $4::text, $5::int, $6::text, $7::timestamptz
		 from customers c
		 where c.id = $3::uuid and c.shop_id = $2::uuid and c.archived_at is null
		 on conflict (id) do nothing
		 returning id`,
		[
			entry.id,
			shopId,
			entry.customerId,
			entry.kind,
			entry.amountXof,
			entry.label.slice(0, 80),
			occurredAt.toISOString()
		]
	);
	if (rows.length) return 'created';

	const existing = await db.query('select 1 from entries where id = $1 and shop_id = $2', [
		entry.id,
		shopId
	]);
	return existing.length ? 'duplicate' : 'unknown_customer';
}

/**
 * Cross a line out as a mistake. Lightning payments cannot be voided: they are
 * backed by a real payment the shop has already received.
 */
export async function setVoided(
	shopId: string,
	customerId: string,
	entryId: string,
	voided: boolean
): Promise<boolean> {
	const db = await getDb();
	const rows = await db.query(
		`update entries set voided_at = case when $3 then now() else null end
		 where id = $1 and shop_id = $2 and customer_id = $4 and kind <> 'payment_lightning'
		 returning id`,
		[entryId, shopId, voided, customerId]
	);
	return rows.length > 0;
}

export async function listEntries(customerId: string, q?: Queryable): Promise<LedgerEntry[]> {
	const db = q ?? (await getDb());
	const rows = await db.query(
		`select e.id, e.kind, e.amount_xof, e.label, e.occurred_at, e.voided_at, e.invoice_id,
		        i.public_id as receipt_id, i.payer_name_sealed
		 from entries e
		 left join invoices i on i.id = e.invoice_id
		 where e.customer_id = $1
		 order by e.occurred_at, e.id`,
		[customerId]
	);
	return rows.map(toLedgerEntry);
}

export interface ShopTotals {
	/** Sum of what every customer with a debt owes. */
	owedXof: number;
	customersOwing: number;
	/** Lightning payments received in the last 30 days. */
	lightningXof30d: number;
	lightningCount30d: number;
}

export async function shopTotals(shopId: string): Promise<ShopTotals> {
	const db = await getDb();
	const [owed] = await db.query<{ owed: number; owing: number }>(
		`select coalesce(sum(greatest(balance, 0)), 0)::float8 as owed,
		        count(*) filter (where balance > 0)::int as owing
		 from (
			select sum(case when e.kind = 'purchase' then e.amount_xof else -e.amount_xof end) as balance
			from entries e
			join customers c on c.id = e.customer_id and c.archived_at is null
			where e.shop_id = $1 and e.voided_at is null
			group by e.customer_id
		 ) t`,
		[shopId]
	);
	const [lightning] = await db.query<{ total: number; n: number }>(
		`select coalesce(sum(amount_xof), 0)::float8 as total, count(*)::int as n
		 from entries
		 where shop_id = $1 and kind = 'payment_lightning'
		   and occurred_at > now() - interval '30 days'`,
		[shopId]
	);
	return {
		owedXof: owed.owed,
		customersOwing: owed.owing,
		lightningXof30d: lightning.total,
		lightningCount30d: lightning.n
	};
}

export interface QuickItem {
	label: string;
	amountXof: number;
}

/** What a Dakar boutique sells all day, at 2026 street prices. */
export const DEFAULT_QUICK_ITEMS: QuickItem[] = [
	{ label: 'Pain', amountXof: 150 },
	{ label: 'Lait en poudre', amountXof: 100 },
	{ label: 'Sucre 1 kg', amountXof: 650 },
	{ label: 'Riz 1 kg', amountXof: 450 },
	{ label: 'Huile 1 L', amountXof: 1200 },
	{ label: 'Café Touba', amountXof: 100 },
	{ label: 'Savon', amountXof: 350 },
	{ label: 'Crédit téléphone', amountXof: 500 }
];

/**
 * The one-tap buttons on the "add purchase" sheet: what this shop actually
 * writes down most often, topped up with the usual staples while it is new.
 */
export async function quickItems(shopId: string, limit = 8): Promise<QuickItem[]> {
	const db = await getDb();
	const rows = await db.query<{ label: string; amount_xof: number }>(
		`select label, amount_xof
		 from entries
		 where shop_id = $1 and kind = 'purchase' and voided_at is null and label <> ''
		   and created_at > now() - interval '90 days'
		 group by label, amount_xof
		 having count(*) >= 2
		 order by count(*) desc, max(created_at) desc
		 limit $2`,
		[shopId, limit]
	);
	const items: QuickItem[] = rows.map((row) => ({ label: row.label, amountXof: row.amount_xof }));
	for (const item of DEFAULT_QUICK_ITEMS) {
		if (items.length >= limit) break;
		if (!items.some((existing) => existing.label.toLowerCase() === item.label.toLowerCase())) {
			items.push(item);
		}
	}
	return items;
}

/** Every entry of a shop, flattened for the CSV export. */
export async function exportEntries(shopId: string): Promise<
	{
		customerId: string;
		kind: EntryKind;
		amountXof: number;
		label: string;
		occurredAt: Date;
		voided: boolean;
	}[]
> {
	const db = await getDb();
	const rows = await db.query(
		`select customer_id, kind, amount_xof, label, occurred_at, voided_at
		 from entries where shop_id = $1
		 order by occurred_at, id`,
		[shopId]
	);
	return rows.map((row) => ({
		customerId: row.customer_id,
		kind: row.kind,
		amountXof: row.amount_xof,
		label: row.label,
		occurredAt: row.occurred_at,
		voided: row.voided_at !== null
	}));
}

export interface RecentPayment {
	entryId: string;
	customerId: string;
	customerName: string;
	amountXof: number;
	payerName: string | null;
	receiptId: string | null;
	at: string;
}

/** Lightning payments written after `since`: what the shop app announces as they land. */
export async function recentLightningPayments(
	shopId: string,
	since: Date,
	limit = 5
): Promise<RecentPayment[]> {
	const db = await getDb();
	const rows = await db.query(
		`select e.id, e.customer_id, e.amount_xof, e.created_at, e.invoice_id,
		        c.name_sealed, i.public_id, i.payer_name_sealed
		 from entries e
		 join customers c on c.id = e.customer_id
		 left join invoices i on i.id = e.invoice_id
		 where e.shop_id = $1 and e.kind = 'payment_lightning' and e.created_at > $2::timestamptz
		 order by e.created_at desc
		 limit $3`,
		[shopId, since.toISOString(), limit]
	);
	return rows.map((row) => ({
		entryId: row.id,
		customerId: row.customer_id,
		customerName: open(row.name_sealed, 'customers.name:' + row.customer_id),
		amountXof: row.amount_xof,
		payerName: row.payer_name_sealed
			? open(row.payer_name_sealed, 'invoices.payer:' + row.invoice_id)
			: null,
		receiptId: row.public_id ?? null,
		at: (row.created_at as Date).toISOString()
	}));
}
