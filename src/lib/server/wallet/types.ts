/**
 * What Ardoise needs from a Lightning wallet: make an invoice, and later ask
 * whether it was paid. Nothing here can send money, by design.
 */

export interface WalletInvoice {
	bolt11: string;
	paymentHash: string;
	expiresAt: Date;
}

export type PaymentState =
	{ state: 'pending' } | { state: 'settled'; preimage: string | null; settledAt: Date | null };

export interface Wallet {
	readonly kind: 'nwc' | 'demo';
	makeInvoice(request: {
		sats: number;
		memo: string;
		expirySeconds: number;
	}): Promise<WalletInvoice>;
	lookupInvoice(paymentHash: string): Promise<PaymentState>;
}

export type WalletErrorCode =
	/** The connection string is not a valid Nostr Wallet Connect URL. */
	| 'bad_url'
	/** A relay address is not `wss://` or points at a private network. */
	| 'bad_relay'
	/** The wallet did not answer in time. */
	| 'unreachable'
	/** The connection lacks make_invoice or lookup_invoice. */
	| 'missing_permission'
	/** The connection is allowed to spend. Ardoise refuses to hold such a key. */
	| 'can_spend'
	/** The wallet answered with an error (no inbound liquidity, quota, ...). */
	| 'wallet_refused'
	/** The invoice returned does not match what was asked for. */
	| 'invoice_mismatch'
	| 'no_wallet';

export class WalletError extends Error {
	readonly code: WalletErrorCode;
	constructor(code: WalletErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'WalletError';
		this.code = code;
	}
}
