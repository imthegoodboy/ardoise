/**
 * BOLT11 invoices.
 *
 * `readInvoice` and `checkInvoice` are the trust boundary with the wallet: an
 * invoice is never shown to a payer until it has been decoded here and found
 * to ask for exactly the amount Ardoise requested.
 *
 * `encodeTestInvoice` builds a syntactically valid regtest invoice for the
 * simulated demo wallet, so the demo exercises the very same checks.
 */
import { createHash, randomBytes } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bech32 } from '@scure/base';
import { decode } from 'light-bolt11-decoder';
import { WalletError } from './types.ts';

export interface ReadInvoice {
	/** bech32 network prefix: `bc` mainnet, `tb` testnet, `tbs` signet, `bcrt` regtest */
	network: string;
	/** null for an amountless invoice */
	amountMsat: bigint | null;
	paymentHash: string;
	description: string;
	createdAt: Date;
	expiresAt: Date;
}

export function readInvoice(bolt11: string): ReadInvoice {
	let decoded;
	try {
		decoded = decode(bolt11.trim().toLowerCase());
	} catch {
		throw new WalletError('invoice_mismatch', 'The wallet returned an unreadable invoice.');
	}

	let network = '';
	let amountMsat: bigint | null = null;
	let paymentHash = '';
	let description = '';
	let timestamp = 0;
	for (const section of decoded.sections) {
		if (section.name === 'coin_network') network = section.value?.bech32 ?? '';
		else if (section.name === 'amount') amountMsat = BigInt(section.value);
		else if (section.name === 'payment_hash') paymentHash = section.value;
		else if (section.name === 'description') description = section.value;
		else if (section.name === 'timestamp') timestamp = section.value;
	}
	if (!/^[0-9a-f]{64}$/.test(paymentHash) || !timestamp || !network) {
		throw new WalletError('invoice_mismatch', 'The wallet returned an incomplete invoice.');
	}
	const expiry = decoded.expiry ?? 3600;
	return {
		network,
		amountMsat,
		paymentHash,
		description,
		createdAt: new Date(timestamp * 1000),
		expiresAt: new Date((timestamp + expiry) * 1000)
	};
}

/**
 * Refuse any invoice that is not exactly what was asked for. A buggy or
 * malicious wallet service must not be able to make a payer send a different
 * amount, pay on the wrong network, or scan an invoice that is already dead.
 */
export function checkInvoice(
	bolt11: string,
	expected: { sats: number; paymentHash?: string; networks: readonly string[] }
): ReadInvoice {
	const invoice = readInvoice(bolt11);
	if (invoice.amountMsat !== BigInt(expected.sats) * 1000n) {
		throw new WalletError('invoice_mismatch', 'The invoice amount is not the amount requested.');
	}
	if (expected.paymentHash && expected.paymentHash.toLowerCase() !== invoice.paymentHash) {
		throw new WalletError('invoice_mismatch', 'The invoice payment hash does not match.');
	}
	if (!expected.networks.includes(invoice.network)) {
		throw new WalletError('invoice_mismatch', 'The invoice is for a different Bitcoin network.');
	}
	if (invoice.expiresAt.getTime() < Date.now() + 60_000) {
		throw new WalletError('invoice_mismatch', 'The invoice expires too soon to be paid.');
	}
	return invoice;
}

/** True when `preimage` is the secret behind `paymentHash`: the proof of payment. */
export function preimageMatches(preimage: string, paymentHash: string): boolean {
	if (!/^[0-9a-f]{64}$/i.test(preimage)) return false;
	const digest = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
	return digest === paymentHash.toLowerCase();
}

// --- encoding (demo wallet only) -------------------------------------------

function intToWords(value: number, length?: number): number[] {
	const words: number[] = [];
	let rest = value;
	do {
		words.unshift(rest % 32);
		rest = Math.floor(rest / 32);
	} while (rest > 0);
	while (length !== undefined && words.length < length) words.unshift(0);
	return words;
}

function tagged(tag: number, words: number[]): number[] {
	return [tag, ...intToWords(words.length, 2), ...words];
}

/** 5-bit words to bytes, zero-padding the tail (what BOLT11 signs over). */
function wordsToBytes(words: number[]): Uint8Array {
	const out: number[] = [];
	let acc = 0;
	let bits = 0;
	for (const word of words) {
		acc = (acc << 5) | word;
		bits += 5;
		while (bits >= 8) {
			bits -= 8;
			out.push((acc >> bits) & 0xff);
		}
		acc &= (1 << bits) - 1;
	}
	if (bits > 0) out.push((acc << (8 - bits)) & 0xff);
	return Uint8Array.from(out);
}

function amountPart(sats: number): string {
	if (sats % 100_000 === 0) return sats / 100_000 + 'm';
	if (sats % 100 === 0) return sats / 100 + 'u';
	return sats * 10 + 'n';
}

export interface TestInvoice {
	bolt11: string;
	paymentHash: string;
	preimage: string;
}

/** A regtest (`lnbcrt`) invoice signed with a throwaway key. Not payable on any real network. */
export function encodeTestInvoice(request: {
	sats: number;
	memo: string;
	expirySeconds: number;
	now?: Date;
}): TestInvoice {
	const preimage = randomBytes(32);
	const paymentHash = createHash('sha256').update(preimage).digest();
	const timestamp = Math.floor((request.now ?? new Date()).getTime() / 1000);
	const prefix = 'lnbcrt' + amountPart(request.sats);

	const words = [
		...intToWords(timestamp, 7),
		...tagged(1, [...bech32.toWords(paymentHash)]),
		...tagged(16, [...bech32.toWords(randomBytes(32))]),
		...tagged(13, [...bech32.toWords(Buffer.from(request.memo.slice(0, 120), 'utf8'))]),
		...tagged(6, intToWords(request.expirySeconds)),
		...tagged(24, intToWords(18)),
		// feature bits 8 (var_onion) and 14 (payment_secret)
		...tagged(5, [16, 8, 0])
	];

	const message = Buffer.concat([Buffer.from(prefix, 'utf8'), wordsToBytes(words)]);
	const { secretKey } = secp256k1.keygen();
	const recovered = secp256k1.sign(message, secretKey, { format: 'recovered' });
	// noble returns [recovery id, r, s]; BOLT11 wants [r, s, recovery id].
	const signature = Uint8Array.from([...recovered.slice(1), recovered[0]]);

	return {
		bolt11: bech32.encode(prefix, [...words, ...bech32.toWords(signature)], false),
		paymentHash: paymentHash.toString('hex'),
		preimage: preimage.toString('hex')
	};
}
