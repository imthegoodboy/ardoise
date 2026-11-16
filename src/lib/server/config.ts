/**
 * Runtime configuration, read once from the environment.
 *
 * Everything here is optional for local use: with no environment at all the
 * server stores data in ./.data and generates its own secret key. Production
 * deployments set DATABASE_URL and ARDOISE_SECRET explicitly.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const env = process.env;

if (env.NODE_ENV !== 'production' && !env.VITEST && existsSync('.env')) {
	try {
		process.loadEnvFile('.env');
	} catch {
		// A malformed .env should not stop the dev server; values simply stay unset.
	}
}

function flag(value: string | undefined): boolean {
	return value === '1' || value === 'true' || value === 'yes';
}

export type DemoMode = 'off' | 'simulated' | 'faucet';

function demoMode(value: string | undefined): DemoMode {
	if (value === 'simulated' || value === 'faucet') return value;
	return 'off';
}

export const config = {
	isProduction: env.NODE_ENV === 'production',
	isTest: Boolean(env.VITEST),
	dataDir: env.ARDOISE_DATA_DIR || './.data',
	databaseUrl: env.DATABASE_URL || '',
	/** Seeds a demo shop anyone can enter. `faucet` wires it to a real NWC test wallet. */
	demo: demoMode(env.ARDOISE_DEMO),
	/** Optional real wallet for the hosted demo shop (receive-only NWC connection). */
	demoShopNwcUrl: env.ARDOISE_DEMO_NWC_URL || '',
	/** Test-only escape hatch: accept NWC connections that are allowed to spend. Never in production. */
	allowSpendCapableNwc: flag(env.ARDOISE_ALLOW_SPEND_CAPABLE_NWC) && env.NODE_ENV !== 'production',
	/** Allow wallet relays on private networks, e.g. a node on your LAN. Off unless asked for. */
	allowPrivateHosts: flag(env.ARDOISE_ALLOW_PRIVATE_HOSTS),
	/** Google Gemini API key, for reading photos of paper notebooks. */
	geminiApiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',
	aiModel: env.ARDOISE_AI_MODEL || 'gemini-3.5-flash',
	cronSecret: env.CRON_SECRET || '',
	logLevel: env.LOG_LEVEL || (env.VITEST ? 'silent' : 'info')
} as const;

let cachedSecret: string | undefined;

/**
 * The master secret every key is derived from.
 *
 * Order: ARDOISE_SECRET, then a key file in the data directory, then a freshly
 * generated key written to that file. Serverless hosts have no writable disk,
 * so they must set ARDOISE_SECRET; we fail loudly instead of using a default.
 */
export function masterSecret(): string {
	if (cachedSecret) return cachedSecret;

	const fromEnv = env.ARDOISE_SECRET;
	if (fromEnv) {
		if (fromEnv.length < 32) {
			throw new Error('ARDOISE_SECRET must be at least 32 characters long.');
		}
		cachedSecret = fromEnv;
		return cachedSecret;
	}

	// With an external database, a key file on a container's disk would vanish on
	// the next deploy and take every sealed value with it. Refuse to start instead.
	// (Docker Compose declares a persistent volume for the data dir, which is fine.)
	if (config.isProduction && config.databaseUrl && !flag(env.ARDOISE_PERSISTENT_DATA_DIR)) {
		throw new Error('ARDOISE_SECRET must be set in production when DATABASE_URL is used.');
	}

	if (config.isTest) {
		cachedSecret = 'test-only-secret-not-used-anywhere-else-0123456789';
		return cachedSecret;
	}

	const file = path.join(config.dataDir, 'secret.key');
	try {
		if (existsSync(file)) {
			cachedSecret = readFileSync(file, 'utf8').trim();
		} else {
			mkdirSync(config.dataDir, { recursive: true });
			cachedSecret = randomBytes(48).toString('base64url');
			writeFileSync(file, cachedSecret + '\n', { mode: 0o600 });
		}
	} catch {
		throw new Error(
			'ARDOISE_SECRET is not set and no key file could be created in ' +
				config.dataDir +
				'. Set ARDOISE_SECRET to a random string of 32+ characters.'
		);
	}
	if (!cachedSecret || cachedSecret.length < 32) {
		throw new Error('The key file ' + file + ' is empty or too short. Delete it or fix it.');
	}
	return cachedSecret;
}
