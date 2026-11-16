/**
 * Input hygiene shared by every form and endpoint. Everything from a request
 * is untrusted: strings are trimmed, stripped of control characters and
 * capped; ids must look like ids before they reach a query.
 */
import * as z from 'zod';
import { MAX_ENTRY_XOF, parseAmount } from '#lib/money.ts';
import { normalizePhone } from '#lib/phone.ts';

export function cleanText(value: unknown, max: number): string {
	if (typeof value !== 'string') return '';
	const text = value
		.normalize('NFC')
		.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return [...text].slice(0, max).join('').trim();
}

export const isUuid = (value: unknown): value is string =>
	typeof value === 'string' && z.uuid().safeParse(value).success;

const amount = z.unknown().transform((value, ctx) => {
	const parsed = parseAmount(value);
	if (parsed === null || parsed > MAX_ENTRY_XOF) {
		ctx.addIssue({ code: 'custom', message: 'amount' });
		return z.NEVER;
	}
	return parsed;
});

export const entrySchema = z.object({
	id: z.uuid(),
	customerId: z.uuid(),
	kind: z.enum(['purchase', 'payment_cash']),
	amountXof: amount,
	label: z
		.unknown()
		.optional()
		.transform((value) => cleanText(value, 80)),
	occurredAt: z.iso
		.datetime({ offset: true })
		.optional()
		.transform((value) => (value ? new Date(value) : undefined))
});

export type EntryInput = z.infer<typeof entrySchema>;

export interface CustomerFields {
	name: string;
	phone: string | null;
	creditLimitXof: number | null;
}

export type CustomerFieldsResult =
	| { ok: true; value: CustomerFields }
	| { ok: false; error: 'name_required' | 'phone_invalid' | 'limit_invalid' };

export function readCustomerForm(form: FormData): CustomerFieldsResult {
	const name = cleanText(form.get('name'), 60);
	if (!name) return { ok: false, error: 'name_required' };

	const rawPhone = cleanText(form.get('phone'), 30);
	const phone = rawPhone ? normalizePhone(rawPhone) : null;
	if (rawPhone && !phone) return { ok: false, error: 'phone_invalid' };

	const rawLimit = cleanText(form.get('limit'), 20);
	const creditLimitXof = rawLimit ? parseAmount(rawLimit) : null;
	if (rawLimit && (creditLimitXof === null || creditLimitXof > MAX_ENTRY_XOF * 5)) {
		return { ok: false, error: 'limit_invalid' };
	}
	return { ok: true, value: { name, phone, creditLimitXof } };
}
