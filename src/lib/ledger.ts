/**
 * The tab ("ardoise") as pure data: what was taken, what was paid, what is left.
 * Shared by the server and the browser so an entry added offline is drawn with
 * exactly the same rules as one that came from the database.
 */

export type EntryKind = 'purchase' | 'payment_cash' | 'payment_lightning';

export interface LedgerEntry {
	id: string;
	kind: EntryKind;
	amountXof: number;
	label: string;
	/** ISO timestamp */
	occurredAt: string;
	voided: boolean;
	/** Lightning payments: the public receipt id, and the payer's first name if they gave one. */
	receiptId?: string | null;
	payerName?: string | null;
}

export interface LedgerLine extends LedgerEntry {
	/** Purchases only: fully covered by payments, so the line is struck through. */
	settled: boolean;
	/** Purchases only: what is still owed on this line. */
	owedXof: number;
}

export const isPayment = (kind: EntryKind) => kind !== 'purchase';

/** What the customer owes. Negative means they have paid ahead ("avance"). */
export function balanceOf(entries: readonly LedgerEntry[]): number {
	let balance = 0;
	for (const entry of entries) {
		if (entry.voided) continue;
		balance += entry.kind === 'purchase' ? entry.amountXof : -entry.amountXof;
	}
	return balance;
}

/**
 * Apply payments to purchases oldest first, the way a shopkeeper strikes lines
 * from the top of the page. Returns the entries in chronological order.
 */
export function annotateSettled(entries: readonly LedgerEntry[]): LedgerLine[] {
	const ordered = [...entries].sort(
		(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)
	);

	let paid = 0;
	for (const entry of ordered) {
		if (!entry.voided && isPayment(entry.kind)) paid += entry.amountXof;
	}

	let taken = 0;
	return ordered.map((entry) => {
		if (entry.voided || entry.kind !== 'purchase') {
			return { ...entry, settled: false, owedXof: 0 };
		}
		taken += entry.amountXof;
		const owedXof = Math.min(entry.amountXof, Math.max(0, taken - paid));
		return { ...entry, settled: owedXof === 0, owedXof };
	});
}

/** Purchases that still have something owed on them, oldest first. */
export function openLines(lines: readonly LedgerLine[]): LedgerLine[] {
	return lines.filter((line) => line.kind === 'purchase' && !line.voided && !line.settled);
}
