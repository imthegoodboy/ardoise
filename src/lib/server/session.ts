import type { Cookies } from '@sveltejs/kit';
import type { Locale } from '#lib/money.ts';
import { createSession, destroySession, SESSION_COOKIE } from './auth.ts';

export const LOCALE_COOKIE = 'lang';

export function setSessionCookie(cookies: Cookies, token: string, expires: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires
	});
}

export async function startSession(cookies: Cookies, shopId: string, days?: number) {
	const session = await createSession(shopId, days);
	setSessionCookie(cookies, session.token, session.expiresAt);
}

export async function endSession(cookies: Cookies) {
	await destroySession(cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function setLocaleCookie(cookies: Cookies, locale: Locale) {
	cookies.set(LOCALE_COOKIE, locale, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
}

/** Only same-site paths are accepted as "where to go next" (no open redirect). */
export function safeNext(value: string | null | undefined, fallback = '/app'): string {
	// Browsers drop tabs and newlines from a Location header, so `/<TAB>/evil.example`
	// would become `//evil.example`: refuse every control character and backslash.
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\p{Cc}]/u.test(value)) {
		return fallback;
	}
	return value;
}
