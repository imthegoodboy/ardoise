/**
 * Two languages, both bundled: French (how shops in Dakar write) and English
 * (for family in the anglophone diaspora). They weigh a few kilobytes, which
 * is cheaper than a second request on a slow network.
 */
import type { Locale } from '../money.ts';
import { en } from './en.ts';
import { fr, type MessageKey } from './fr.ts';

export type { MessageKey };
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export const messages: Record<Locale, Record<MessageKey, string>> = { fr, en };
export const locales: Locale[] = ['fr', 'en'];

function fill(template: string, vars?: Vars): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in vars ? String(vars[name]) : match
	);
}

export function makeT(locale: Locale): Translate {
	const table = messages[locale] ?? fr;
	return (key, vars) => fill(table[key] ?? fr[key] ?? key, vars);
}

/** Picks the `.one` or `.other` form of a key. */
export function plural(
	t: Translate,
	count: number,
	one: MessageKey,
	other: MessageKey,
	vars: Vars = {}
): string {
	return t(count === 1 ? one : other, { n: count, ...vars });
}
