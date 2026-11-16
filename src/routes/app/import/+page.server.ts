import { fail } from '@sveltejs/kit';
import * as z from 'zod';
import { MAX_ENTRY_XOF } from '#lib/money.ts';
import { isImportConfigured, readNotebookPage, type ImageType } from '#lib/server/ai/import.ts';
import { createCustomer, listCustomers } from '#lib/server/customers.ts';
import { getDb } from '#lib/server/db/index.ts';
import { addEntry } from '#lib/server/entries.ts';
import { log } from '#lib/server/log.ts';
import { clientKey, hit } from '#lib/server/ratelimit.ts';
import { cleanText } from '#lib/server/validate.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const READ_LIMIT = { max: 20, windowSeconds: 3600 };
const TYPES: ImageType[] = ['image/jpeg', 'image/png', 'image/webp'];

export const load: PageServerLoad = async ({ locals }) => {
	const customers = await listCustomers(locals.shop!.id);
	return {
		configured: isImportConfigured(),
		names: customers.map((customer) => customer.name)
	};
};

const SavedLines = z
	.array(
		z.object({
			id: z.uuid(),
			customer: z.string(),
			item: z.string(),
			amountXof: z.number().int().min(1).max(MAX_ENTRY_XOF),
			date: z.iso.date().nullable(),
			kind: z.enum(['purchase', 'payment_cash'])
		})
	)
	.max(200);

export const actions: Actions = {
	read: async ({ request, locals }) => {
		const shop = locals.shop!;
		if (!isImportConfigured()) return fail(503, { readError: 'not_configured' as const });

		const form = await request.formData();
		const photo = form.get('photo');
		if (!(photo instanceof File) || photo.size === 0)
			return fail(400, { readError: 'failed' as const });
		if (photo.size > MAX_PHOTO_BYTES) return fail(413, { readError: 'too_big' as const });
		const mediaType = TYPES.find((type) => type === photo.type);
		if (!mediaType) return fail(415, { readError: 'failed' as const });

		const limit = await hit(clientKey('ai-import', shop.id), READ_LIMIT);
		if (!limit.allowed) return fail(429, { readError: 'slow_down' as const });

		const data = Buffer.from(await photo.arrayBuffer()).toString('base64');
		const result = await readNotebookPage({ data, mediaType });
		if (!result.ok) return fail(502, { readError: result.error });
		if (!result.lines.length) return fail(422, { readError: 'nothing' as const });
		return { lines: result.lines };
	},

	save: async ({ request, locals }) => {
		const shop = locals.shop!;
		const form = await request.formData();
		let raw: unknown;
		try {
			raw = JSON.parse(String(form.get('lines') ?? '[]'));
		} catch {
			return fail(400, { saveError: true });
		}
		const parsed = SavedLines.safeParse(raw);
		if (!parsed.success || !parsed.data.length) return fail(400, { saveError: true });

		const existing = await listCustomers(shop.id);
		const byName = new Map(existing.map((customer) => [customer.name.toLowerCase(), customer.id]));

		const db = await getDb();
		const added = await db.tx(async (q) => {
			let count = 0;
			for (const line of parsed.data) {
				const name = cleanText(line.customer, 60);
				if (!name) continue;
				let customerId = byName.get(name.toLowerCase());
				if (!customerId) {
					customerId = (await createCustomer(shop.id, { name }, q)).id;
					byName.set(name.toLowerCase(), customerId);
				}
				const result = await addEntry(
					shop.id,
					{
						id: line.id,
						customerId,
						kind: line.kind,
						amountXof: line.amountXof,
						label: cleanText(line.item, 80) || (line.kind === 'payment_cash' ? 'Espèces' : ''),
						occurredAt: line.date ? new Date(line.date + 'T12:00:00Z') : undefined
					},
					q
				);
				if (result === 'created') count++;
			}
			return count;
		});
		log.info('import.saved', { shop: shop.id, lines: added });
		return { added };
	}
};
