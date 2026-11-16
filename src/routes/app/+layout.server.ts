import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// hooks.server.ts already redirects signed-out visitors; this narrows the type.
	const shop = locals.shop;
	if (!shop) error(401, 'Signed out');
	return {
		shop: {
			id: shop.id,
			name: shop.name,
			place: shop.place,
			isDemo: shop.isDemo,
			walletKind: shop.walletKind
		}
	};
};
