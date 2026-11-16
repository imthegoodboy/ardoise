/**
 * The simulated wallet behind the "try the demo" shop.
 *
 * It issues regtest invoices that no real wallet can pay, and settles them when
 * the visitor presses "simulate payment". Everything downstream (verification,
 * settlement, receipts, the proof-of-payment check) runs the production code.
 */
import { getDb } from '../db/index.ts';
import { checkInvoice, encodeTestInvoice } from './bolt11.ts';
import type { PaymentState, Wallet } from './types.ts';

interface DemoInvoice {
	preimage: string;
	expiresAt: string;
	paidAt: string | null;
}

const keyFor = (paymentHash: string) => 'demo-invoice:' + paymentHash;

async function read(paymentHash: string): Promise<DemoInvoice | null> {
	const db = await getDb();
	const rows = await db.query<{ value: DemoInvoice }>('select value from kv where key = $1', [
		keyFor(paymentHash)
	]);
	return rows[0]?.value ?? null;
}

async function write(paymentHash: string, value: DemoInvoice): Promise<void> {
	const db = await getDb();
	await db.query(
		`insert into kv (key, value) values ($1, $2::jsonb)
		 on conflict (key) do update set value = excluded.value, updated_at = now()`,
		[keyFor(paymentHash), JSON.stringify(value)]
	);
}

export function demoWallet(): Wallet {
	return {
		kind: 'demo',

		async makeInvoice({ sats, memo, expirySeconds }) {
			const made = encodeTestInvoice({ sats, memo, expirySeconds });
			const invoice = checkInvoice(made.bolt11, {
				sats,
				paymentHash: made.paymentHash,
				networks: ['bcrt']
			});
			await write(made.paymentHash, {
				preimage: made.preimage,
				expiresAt: invoice.expiresAt.toISOString(),
				paidAt: null
			});
			return {
				bolt11: made.bolt11,
				paymentHash: made.paymentHash,
				expiresAt: invoice.expiresAt
			};
		},

		async lookupInvoice(paymentHash): Promise<PaymentState> {
			const invoice = await read(paymentHash);
			if (!invoice?.paidAt) return { state: 'pending' };
			return {
				state: 'settled',
				preimage: invoice.preimage,
				settledAt: new Date(invoice.paidAt)
			};
		}
	};
}

/** Pretend a payer's wallet just paid this invoice. Returns false if it can't be paid. */
export async function simulatePayment(paymentHash: string): Promise<boolean> {
	const invoice = await read(paymentHash);
	if (!invoice) return false;
	if (invoice.paidAt) return true;
	if (new Date(invoice.expiresAt).getTime() < Date.now()) return false;
	await write(paymentHash, { ...invoice, paidAt: new Date().toISOString() });
	return true;
}
