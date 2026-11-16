import { listCustomers } from '#lib/server/customers.ts';
import { shopTotals } from '#lib/server/entries.ts';
import { reconcileQuietly } from '#lib/server/invoices.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const shop = locals.shop!;
	await reconcileQuietly(shop.id);
	const [customers, totals] = await Promise.all([listCustomers(shop.id), shopTotals(shop.id)]);
	return {
		customers: customers.map((customer) => ({
			id: customer.id,
			name: customer.name,
			balanceXof: customer.balanceXof,
			creditLimitXof: customer.creditLimitXof,
			lastActivityAt: customer.lastActivityAt?.toISOString() ?? null
		})),
		totals
	};
};
