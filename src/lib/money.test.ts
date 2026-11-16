import { describe, expect, it } from 'vitest';
import {
	formatEur,
	formatSats,
	formatXof,
	parseAmount,
	xofToEurCents,
	xofToSats
} from './money.ts';

describe('formatXof', () => {
	it('groups thousands with a narrow no-break space in French', () => {
		expect(formatXof(12500, 'fr')).toBe('12 500 F');
		expect(formatXof(1250000, 'fr')).toBe('1 250 000 F');
		expect(formatXof(950, 'fr')).toBe('950 F');
	});

	it('uses commas in English and can spell out the currency', () => {
		expect(formatXof(12500, 'en')).toBe('12,500 F');
		expect(formatXof(12500, 'en', true)).toBe('12,500 FCFA');
	});

	it('keeps the sign of an advance', () => {
		expect(formatXof(-2000, 'fr')).toBe('-2 000 F');
	});
});

describe('formatSats and formatEur', () => {
	it('formats satoshis', () => {
		expect(formatSats(21034, 'fr')).toBe('21 034 sats');
	});

	it('converts at the fixed euro parity', () => {
		expect(xofToEurCents(655957)).toBe(100000);
		expect(formatEur(xofToEurCents(12500), 'fr')).toBe('19,06 €');
		expect(formatEur(xofToEurCents(12500), 'en')).toBe('€19.06');
	});
});

describe('parseAmount', () => {
	it.each([
		['12500', 12500],
		['12 500', 12500],
		['12 500', 12500],
		['12.500', 12500],
		['12,500', 12500],
		['1.250.000', 1250000],
		['12 500 F', 12500],
		['12500 FCFA', 12500],
		[' 750 ', 750],
		[300, 300]
	])('reads %j as %d', (input, expected) => {
		expect(parseAmount(input)).toBe(expected);
	});

	it.each(['', '0', '-500', '12.5', '1,5', 'abc', '12e3', '9999999999', null, 12.5, NaN])(
		'rejects %j',
		(input) => {
			expect(parseAmount(input)).toBeNull();
		}
	);
});

describe('xofToSats', () => {
	it('rounds to the nearest satoshi', () => {
		// 60,000,000 F per bitcoin: 1 F is 1.6667 sats
		expect(xofToSats(12500, 60_000_000)).toBe(20833);
		expect(xofToSats(100, 60_000_000)).toBe(167);
	});

	it('never asks for zero', () => {
		expect(xofToSats(1, 6e12)).toBe(1);
	});

	it('refuses a nonsense rate', () => {
		expect(() => xofToSats(1000, 0)).toThrow();
		expect(() => xofToSats(1000, NaN)).toThrow();
	});
});
