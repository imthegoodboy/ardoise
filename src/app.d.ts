import type { Locale } from '#lib/money.ts';
import type { Shop } from '#lib/server/shops.ts';

declare global {
	namespace App {
		interface Locals {
			/** The signed-in shop, if any. */
			shop: Shop | null;
			sessionToken: string | null;
			locale: Locale;
			/** The requester's address, used only (hashed) for rate limits. */
			client: string;
		}
		interface PageData {
			locale: Locale;
		}
	}
}

export {};
