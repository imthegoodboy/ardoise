import { describe, expect, it } from 'vitest';
import { annotateSettled, balanceOf, openLines, type LedgerEntry } from './ledger.ts';

let n = 0;
function entry(kind: LedgerEntry['kind'], amountXof: number, day: number, voided = false) {
	n += 1;
	return {
		id: 'e' + String(n).padStart(3, '0'),
		kind,
		amountXof,
		label: '',
		occurredAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`,
		voided
	} satisfies LedgerEntry;
}

describe('balanceOf', () => {
	it('is purchases minus payments, ignoring voided lines', () => {
		const entries = [
			entry('purchase', 1500, 1),
			entry('purchase', 500, 2),
			entry('purchase', 9000, 2, true),
			entry('payment_cash', 700, 3),
			entry('payment_lightning', 300, 4)
		];
		expect(balanceOf(entries)).toBe(1000);
	});

	it('goes negative when the customer has paid ahead', () => {
		expect(balanceOf([entry('purchase', 500, 1), entry('payment_cash', 2000, 2)])).toBe(-1500);
	});
});

describe('annotateSettled', () => {
	it('strikes the oldest purchases first', () => {
		const lines = annotateSettled([
			entry('purchase', 1000, 1),
			entry('purchase', 2000, 2),
			entry('purchase', 500, 3),
			entry('payment_lightning', 3000, 4)
		]);
		const purchases = lines.filter((l) => l.kind === 'purchase');
		expect(purchases.map((l) => l.settled)).toEqual([true, true, false]);
		expect(purchases.map((l) => l.owedXof)).toEqual([0, 0, 500]);
	});

	it('shows what is left on a partly paid line', () => {
		const lines = annotateSettled([
			entry('purchase', 1000, 1),
			entry('purchase', 2000, 2),
			entry('payment_cash', 1500, 3)
		]);
		expect(lines.filter((l) => l.kind === 'purchase').map((l) => l.owedXof)).toEqual([0, 1500]);
	});

	it('counts a payment made before a purchase (an advance)', () => {
		const lines = annotateSettled([entry('payment_cash', 5000, 1), entry('purchase', 2000, 2)]);
		expect(lines.find((l) => l.kind === 'purchase')?.settled).toBe(true);
	});

	it('ignores voided purchases and voided payments', () => {
		const lines = annotateSettled([
			entry('purchase', 1000, 1, true),
			entry('purchase', 1000, 2),
			entry('payment_cash', 1000, 3, true)
		]);
		expect(lines.map((l) => l.settled)).toEqual([false, false, false]);
		expect(openLines(lines)).toHaveLength(1);
	});

	it('owes exactly the balance across open lines', () => {
		const entries = [
			entry('purchase', 1250, 1),
			entry('purchase', 800, 2),
			entry('payment_cash', 300, 2),
			entry('purchase', 4500, 5),
			entry('payment_lightning', 1600, 6)
		];
		const owed = annotateSettled(entries).reduce((sum, l) => sum + l.owedXof, 0);
		expect(owed).toBe(balanceOf(entries));
	});

	it('returns entries in chronological order whatever the input order', () => {
		const a = entry('purchase', 100, 9);
		const b = entry('purchase', 100, 2);
		expect(annotateSettled([a, b]).map((l) => l.id)).toEqual([b.id, a.id]);
	});
});
