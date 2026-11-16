import { error, fail, redirect } from '@sveltejs/kit';
import { config as settings } from '#lib/server/config.ts';
import { createDemoShop } from '#lib/server/demo.ts';
import { endSession, startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';

/** On Vercel: A faucet wallet is created for each demo shop. */
export const config: Config = { maxDuration: 60 };

export const load: PageServerLoad = () => {
	if (settings.demo === 'off') error(404, 'Not found');
	return {
		wallet: settings.demoShopNwcUrl ? 'real' : settings.demo === 'faucet' ? 'faucet' : 'simulated'
	} as const;
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		if (settings.demo === 'off') error(404, 'Not found');
		const result = await createDemoShop(locals.client, locals.locale);
		if (!result.ok) return fail(429, { error: result.error });
		// A visitor who was signed in to a real shop leaves it cleanly.
		if (locals.shop) await endSession(cookies);
		await startSession(cookies, result.shop.id, 1);
		redirect(303, '/app');
	}
};
