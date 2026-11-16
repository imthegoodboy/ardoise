// Live tests against real Nostr Wallet Connect wallets on public relays.
// Kept out of the default run because they need the internet: `npm run test:nwc`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^#lib\/(.*)$/, replacement: new URL('./src/lib/$1', import.meta.url).pathname }
		]
	},
	test: {
		name: 'nwc',
		environment: 'node',
		include: ['src/**/*.nwc.test.ts'],
		testTimeout: 90_000,
		hookTimeout: 60_000,
		expect: { requireAssertions: true }
	}
});
