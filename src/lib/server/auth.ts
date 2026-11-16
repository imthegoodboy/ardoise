/**
 * Accounts and sessions.
 *
 * A shopkeeper signs in with their phone number and a 6-digit PIN: no e-mail,
 * no password rules to remember. Because a PIN is short, everything around it
 * is strict: scrypt with a server-side pepper, lockout after five wrong tries,
 * the phone number itself stored only as a keyed hash.
 */
import type { Locale } from '../money.ts';
import { normalizePhone } from '../phone.ts';
import { hashPin, lookupHash, randomToken, sha256Hex, verifyPin } from './crypto.ts';
import { getDb } from './db/index.ts';
import { hit, peek, reset, type Limit } from './ratelimit.ts';
import { insertShop, SHOP_COLUMNS, toShop, type Shop } from './shops.ts';

export const SESSION_COOKIE = 'ardoise_session';
const SESSION_DAYS = 60;
const DAY_MS = 86_400_000;

/** Wrong PINs allowed per phone number before it is locked for the window. */
const PIN_TRIES: Limit = { max: 5, windowSeconds: 15 * 60 };
/** Sign-in attempts allowed per network address, right or wrong. */
const LOGIN_PER_CLIENT: Limit = { max: 30, windowSeconds: 15 * 60 };
const SIGNUP_PER_CLIENT: Limit = { max: 6, windowSeconds: 60 * 60 };

/** A hash to verify against when the phone number is unknown, so timing gives nothing away. */
let decoyHash: Promise<string> | undefined;

export function isValidPin(pin: string): boolean {
	return /^\d{6}$/.test(pin);
}

/** PINs a thief would try first: 000000, 123456, 654321, 121212, 123123... */
export function isWeakPin(pin: string): boolean {
	if (!isValidPin(pin)) return true;
	const d = [...pin].map(Number);
	if (d.every((x) => x === d[0])) return true;
	if (d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10)) return true;
	if (d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10)) return true;
	if (pin.slice(0, 2).repeat(3) === pin) return true;
	if (pin.slice(0, 3).repeat(2) === pin) return true;
	return false;
}

export type SignUpResult =
	| { ok: true; shop: Shop }
	| {
			ok: false;
			error: 'phone_invalid' | 'phone_taken' | 'pin_invalid' | 'pin_weak' | 'slow_down';
	  };

export async function signUp(input: {
	name: string;
	place: string;
	phone: string;
	pin: string;
	locale: Locale;
	clientKey: string;
}): Promise<SignUpResult> {
	const phone = normalizePhone(input.phone);
	if (!phone) return { ok: false, error: 'phone_invalid' };
	if (!isValidPin(input.pin)) return { ok: false, error: 'pin_invalid' };
	if (isWeakPin(input.pin)) return { ok: false, error: 'pin_weak' };

	const limit = await hit('signup:' + input.clientKey, SIGNUP_PER_CLIENT);
	if (!limit.allowed) return { ok: false, error: 'slow_down' };

	const db = await getDb();
	const phoneHmac = lookupHash(phone, 'phone');
	const existing = await db.query('select 1 from shops where phone_hmac = $1', [phoneHmac]);
	if (existing.length) return { ok: false, error: 'phone_taken' };

	const pinHash = await hashPin(input.pin);
	try {
		const shop = await insertShop(db, {
			name: input.name,
			place: input.place,
			phoneHmac,
			pinHash,
			locale: input.locale
		});
		return { ok: true, shop };
	} catch (err) {
		// Two sign-ups for the same number racing each other: the unique index decides.
		if ((err as { code?: string }).code === '23505') return { ok: false, error: 'phone_taken' };
		throw err;
	}
}

export type LogInResult =
	{ ok: true; shop: Shop } | { ok: false; error: 'invalid' | 'locked'; retryAfter?: number };

export async function logIn(input: {
	phone: string;
	pin: string;
	clientKey: string;
}): Promise<LogInResult> {
	const client = await hit('login:' + input.clientKey, LOGIN_PER_CLIENT);
	if (!client.allowed) return { ok: false, error: 'locked', retryAfter: client.retryAfter };

	const phone = normalizePhone(input.phone);
	if (!phone || !isValidPin(input.pin)) return { ok: false, error: 'invalid' };

	const phoneHmac = lookupHash(phone, 'phone');
	const triesKey = 'pin:' + phoneHmac.slice(0, 32);
	const tries = await peek(triesKey, PIN_TRIES);
	if (!tries.allowed) return { ok: false, error: 'locked', retryAfter: tries.retryAfter };

	const db = await getDb();
	const rows = await db.query(
		`select ${SHOP_COLUMNS}, s.pin_hash from shops s where s.phone_hmac = $1 and not s.is_demo`,
		[phoneHmac]
	);
	const row = rows[0];

	decoyHash ??= hashPin('decoy-' + randomToken(8));
	const matches = await verifyPin(input.pin, row ? row.pin_hash : await decoyHash);

	if (!row || !matches) {
		await hit(triesKey, PIN_TRIES);
		return { ok: false, error: 'invalid' };
	}
	await reset(triesKey);
	return { ok: true, shop: toShop(row) };
}

/** Ask for the PIN again before a sensitive change (the wallet, deleting the shop). */
export async function confirmPin(
	shopId: string,
	pin: string
): Promise<'ok' | 'invalid' | 'locked'> {
	const triesKey = 'pin-confirm:' + shopId;
	const tries = await peek(triesKey, PIN_TRIES);
	if (!tries.allowed) return 'locked';

	const db = await getDb();
	const rows = await db.query<{ pin_hash: string }>('select pin_hash from shops where id = $1', [
		shopId
	]);
	if (!rows[0] || !isValidPin(pin) || !(await verifyPin(pin, rows[0].pin_hash))) {
		await hit(triesKey, PIN_TRIES);
		return 'invalid';
	}
	await reset(triesKey);
	return 'ok';
}

export async function changePin(shopId: string, newPin: string): Promise<void> {
	const db = await getDb();
	await db.query('update shops set pin_hash = $2 where id = $1', [shopId, await hashPin(newPin)]);
}

export interface NewSession {
	token: string;
	expiresAt: Date;
}

export async function createSession(shopId: string, days = SESSION_DAYS): Promise<NewSession> {
	const db = await getDb();
	const token = randomToken(32);
	const expiresAt = new Date(Date.now() + days * DAY_MS);
	await db.query(
		'insert into sessions (token_hash, shop_id, expires_at) values ($1, $2, $3::timestamptz)',
		[sha256Hex(token), shopId, expiresAt.toISOString()]
	);
	return { token, expiresAt };
}

export interface ActiveSession {
	shop: Shop;
	/** Set when the session was extended and the cookie should be re-issued. */
	renewedUntil: Date | null;
}

/** Resolve a session cookie to its shop. Sessions slide forward while in use. */
export async function readSession(token: string | undefined): Promise<ActiveSession | null> {
	if (!token || token.length < 20 || token.length > 100) return null;
	const db = await getDb();
	const tokenHash = sha256Hex(token);
	const rows = await db.query(
		`select ${SHOP_COLUMNS}, x.last_seen_at as session_seen
		 from sessions x join shops s on s.id = x.shop_id
		 where x.token_hash = $1 and x.expires_at > now()`,
		[tokenHash]
	);
	const row = rows[0];
	if (!row) return null;

	let renewedUntil: Date | null = null;
	const seen: Date = row.session_seen;
	if (Date.now() - seen.getTime() > DAY_MS && !row.is_demo) {
		renewedUntil = new Date(Date.now() + SESSION_DAYS * DAY_MS);
		await db.query(
			`update sessions set last_seen_at = now(), expires_at = $2::timestamptz
			 where token_hash = $1`,
			[tokenHash, renewedUntil.toISOString()]
		);
	}
	return { shop: toShop(row), renewedUntil };
}

export async function destroySession(token: string | undefined): Promise<void> {
	if (!token) return;
	const db = await getDb();
	await db.query('delete from sessions where token_hash = $1', [sha256Hex(token)]);
}

/** Sign the shop out everywhere, e.g. after its PIN changes. */
export async function destroyAllSessions(shopId: string): Promise<void> {
	const db = await getDb();
	await db.query('delete from sessions where shop_id = $1', [shopId]);
}

export async function sweepSessions(): Promise<void> {
	const db = await getDb();
	await db.query('delete from sessions where expires_at < now()');
}
