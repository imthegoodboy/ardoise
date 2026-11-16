/**
 * The server opens a WebSocket to whatever relay a wallet connection names.
 * That address comes from user input, so it must never reach into the private
 * network the server itself lives on (SSRF).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { config } from '../config.ts';
import { WalletError } from './types.ts';

function isPrivateV4(ip: string): boolean {
	const [a, b] = ip.split('.').map(Number);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 192 && b === 0) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

export function isPrivateAddress(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) return isPrivateV4(ip);
	if (kind !== 6) return true;

	const lower = ip.toLowerCase();
	const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isPrivateV4(mapped[1]);
	return (
		lower === '::' ||
		lower === '::1' ||
		lower.startsWith('fc') ||
		lower.startsWith('fd') ||
		/^fe[89ab]/.test(lower) ||
		lower.startsWith('ff')
	);
}

/** Throws unless `raw` is a `wss://` URL whose host resolves only to public addresses. */
export async function assertPublicRelay(raw: string): Promise<void> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new WalletError('bad_relay');
	}

	const local = config.allowPrivateHosts;
	if (url.protocol !== 'wss:' && !(local && url.protocol === 'ws:')) {
		throw new WalletError('bad_relay');
	}
	if (url.username || url.password) throw new WalletError('bad_relay');
	if (local) return;

	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(host)) {
		if (isPrivateAddress(host)) throw new WalletError('bad_relay');
		return;
	}
	if (!host.includes('.') || /\.(local|internal|localhost|lan|home|corp)$/i.test(host)) {
		throw new WalletError('bad_relay');
	}

	let addresses: { address: string }[];
	try {
		addresses = await lookup(host, { all: true });
	} catch {
		throw new WalletError('bad_relay');
	}
	if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
		throw new WalletError('bad_relay');
	}
}
