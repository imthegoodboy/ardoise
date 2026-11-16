/**
 * The BTC price in FCFA.
 *
 * The CFA franc is pegged to the euro (1 EUR = 655.957 XOF, fixed by treaty),
 * so the only market input is BTC/EUR. Four public exchanges are asked at
 * once and the median is used, but only when at least two of them agree
 * within 3%. One broken or manipulated feed can neither block payments nor
 * move the price a payer sees.
 */
import { XOF_PER_EUR } from '#lib/money.ts';
import { config } from './config.ts';
import { getDb } from './db/index.ts';
import { describeError, log } from './log.ts';

export interface Rate {
	eurPerBtc: number;
	xofPerBtc: number;
	sources: string[];
	fetchedAt: Date;
	/** True when served from cache because the live feeds were unavailable. */
	stale: boolean;
	/** True for the fixed rate that only the demo wallet may use. */
	offline: boolean;
}

type Fetch = typeof fetch;

interface Source {
	name: string;
	url: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each exchange has its own JSON shape
	read(body: any): unknown;
}

const SOURCES: Source[] = [
	{
		name: 'kraken',
		url: 'https://api.kraken.com/0/public/Ticker?pair=XBTEUR',
		read: (body) => body?.result?.XXBTZEUR?.c?.[0]
	},
	{
		name: 'coinbase',
		url: 'https://api.coinbase.com/v2/prices/BTC-EUR/spot',
		read: (body) => body?.data?.amount
	},
	{
		name: 'bitstamp',
		url: 'https://www.bitstamp.net/api/v2/ticker/btceur/',
		read: (body) => body?.last
	},
	{
		name: 'coingecko',
		url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur',
		read: (body) => body?.bitcoin?.eur
	}
];

const FRESH_MS = 60_000;
const STALE_LIMIT_MS = 15 * 60_000;
const AGREEMENT = 0.03;
const KV_KEY = 'rate:btc-eur';

/** Used by the simulated demo wallet only, when no feed can be reached. Never for real money. */
export const OFFLINE_EUR_PER_BTC = 58_000;

let fetchImpl: Fetch | undefined;
let memory: Rate | undefined;
let inflight: Promise<Rate | null> | undefined;

/** Tests swap the network for a stub; `undefined` restores the default. */
export function setRateFetch(stub: Fetch | undefined) {
	fetchImpl = stub;
	memory = undefined;
	inflight = undefined;
}

function activeFetch(): Fetch {
	if (fetchImpl) return fetchImpl;
	if (config.isTest) return () => Promise.reject(new Error('network disabled in tests'));
	return fetch;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function plausible(value: unknown): number | null {
	const number = typeof value === 'string' ? Number(value) : value;
	if (typeof number !== 'number' || !Number.isFinite(number)) return null;
	// Wide sanity bounds; anything outside is a broken feed, not a market move.
	return number > 1_000 && number < 10_000_000 ? number : null;
}

async function ask(source: Source, doFetch: Fetch): Promise<number | null> {
	try {
		const response = await doFetch(source.url, {
			signal: AbortSignal.timeout(4_000),
			headers: { accept: 'application/json', 'user-agent': 'Ardoise/1.0 (price check)' }
		});
		if (!response.ok) return null;
		return plausible(source.read(await response.json()));
	} catch {
		return null;
	}
}

/** Ask every source; returns a rate only if at least two agree. */
export async function fetchLiveRate(doFetch: Fetch = activeFetch()): Promise<Rate | null> {
	const answers = await Promise.all(
		SOURCES.map(async (source) => ({ name: source.name, value: await ask(source, doFetch) }))
	);
	const quoted = answers.filter((answer): answer is { name: string; value: number } =>
		Boolean(answer.value)
	);
	if (quoted.length < 2) return null;

	// Largest group of feeds whose highest and lowest quotes are within 3% of each
	// other: every accepted pair agrees, and two honest feeds win over two
	// broken ones that happen to straddle them.
	const sorted = [...quoted].sort((a, b) => a.value - b.value);
	let agreeing: typeof quoted = [];
	for (let start = 0; start < sorted.length; start++) {
		let end = start;
		while (
			end + 1 < sorted.length &&
			sorted[end + 1].value <= sorted[start].value * (1 + AGREEMENT)
		) {
			end++;
		}
		const group = sorted.slice(start, end + 1);
		if (group.length > agreeing.length) agreeing = group;
	}
	agreeing = quoted.filter((answer) => agreeing.includes(answer)); // keep the feeds' own order
	// ...and that group must be a majority of the feeds that answered.
	if (agreeing.length < 2 || agreeing.length * 2 <= quoted.length) return null;

	const eurPerBtc = median(agreeing.map((answer) => answer.value));
	return {
		eurPerBtc,
		xofPerBtc: eurPerBtc * XOF_PER_EUR,
		sources: agreeing.map((answer) => answer.name),
		fetchedAt: new Date(),
		stale: false,
		offline: false
	};
}

async function readCached(): Promise<Rate | null> {
	try {
		const db = await getDb();
		const rows = await db.query<{ value: { eurPerBtc: number; sources: string[]; at: string } }>(
			'select value from kv where key = $1',
			[KV_KEY]
		);
		const value = rows[0]?.value;
		if (!value) return null;
		const fetchedAt = new Date(value.at);
		if (Date.now() - fetchedAt.getTime() > STALE_LIMIT_MS) return null;
		return {
			eurPerBtc: value.eurPerBtc,
			xofPerBtc: value.eurPerBtc * XOF_PER_EUR,
			sources: value.sources,
			fetchedAt,
			stale: true,
			offline: false
		};
	} catch {
		return null;
	}
}

async function writeCached(rate: Rate) {
	try {
		const db = await getDb();
		await db.query(
			`insert into kv (key, value) values ($1, $2::jsonb)
			 on conflict (key) do update set value = excluded.value, updated_at = now()`,
			[
				KV_KEY,
				JSON.stringify({
					eurPerBtc: rate.eurPerBtc,
					sources: rate.sources,
					at: rate.fetchedAt.toISOString()
				})
			]
		);
	} catch (err) {
		log.warn('rates.cache_write_failed', { reason: describeError(err) });
	}
}

async function refresh(): Promise<Rate | null> {
	const live = await fetchLiveRate();
	if (live) {
		memory = live;
		await writeCached(live);
		return live;
	}
	log.warn('rates.live_unavailable');
	return readCached();
}

/**
 * The rate to quote right now: live (cached for a minute), else a recent
 * cached value, else, only if `allowOffline`, the fixed demo rate.
 * Returns null when there is no trustworthy price; callers must not invoice.
 */
export async function currentRate(options: { allowOffline?: boolean } = {}): Promise<Rate | null> {
	if (memory && Date.now() - memory.fetchedAt.getTime() < FRESH_MS) return memory;
	inflight ??= refresh().finally(() => {
		inflight = undefined;
	});
	const rate = await inflight;
	if (rate) return rate;
	if (!options.allowOffline) return null;
	return {
		eurPerBtc: OFFLINE_EUR_PER_BTC,
		xofPerBtc: OFFLINE_EUR_PER_BTC * XOF_PER_EUR,
		sources: ['offline-fallback'],
		fetchedAt: new Date(),
		stale: true,
		offline: true
	};
}
