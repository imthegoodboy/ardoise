import { SATS_PER_BTC } from '#lib/money.ts';
import { config } from '#lib/server/config.ts';
import { currentRate } from '#lib/server/rates.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// A live figure on the front page, but never at the cost of a slow first paint:
	// if the price feeds are slow, the page goes out without it (the fetch keeps
	// warming the cache for the next visitor).
	const rate = await Promise.race([
		currentRate().catch(() => null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_200))
	]);
	return {
		demoEnabled: config.demo !== 'off',
		rate:
			rate && !rate.stale
				? {
						satsPerThousand: Math.round((1000 / rate.xofPerBtc) * SATS_PER_BTC),
						sources: rate.sources
					}
				: null
	};
};
