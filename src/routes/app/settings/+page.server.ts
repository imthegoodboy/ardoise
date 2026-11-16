import { fail, redirect } from '@sveltejs/kit';
import {
	changePin,
	confirmPin,
	destroyAllSessions,
	isValidPin,
	isWeakPin
} from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';
import { endSession, setLocaleCookie, startSession } from '#lib/server/session.ts';
import { listAllCustomers, setArchived } from '#lib/server/customers.ts';
import { deleteShop, updateShop } from '#lib/server/shops.ts';
import { cleanText, isUuid } from '#lib/server/validate.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const shop = locals.shop!;
	const archived = (await listAllCustomers(shop.id))
		.filter((customer) => customer.archived)
		.map((customer) => ({ id: customer.id, name: customer.name }));
	return { settings: { name: shop.name, place: shop.place, locale: shop.locale }, archived };
};

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		const form = await request.formData();
		const id = form.get('customerId');
		if (!isUuid(id)) return fail(400, { restoreError: true });
		await setArchived(locals.shop!.id, id, false);
		return { restored: true };
	},

	shop: async ({ request, locals, cookies }) => {
		const shop = locals.shop!;
		const form = await request.formData();
		const name = cleanText(form.get('name'), 60);
		const place = cleanText(form.get('place'), 60);
		const locale = form.get('locale') === 'en' ? 'en' : 'fr';
		if (!name) return fail(400, { shopError: 'name_required' as const });
		await updateShop(shop.id, { name, place, locale });
		setLocaleCookie(cookies, locale);
		return { shopSaved: true };
	},

	pin: async ({ request, locals, cookies }) => {
		const shop = locals.shop!;
		const form = await request.formData();
		const current = cleanText(form.get('current'), 12);
		const next = cleanText(form.get('next'), 12);
		const check = await confirmPin(shop.id, current);
		if (check !== 'ok')
			return fail(400, { pinError: check === 'locked' ? 'slow_down' : 'pin_wrong' });
		if (!isValidPin(next)) return fail(400, { pinError: 'pin_invalid' as const });
		if (isWeakPin(next)) return fail(400, { pinError: 'pin_weak' as const });
		await changePin(shop.id, next);
		// Anyone who learned the old code is out; this phone stays signed in.
		await destroyAllSessions(shop.id);
		await startSession(cookies, shop.id);
		log.info('auth.pin_changed', { shop: shop.id });
		return { pinChanged: true };
	},

	logoutAll: async ({ locals, cookies }) => {
		await destroyAllSessions(locals.shop!.id);
		await endSession(cookies);
		redirect(303, '/bye?to=login');
	},

	delete: async ({ request, locals, cookies }) => {
		const shop = locals.shop!;
		if (!shop.isDemo) {
			const form = await request.formData();
			const check = await confirmPin(shop.id, cleanText(form.get('pin'), 12));
			if (check !== 'ok') {
				return fail(400, { deleteError: check === 'locked' ? 'slow_down' : 'pin_wrong' });
			}
		}
		await endSession(cookies);
		await deleteShop(shop.id);
		log.info('shop.deleted', { shop: shop.id });
		redirect(303, '/bye');
	}
};
