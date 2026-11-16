/**
 * Lines written down while the network is down.
 *
 * Each entry carries its own id, and the server ignores an id it has already
 * stored, so sending the outbox twice (two tabs, a flaky reconnect) is safe.
 * Each entry also carries its shop: lines written for one shop are only ever
 * sent from that shop's session, never lost because another one signed in.
 */
export interface OutboxEntry {
	id: string;
	shopId: string;
	customerId: string;
	kind: 'purchase' | 'payment_cash';
	amountXof: number;
	label: string;
	occurredAt: string;
}

const KEY = 'ardoise.outbox.v1';

/** Used when localStorage is blocked or full: lines survive this visit, not a reload. */
let memory: OutboxEntry[] | null = null;

function read(): OutboxEntry[] {
	if (memory) return memory;
	try {
		const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function write(entries: OutboxEntry[]) {
	try {
		if (entries.length) localStorage.setItem(KEY, JSON.stringify(entries));
		else localStorage.removeItem(KEY);
		memory = null;
	} catch {
		memory = entries;
	}
	notify();
}

const listeners = new Set<() => void>();
function notify() {
	for (const listener of listeners) listener();
}

export function onOutboxChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function queued(shopId: string, customerId?: string): OutboxEntry[] {
	return read().filter(
		(entry) => entry.shopId === shopId && (!customerId || entry.customerId === customerId)
	);
}

/** On sign-out: forget unsent lines and the offline copy of the book on this phone. */
export function clearOutbox() {
	write([]);
	try {
		navigator.serviceWorker?.controller?.postMessage('purge');
	} catch {
		// No service worker: nothing cached to purge.
	}
}

type SendResult = 'sent' | 'queued' | 'rejected' | 'signed_out';

async function post(entry: OutboxEntry): Promise<SendResult> {
	let response: Response;
	// The shop is known from the session; only the line itself is sent.
	const { shopId, ...line } = entry;
	void shopId;
	try {
		response = await fetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(line),
			signal: AbortSignal.timeout(12_000)
		});
	} catch {
		return 'queued';
	}
	if (response.ok) return 'sent';
	if (response.status === 401) return 'signed_out';
	// Only a definite "no" drops a line: a malformed entry (400), or a tab that
	// no longer exists in this shop (404). Anything else is retried later.
	if (response.status === 400 || response.status === 404) return 'rejected';
	return 'queued';
}

/** Send one entry now; keep it for later if the network is not there. */
export async function send(entry: OutboxEntry): Promise<SendResult> {
	const result = navigator.onLine === false ? 'queued' : await post(entry);
	if (result === 'queued' || result === 'signed_out') {
		const entries = read().filter((existing) => existing.id !== entry.id);
		write([...entries, entry]);
	}
	return result;
}

let flushing: Promise<number> | null = null;

/** Try to send everything this shop has waiting. Returns how many entries were delivered. */
export function flush(shopId: string): Promise<number> {
	flushing ??= (async () => {
		let delivered = 0;
		for (const entry of queued(shopId)) {
			const result = await post(entry);
			if (result === 'queued' || result === 'signed_out') break;
			write(read().filter((existing) => existing.id !== entry.id));
			if (result === 'sent') delivered++;
		}
		return delivered;
	})().finally(() => {
		flushing = null;
	});
	return flushing;
}
