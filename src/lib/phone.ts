/**
 * Phone numbers, as people in Senegal actually write them.
 * `77 123 45 67`, `771234567`, `+221 77 123 45 67` and `00221771234567` are
 * the same number. Numbers from other countries need their `+` prefix.
 */

const DEFAULT_COUNTRY = '221';

/** Returns the number in E.164 form (`+221771234567`) or null if it can't be one. */
export function normalizePhone(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	let text = input.trim().replace(/[\s().\-\u00a0\u202f]/g, '');
	if (text.startsWith('00')) text = '+' + text.slice(2);

	if (text.startsWith('+')) {
		const digits = text.slice(1);
		return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
	}
	if (!/^\d+$/.test(text)) return null;

	// Senegalese national numbers are 9 digits: mobiles start with 7, landlines with 3.
	if (/^[37]\d{8}$/.test(text)) return '+' + DEFAULT_COUNTRY + text;
	if (text.startsWith(DEFAULT_COUNTRY) && /^[37]\d{8}$/.test(text.slice(3))) return '+' + text;
	return null;
}

/** `+221771234567` -> `77 123 45 67` for Senegal, grouped digits otherwise. */
export function displayPhone(e164: string): string {
	if (e164.startsWith('+' + DEFAULT_COUNTRY) && e164.length === 13) {
		const n = e164.slice(4);
		return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
	}
	return e164;
}

/** WhatsApp's click-to-chat wants the international number without the plus sign. */
export function whatsappNumber(e164: string): string {
	return e164.replace(/^\+/, '');
}
