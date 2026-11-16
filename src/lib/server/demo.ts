/**
 * "Try the demo": every visitor gets a private sandbox boutique, filled with
 * the kind of tabs a Médina shop actually carries. Sandboxes cannot be logged
 * into, expire after a day, and never mix with real shops.
 */
import { randomUUID } from 'node:crypto';
import type { Locale } from '#lib/money.ts';
import { config, type DemoMode } from './config.ts';
import { randomToken, seal } from './crypto.ts';
import { createCustomer } from './customers.ts';
import { getDb, type Queryable } from './db/index.ts';
import { payerContext } from './invoices.ts';
import { describeError, log } from './log.ts';
import { clientKey, hit } from './ratelimit.ts';
import { insertShop, setWallet, type Shop } from './shops.ts';
import { encodeTestInvoice } from './wallet/bolt11.ts';
import { createFaucetWallet } from './wallet/faucet.ts';
import { inspectNwc } from './wallet/nwc.ts';

const DEMO_LIMIT = { max: 12, windowSeconds: 3600 };
const DAY = 86_400_000;

interface Line {
	daysAgo: number;
	label: string;
	amount: number;
	kind?: 'purchase' | 'payment_cash';
}

interface DemoCustomer {
	name: string;
	phone?: string;
	limit?: number;
	lines: Line[];
	/** A Lightning payment already received, with a verifiable receipt. */
	paidByLightning?: { daysAgo: number; amount: number; payer: string };
}

/** Street prices in Dakar, late 2026. Phone numbers are fictitious. */
const CUSTOMERS: DemoCustomer[] = [
	{
		name: 'Awa Ndiaye',
		phone: '+221770000101',
		lines: [
			{ daysAgo: 19, label: 'Riz parfumé 5 kg', amount: 2750 },
			{ daysAgo: 19, label: 'Huile 1 L', amount: 1300 },
			{ daysAgo: 15, label: 'Sucre 1 kg', amount: 650 },
			{ daysAgo: 12, label: 'Espèces', amount: 2000, kind: 'payment_cash' },
			{ daysAgo: 11, label: 'Lait en poudre', amount: 1800 },
			{ daysAgo: 8, label: 'Gaz 6 kg', amount: 2900 },
			{ daysAgo: 6, label: 'Oignons 2 kg', amount: 1200 },
			{ daysAgo: 4, label: 'Savon ×3', amount: 1050 },
			{ daysAgo: 2, label: 'Pain ×4', amount: 600 },
			{ daysAgo: 1, label: 'Crédit téléphone', amount: 2000 }
		]
	},
	{
		name: 'Ndèye Gueye',
		phone: '+221770000102',
		limit: 20000,
		lines: [
			{ daysAgo: 24, label: 'Sac de riz 25 kg', amount: 13500 },
			{ daysAgo: 16, label: 'Huile 5 L', amount: 6200 },
			{ daysAgo: 9, label: 'Tomate concentrée ×4', amount: 800 },
			{ daysAgo: 3, label: 'Sucre 1 kg', amount: 650 },
			{ daysAgo: 1, label: 'Café Touba ×2', amount: 200 }
		]
	},
	{
		name: 'Khady Sow',
		phone: '+221770000103',
		limit: 10000,
		lines: [
			{ daysAgo: 13, label: 'Riz 2 kg', amount: 1000 },
			{ daysAgo: 10, label: 'Poisson sec', amount: 1500 },
			{ daysAgo: 7, label: 'Huile 1 L', amount: 1300 },
			{ daysAgo: 5, label: 'Œufs ×10', amount: 1000 },
			{ daysAgo: 2, label: 'Lait caillé', amount: 1950 }
		]
	},
	{
		name: 'Ibrahima Sarr',
		lines: [
			{ daysAgo: 6, label: 'Cigarettes', amount: 1200 },
			{ daysAgo: 3, label: 'Pain ×2', amount: 300 },
			{ daysAgo: 2, label: 'Crédit téléphone', amount: 1000 },
			{ daysAgo: 0, label: 'Café Touba ×7', amount: 700 }
		]
	},
	{
		name: 'Fatou Diop',
		phone: '+221770000105',
		lines: [
			{ daysAgo: 21, label: 'Riz parfumé 5 kg', amount: 2750 },
			{ daysAgo: 17, label: 'Huile 1 L', amount: 1300 },
			{ daysAgo: 14, label: 'Lait en poudre', amount: 1800 },
			{ daysAgo: 9, label: 'Savon ×2', amount: 700 },
			{ daysAgo: 7, label: 'Sucre 2 kg', amount: 1300 },
			{ daysAgo: 6, label: 'Bouillon, oignons', amount: 650 }
		],
		paidByLightning: { daysAgo: 5, amount: 8500, payer: 'Cheikh' }
	},
	{
		name: 'Mamadou Fall',
		lines: [
			{ daysAgo: 4, label: 'Pain', amount: 150 },
			{ daysAgo: 1, label: 'Sucre 1 kg', amount: 650 },
			{ daysAgo: 0, label: 'Savon', amount: 350 }
		]
	},
	{
		name: 'Ousmane Ba',
		lines: [
			{ daysAgo: 10, label: 'Riz 2 kg', amount: 1000 },
			{ daysAgo: 8, label: 'Espèces', amount: 2000, kind: 'payment_cash' },
			{ daysAgo: 3, label: 'Pain ×3', amount: 450 }
		]
	}
];

/** A spread of hours across the shop's opening times, stable per line. */
function at(daysAgo: number, index: number, now: number): string {
	const hour = 8 + ((index * 5) % 13);
	const minute = (index * 17) % 60;
	const day = new Date(now - daysAgo * DAY);
	day.setUTCHours(hour, minute, 0, 0);
	// Lines dated today must still be in the past, and keep their order.
	const time = Math.min(day.getTime(), now - (300 - index) * 60_000);
	return new Date(time).toISOString();
}

async function seedCustomer(
	q: Queryable,
	shop: Shop,
	spec: DemoCustomer,
	index: number,
	now: number
) {
	const customer = await createCustomer(
		shop.id,
		{ name: spec.name, phone: spec.phone ?? null, creditLimitXof: spec.limit ?? null },
		q
	);
	let n = index * 20;
	for (const line of spec.lines) {
		n += 1;
		const occurredAt = at(line.daysAgo, n, now);
		await q.query(
			`insert into entries (id, shop_id, customer_id, kind, amount_xof, label, occurred_at, created_at)
			 values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)`,
			[
				randomUUID(),
				shop.id,
				customer.id,
				line.kind ?? 'purchase',
				line.amount,
				line.label,
				occurredAt
			]
		);
	}

	const paid = spec.paidByLightning;
	if (paid) {
		const xofPerBtc = 58_000 * 655.957;
		const sats = Math.round((paid.amount / xofPerBtc) * 1e8);
		const paidAt = at(paid.daysAgo, n + 1, now);
		const made = encodeTestInvoice({
			sats,
			memo: shop.name,
			expirySeconds: 900,
			now: new Date(new Date(paidAt).getTime() - 120_000)
		});
		const invoiceId = randomUUID();
		await q.query(
			`insert into invoices (id, public_id, shop_id, customer_id, amount_xof, amount_sats, xof_per_btc,
				rate_sources, wallet_kind, bolt11, payment_hash, preimage, status, payer_name_sealed,
				created_at, expires_at, paid_at)
			 values ($1, $2, $3, $4, $5, $6, $7, 'kraken,coinbase,bitstamp', 'demo', $8, $9, $10, 'paid', $11,
				$12::timestamptz - interval '2 minutes', $12::timestamptz + interval '13 minutes', $12::timestamptz)`,
			[
				invoiceId,
				randomToken(12),
				shop.id,
				customer.id,
				paid.amount,
				sats,
				xofPerBtc,
				made.bolt11,
				made.paymentHash,
				made.preimage,
				seal(paid.payer, payerContext(invoiceId)),
				paidAt
			]
		);
		await q.query(
			`insert into entries (id, shop_id, customer_id, kind, amount_xof, label, invoice_id, occurred_at, created_at)
			 values ($1, $2, $3, 'payment_lightning', $4, '', $5, $6::timestamptz, $6::timestamptz)`,
			[randomUUID(), shop.id, customer.id, paid.amount, invoiceId, paidAt]
		);
	}
}

async function connectDemoWallet(shop: Shop, mode: DemoMode) {
	if (config.demoShopNwcUrl) {
		try {
			const details = await inspectNwc(config.demoShopNwcUrl);
			await setWallet(shop.id, {
				kind: 'nwc',
				secret: config.demoShopNwcUrl,
				label: details.alias || 'Lightning'
			});
			return;
		} catch (err) {
			log.warn('demo.wallet_failed', { kind: 'configured', reason: describeError(err) });
		}
	}
	if (mode === 'faucet') {
		try {
			const url = await createFaucetWallet(10_000);
			await setWallet(shop.id, { kind: 'nwc', secret: url, label: 'NWC Faucet' });
			return;
		} catch (err) {
			log.warn('demo.wallet_failed', { kind: 'faucet', reason: describeError(err) });
		}
	}
	await setWallet(shop.id, { kind: 'demo', secret: null, label: 'Démo' });
}

export type DemoResult = { ok: true; shop: Shop } | { ok: false; error: 'off' | 'slow_down' };

export async function createDemoShop(
	client: string,
	locale: Locale,
	mode: DemoMode = config.demo
): Promise<DemoResult> {
	if (mode === 'off') return { ok: false, error: 'off' };
	const limit = await hit(clientKey('demo', client), DEMO_LIMIT);
	if (!limit.allowed) return { ok: false, error: 'slow_down' };

	const db = await getDb();
	await db.query("delete from shops where is_demo and created_at < now() - interval '1 day'");

	const now = Date.now();
	const shop = await db.tx(async (q) => {
		const created = await insertShop(q, {
			name: 'Boutique Diallo',
			place: 'Médina, Dakar',
			phoneHmac: 'demo:' + randomUUID(),
			// Not a valid hash: nobody can ever sign in to a demo shop with a PIN.
			pinHash: '!',
			locale,
			isDemo: true
		});
		for (const [index, spec] of CUSTOMERS.entries()) {
			await seedCustomer(q, created, spec, index, now);
		}
		return created;
	});

	await connectDemoWallet(shop, mode);
	log.info('demo.created', { shop: shop.id });
	return { ok: true, shop };
}
