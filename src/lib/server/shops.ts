/**
 * Shops: one row per boutique. The wallet connection string is the most
 * sensitive thing Ardoise holds, so it only ever leaves this module decrypted
 * through `walletSecret`, and is never part of the `Shop` object passed around.
 */
import { randomUUID } from 'node:crypto';
import type { Locale } from '../money.ts';
import { open, seal } from './crypto.ts';
import { getDb, type Queryable, type Row } from './db/index.ts';

export type WalletKind = 'none' | 'nwc' | 'demo';

export interface Shop {
	id: string;
	name: string;
	place: string;
	locale: Locale;
	walletKind: WalletKind;
	walletLabel: string | null;
	walletConnectedAt: Date | null;
	isDemo: boolean;
	createdAt: Date;
}

export const SHOP_COLUMNS = `s.id, s.name, s.place, s.locale, s.wallet_kind, s.wallet_label,
	s.wallet_connected_at, s.is_demo, s.created_at`;

export function toShop(row: Row): Shop {
	return {
		id: row.id,
		name: row.name,
		place: row.place,
		locale: row.locale === 'en' ? 'en' : 'fr',
		walletKind: row.wallet_kind,
		walletLabel: row.wallet_label,
		walletConnectedAt: row.wallet_connected_at,
		isDemo: row.is_demo,
		createdAt: row.created_at
	};
}

export interface NewShop {
	name: string;
	place: string;
	phoneHmac: string;
	pinHash: string;
	locale: Locale;
	isDemo?: boolean;
}

export async function insertShop(q: Queryable, input: NewShop): Promise<Shop> {
	const rows = await q.query(
		`insert into shops as s (id, name, place, phone_hmac, pin_hash, locale, is_demo)
		 values ($1, $2, $3, $4, $5, $6, $7)
		 returning ${SHOP_COLUMNS}`,
		[
			randomUUID(),
			input.name,
			input.place,
			input.phoneHmac,
			input.pinHash,
			input.locale,
			input.isDemo ?? false
		]
	);
	return toShop(rows[0]);
}

export async function getShop(id: string): Promise<Shop | null> {
	const db = await getDb();
	const rows = await db.query(`select ${SHOP_COLUMNS} from shops s where s.id = $1`, [id]);
	return rows[0] ? toShop(rows[0]) : null;
}

export async function updateShop(
	id: string,
	patch: { name?: string; place?: string; locale?: Locale }
): Promise<void> {
	const db = await getDb();
	await db.query(
		`update shops set
			name = coalesce($2, name),
			place = coalesce($3, place),
			locale = coalesce($4, locale)
		 where id = $1`,
		[id, patch.name ?? null, patch.place ?? null, patch.locale ?? null]
	);
}

const walletContext = (shopId: string) => 'shops.wallet_secret:' + shopId;

export async function setWallet(
	shopId: string,
	wallet: { kind: 'nwc' | 'demo'; secret: string | null; label: string },
	q?: Queryable
): Promise<void> {
	const db = q ?? (await getDb());
	await db.query(
		`update shops set wallet_kind = $2, wallet_secret = $3, wallet_label = $4,
			wallet_connected_at = now()
		 where id = $1`,
		[
			shopId,
			wallet.kind,
			wallet.secret ? seal(wallet.secret, walletContext(shopId)) : null,
			wallet.label
		]
	);
}

export async function clearWallet(shopId: string): Promise<void> {
	const db = await getDb();
	await db.query(
		`update shops set wallet_kind = 'none', wallet_secret = null, wallet_label = null,
			wallet_connected_at = null
		 where id = $1`,
		[shopId]
	);
}

/** The decrypted wallet connection. Call only at the moment it is needed. */
export async function walletSecret(shopId: string): Promise<string | null> {
	const db = await getDb();
	const rows = await db.query<{ wallet_secret: string | null }>(
		'select wallet_secret from shops where id = $1',
		[shopId]
	);
	const sealed = rows[0]?.wallet_secret;
	return sealed ? open(sealed, walletContext(shopId)) : null;
}

/** Delete a shop and, through cascading foreign keys, everything it owns. */
export async function deleteShop(shopId: string): Promise<void> {
	const db = await getDb();
	await db.query('delete from shops where id = $1', [shopId]);
}
