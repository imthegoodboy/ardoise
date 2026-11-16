/**
 * All cryptography in one small file, built only on node:crypto.
 *
 * - seal/open: AES-256-GCM for data at rest (wallet connections, names, phones)
 * - lookupHash: keyed hash so we can find a row by phone number without storing it
 * - hashPin/verifyPin: scrypt with a per-shop salt and a server-side pepper
 */
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	hkdfSync,
	randomBytes,
	scrypt,
	timingSafeEqual
} from 'node:crypto';
import { masterSecret } from './config.ts';

const keys = new Map<string, Buffer>();

function key(purpose: string): Buffer {
	let k = keys.get(purpose);
	if (!k) {
		k = Buffer.from(hkdfSync('sha256', masterSecret(), 'ardoise', purpose, 32));
		keys.set(purpose, k);
	}
	return k;
}

/**
 * Encrypt a value for storage. `context` binds the ciphertext to its column,
 * so a sealed phone number can't be swapped into a wallet-secret field.
 */
export function seal(plaintext: string, context: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key('seal/v1'), iv);
	cipher.setAAD(Buffer.from(context));
	const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const sealed = Buffer.concat([iv, cipher.getAuthTag(), body]);
	return 'v1.' + sealed.toString('base64url');
}

export function open(sealed: string, context: string): string {
	if (!sealed.startsWith('v1.')) throw new Error('Unknown sealed value format');
	const raw = Buffer.from(sealed.slice(3), 'base64url');
	if (raw.length < 28) throw new Error('Sealed value is too short');
	const decipher = createDecipheriv('aes-256-gcm', key('seal/v1'), raw.subarray(0, 12));
	decipher.setAAD(Buffer.from(context));
	decipher.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** Keyed, one-way hash used to look rows up by a value we refuse to store. */
export function lookupHash(value: string, purpose: string): string {
	return createHmac('sha256', key('lookup/' + purpose))
		.update(value)
		.digest('hex');
}

export function sha256Hex(value: string | Uint8Array): string {
	return createHash('sha256').update(value).digest('hex');
}

/** URL-safe random token. 32 bytes is 256 bits of entropy. */
export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

function scryptAsync(secret: Buffer, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(
			secret,
			salt,
			SCRYPT.keylen,
			{ N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem },
			(err, derived) => (err ? reject(err) : resolve(derived))
		);
	});
}

function pepper(pin: string): Buffer {
	// A 6-digit PIN has little entropy. Mixing in a server key means a stolen
	// database alone is not enough to brute-force PINs offline.
	return createHmac('sha256', key('pin-pepper/v1')).update(pin).digest();
}

export async function hashPin(pin: string): Promise<string> {
	const salt = randomBytes(16);
	const derived = await scryptAsync(pepper(pin), salt);
	return ['scrypt1', salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
	const [scheme, salt, expected] = stored.split('$');
	if (scheme !== 'scrypt1' || !salt || !expected) return false;
	const derived = await scryptAsync(pepper(pin), Buffer.from(salt, 'base64url'));
	const want = Buffer.from(expected, 'base64url');
	return derived.length === want.length && timingSafeEqual(derived, want);
}

export function safeEqual(a: string, b: string): boolean {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}
