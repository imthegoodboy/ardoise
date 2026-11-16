/**
 * Lines written down while the network is down.
 *
 * Each entry carries its own id, and the server ignores an id it has already
 * stored, so sending the outbox twice (two tabs, a flaky reconnect) is safe.
 */
export interface OutboxEntry {
	id: string;
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

export function queued(customerId?: string): OutboxEntry[] {
	const entries = read();
	return customerId ? entries.filter((entry) => entry.customerId === customerId) : entries;
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
	try {
		response = await fetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(entry),
			signal: AbortSignal.timeout(12_000)
		});
	} catch {
		return 'queued';
	}
	if (response.ok) return 'sent';
	if (response.status === 401) return 'signed_out';
	if (response.status >= 500 || response.status === 429) return 'queued';
	return 'rejected';
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

/** Try to send everything waiting. Returns how many entries were delivered. */
export function flush(): Promise<number> {
	flushing ??= (async () => {
		let delivered = 0;
		for (const entry of read()) {
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
