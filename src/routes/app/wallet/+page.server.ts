import { fail } from '@sveltejs/kit';
import { confirmPin } from '#lib/server/auth.ts';
import { config as settings } from '#lib/server/config.ts';
import { describeError, log } from '#lib/server/log.ts';
import { clientKey, hit } from '#lib/server/ratelimit.ts';
import { clearWallet, getShop, setWallet, walletSecret } from '#lib/server/shops.ts';
import { cleanText } from '#lib/server/validate.ts';
import { inspectNwc } from '#lib/server/wallet/nwc.ts';
import { WalletError } from '#lib/server/wallet/types.ts';
import type { Actions, PageServerLoad } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';

/** On Vercel: Testing a wallet means a round trip over Nostr relays. */
export const config: Config = { maxDuration: 60 };

export const load: PageServerLoad = async ({ locals }) => {
	const shop = (await getShop(locals.shop!.id))!;
	let faucet = false;
	if (shop.walletKind === 'nwc' && shop.isDemo) {
		faucet =
			(await walletSecret(shop.id))?.includes('getalby.com') === true && settings.demo === 'faucet';
	}
	return {
		wallet: {
			kind: shop.walletKind,
			label: shop.walletLabel,
			connectedAt: shop.walletConnectedAt?.toISOString() ?? null,
			faucet
		}
	};
};

const CONNECT_LIMIT = { max: 10, windowSeconds: 600 };

/** Sensitive changes ask for the PIN again. Demo shops have none to ask for. */
async function pinOk(shopId: string, isDemo: boolean, pin: string) {
	if (isDemo) return 'ok' as const;
	return confirmPin(shopId, pin);
}

export const actions: Actions = {
	connect: async ({ request, locals }) => {
		const shop = locals.shop!;
		const form = await request.formData();
		const url = String(form.get('url') ?? '')
			.trim()
			.slice(0, 2000);

		const pin = await pinOk(shop.id, shop.isDemo, cleanText(form.get('pin'), 12));
		if (pin !== 'ok') return fail(400, { error: pin === 'locked' ? 'locked' : 'pin' });

		const limit = await hit(clientKey('wallet-connect', shop.id), CONNECT_LIMIT);
		if (!limit.allowed) return fail(429, { error: 'locked' });

		try {
			const details = await inspectNwc(url);
			const label = details.alias || details.relayHosts[0] || 'Lightning';
			await setWallet(shop.id, { kind: 'nwc', secret: url, label });
			log.info('wallet.connected', { shop: shop.id, relays: details.relayHosts.join(',') });
			return { connected: true };
		} catch (err) {
			const code = err instanceof WalletError ? err.code : 'unreachable';
			log.warn('wallet.connect_failed', { shop: shop.id, code, reason: describeError(err) });
			return fail(400, { error: code });
		}
	},

	disconnect: async ({ request, locals }) => {
		const shop = locals.shop!;
		const form = await request.formData();
		const pin = await pinOk(shop.id, shop.isDemo, cleanText(form.get('pin'), 12));
		if (pin !== 'ok') return fail(400, { error: pin === 'locked' ? 'locked' : 'pin' });
		await clearWallet(shop.id);
		log.info('wallet.disconnected', { shop: shop.id });
		return { disconnected: true };
	}
};
