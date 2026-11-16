import { describe, expect, it } from 'vitest';
import { makeT, messages, plural } from './index.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
	it('has the same keys and placeholders in every language', () => {
		const reference = messages.fr;
		for (const [locale, table] of Object.entries(messages)) {
			expect(Object.keys(table).sort(), locale).toEqual(Object.keys(reference).sort());
			for (const key of Object.keys(reference) as (keyof typeof reference)[]) {
				expect(placeholders(table[key]), `${locale} ${key}`).toEqual(placeholders(reference[key]));
				expect(table[key].trim().length, `${locale} ${key}`).toBeGreaterThan(0);
			}
		}
	});

	it('fills placeholders and plurals', () => {
		const t = makeT('en');
		expect(t('pay.title', { name: 'Awa' })).toBe('Awa’s tab');
		expect(plural(t, 1, 'book.customersOwing.one', 'book.customersOwing.other')).toBe(
			'1 customer owes money'
		);
		expect(plural(makeT('fr'), 3, 'book.customersOwing.one', 'book.customersOwing.other')).toBe(
			'3 clients doivent de l’argent'
		);
	});
});
