/**
 * Dates are shown in Dakar time. Senegal is on UTC all year, with no daylight
 * saving, so UTC fields are the local wall clock and no time-zone database is
 * needed. Formatting by hand keeps server and browser output identical.
 */
import type { Locale } from './money.ts';

const MONTHS: Record<Locale, string[]> = {
	fr: [
		'janvier',
		'février',
		'mars',
		'avril',
		'mai',
		'juin',
		'juillet',
		'août',
		'septembre',
		'octobre',
		'novembre',
		'décembre'
	],
	en: [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	]
};

const two = (n: number) => String(n).padStart(2, '0');

function toDate(value: string | Date): Date {
	return value instanceof Date ? value : new Date(value);
}

/** `12/11`, the way a date is jotted in the margin of a notebook. */
export function marginDate(value: string | Date): string {
	const d = toDate(value);
	return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}`;
}

/** `12 novembre 2026` */
export function longDate(value: string | Date, locale: Locale = 'fr'): string {
	const d = toDate(value);
	return `${d.getUTCDate()} ${MONTHS[locale][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `14:05` */
export function clockTime(value: string | Date): string {
	const d = toDate(value);
	return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** `2026-11-12`, for date inputs and CSV. */
export function isoDay(value: string | Date): string {
	return toDate(value).toISOString().slice(0, 10);
}
