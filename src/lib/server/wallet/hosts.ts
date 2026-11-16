/**
 * The server opens a WebSocket to whatever relay a wallet connection names.
 * That address comes from user input, so it must never reach into the private
 * network the server itself lives on (SSRF).
 *
 * Checked when a wallet is connected, and again every time a connection to it
 * is opened, so a hostname that later re-points to a private address (DNS
 * rebinding) is refused at that point too. See THREAT_MODEL.md for what
 * remains: the gap between our lookup and the socket's own.
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

/** Expand an IPv6 address to its eight 16-bit groups (embedded dotted IPv4 included). */
function ipv6Groups(ip: string): number[] | null {
	let text = ip.toLowerCase().replace(/%.*$/, '');
	const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
	if (dotted) {
		const [a, b, c, d] = dotted[1].split('.').map(Number);
		text =
			text.slice(0, -dotted[1].length) +
			((a << 8) | b).toString(16) +
			':' +
			((c << 8) | d).toString(16);
	}
	const [head, tail] = text.split('::');
	const left = head ? head.split(':') : [];
	const right = tail !== undefined && tail ? tail.split(':') : [];
	const missing = 8 - left.length - right.length;
	if (tail === undefined ? left.length !== 8 : missing < 0) return null;
	const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill('0'), ...right].map(
		(group) => parseInt(group, 16)
	);
	return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPrivateAddress(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) return isPrivateV4(ip);
	if (kind !== 6) return true;

	const g = ipv6Groups(ip);
	if (!g) return true;
	const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);

	// Addresses that carry an IPv4 address inside them are judged by that address:
	// ::ffff:a.b.c.d (mapped, also written ::ffff:7f00:1), ::a.b.c.d (compatible),
	// and 64:ff9b::a.b.c.d (NAT64).
	if (zeroPrefix(5) && g[5] === 0xffff) return isPrivateV4(v4From(g[6], g[7]));
	if (zeroPrefix(6) && (g[6] !== 0 || g[7] > 1)) return isPrivateV4(v4From(g[6], g[7]));
	if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
		return isPrivateV4(v4From(g[6], g[7]));
	}

	if (g.every((x) => x === 0)) return true; // ::
	if (zeroPrefix(7) && g[7] === 1) return true; // ::1
	const first = g[0];
	return (
		(first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
		(first & 0xffc0) === 0xfe80 || // fe80::/10 link local
		(first & 0xffc0) === 0xfec0 || // fec0::/10 site local (deprecated)
		(first & 0xff00) === 0xff00 || // ff00::/8 multicast
		(first === 0x2001 && g[1] === 0x0db8) // documentation
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

/** Relay URLs inside a stored connection string, for re-checking before each connection. */
export function relaysOf(nwcUrl: string): string[] {
	try {
		return new URL(nwcUrl.replace(/^nostr\+walletconnect:/, 'https:')).searchParams.getAll('relay');
	} catch {
		return [];
	}
}
