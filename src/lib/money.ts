/**
 * Money helpers shared by the server and the browser.
 *
 * Amounts are whole CFA francs (XOF has no minor unit) and whole satoshis.
 * Formatting is done by hand instead of with Intl so that the server, an old
 * Android WebView and a new iPhone all print exactly the same characters.
 */

export type Locale = 'fr' | 'en';

/** The CFA franc is pegged to the euro at a fixed, legally defined parity. */
export const XOF_PER_EUR = 655.957;

export const SATS_PER_BTC = 100_000_000;

/** Smallest and largest amount a single Lightning payment may be asked for. */
export const MIN_PAYMENT_XOF = 100;
export const MAX_PAYMENT_XOF = 500_000;

/** Largest single line a shopkeeper can write. Catches a slipped extra zero. */
export const MAX_ENTRY_XOF = 2_000_000;

const NARROW_NBSP = ' ';
const NBSP = ' ';

function group(value: number, separator: string): string {
	const digits = String(Math.abs(Math.trunc(value)));
	let out = '';
	for (let i = 0; i < digits.length; i++) {
		if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
		out += digits[i];
	}
	return (value < 0 ? '-' : '') + out;
}

export function formatNumber(value: number, locale: Locale = 'fr'): string {
	return group(value, locale === 'fr' ? NARROW_NBSP : ',');
}

/** `12 500 F` in the ledger; pass `long` for `12 500 FCFA` where a stranger reads it. */
export function formatXof(amount: number, locale: Locale = 'fr', long = false): string {
	return formatNumber(amount, locale) + NBSP + (long ? 'FCFA' : 'F');
}

export function formatSats(sats: number, locale: Locale = 'fr'): string {
	return formatNumber(sats, locale) + NBSP + 'sats';
}

/** Euro equivalent at the fixed parity, for relatives who think in euros. */
export function xofToEurCents(xof: number): number {
	return Math.round((xof / XOF_PER_EUR) * 100);
}

export function formatEur(cents: number, locale: Locale = 'fr'): string {
	const whole = Math.trunc(Math.abs(cents) / 100);
	const rest = String(Math.abs(cents) % 100).padStart(2, '0');
	const sign = cents < 0 ? '-' : '';
	return locale === 'fr'
		? `${sign}${group(whole, NARROW_NBSP)},${rest}${NBSP}€`
		: `${sign}€${group(whole, ',')}.${rest}`;
}

/**
 * Read an amount the way people type it: `12500`, `12 500`, `12.500`, `12 500 F`.
 * Returns null for anything that is not a positive whole number of francs.
 */
export function parseAmount(input: unknown): number | null {
	if (typeof input === 'number') {
		return Number.isSafeInteger(input) && input > 0 ? input : null;
	}
	if (typeof input !== 'string') return null;
	let text = input
		.trim()
		.replace(/[\s\u00a0\u202f]/g, '')
		.replace(/(f\.?cfa|cfa|xof|f)$/i, '');
	if (/^\d{1,3}([.,]\d{3})+$/.test(text)) text = text.replace(/[.,]/g, '');
	if (!/^\d{1,9}$/.test(text)) return null;
	const value = Number(text);
	return value > 0 ? value : null;
}

/** Convert francs to satoshis at a given rate. Never returns less than 1 sat. */
export function xofToSats(xof: number, xofPerBtc: number): number {
	if (!(xofPerBtc > 0)) throw new Error('Invalid exchange rate');
	return Math.max(1, Math.round((xof / xofPerBtc) * SATS_PER_BTC));
}
