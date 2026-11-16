/**
 * Reading a page of a paper credit notebook with Gemini.
 *
 * Shops do not start from zero: they have months of tabs in a school
 * exercise book. One photo per page, the model transcribes it into lines, and
 * the shopkeeper checks every line before anything is written to the book.
 * The photo is sent once and never stored by Ardoise.
 */
import * as z from 'zod';
import { MAX_ENTRY_XOF } from '#lib/money.ts';
import { config } from '../config.ts';
import { describeError, log } from '../log.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** What the model must return; checked again on our side, never trusted as-is. */
const PageSchema = z.object({
	lines: z.array(
		z.object({
			customer: z.string(),
			item: z.string(),
			amount_xof: z.number(),
			date: z.string().nullable(),
			kind: z.enum(['purchase', 'payment']),
			crossed_out: z.boolean(),
			unsure: z.boolean()
		})
	)
});

/** The same shape in the OpenAPI subset Gemini uses for constrained JSON output. */
const RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		lines: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					customer: {
						type: 'STRING',
						description: 'Customer name as written, or the page heading.'
					},
					item: { type: 'STRING', description: 'What was taken; empty if only an amount.' },
					amount_xof: { type: 'NUMBER', description: 'Amount in CFA francs, digits only.' },
					date: {
						type: 'STRING',
						nullable: true,
						description: 'Date as written, as DD/MM or DD/MM/YYYY; null if none.'
					},
					kind: { type: 'STRING', enum: ['purchase', 'payment'] },
					crossed_out: { type: 'BOOLEAN', description: 'Struck through or ticked as paid.' },
					unsure: { type: 'BOOLEAN', description: 'Any part of the line was hard to read.' }
				},
				required: ['customer', 'item', 'amount_xof', 'date', 'kind', 'crossed_out', 'unsure']
			}
		}
	},
	required: ['lines']
};

const SYSTEM = `You transcribe pages of handwritten credit notebooks ("cahiers de crédit") kept by small shops (boutiques) in Senegal and West Africa.

The page is usually in French, sometimes mixed with Wolof. Each line records something a customer took on credit, or a payment they made. Layouts vary:
- a page per customer, with the name as a heading and one line per purchase;
- a running list where each line starts with the customer's name;
- dates in the margin ("12/11"), often written once for several lines below them.

Amounts are in CFA francs (F, FCFA, CFA). Thousands may be written "2.750", "2 750" or "2750"; a trailing "F" is the currency, not a digit. Common items: riz, huile, sucre, pain, lait, café Touba, savon, gaz, oignons, tomate, crédit (phone credit).

Return one entry per line that has an amount. Use kind "payment" for lines that record money received (payé, versé, versement, avance, reçu, or a minus sign). Carry a margin date down to the lines it covers. Mark crossed_out for lines that are struck through or ticked as paid. Mark unsure whenever a name, item or amount is a guess. Do not invent lines; skip totals and headings that are not purchases. If the photo is not a notebook page, return no lines.`;

export interface ImportedLine {
	customer: string;
	item: string;
	amountXof: number;
	/** ISO date (YYYY-MM-DD) or null */
	date: string | null;
	kind: 'purchase' | 'payment_cash';
	crossedOut: boolean;
	unsure: boolean;
}

export type ReadPageResult =
	| { ok: true; lines: ImportedLine[] }
	| { ok: false; error: 'not_configured' | 'failed' | 'refused' };

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

type Fetch = typeof fetch;
let fetchImpl: Fetch | undefined;
let keyOverride: string | undefined;

/** Tests swap the network (and the key) for stubs; `undefined` restores the defaults. */
export function setGeminiForTests(stub: { fetch: Fetch; key: string } | undefined) {
	fetchImpl = stub?.fetch;
	keyOverride = stub?.key;
}

const apiKey = () => keyOverride ?? config.geminiApiKey;

export function isImportConfigured(): boolean {
	return Boolean(apiKey());
}

/** "12/11" or "12/11/26" written on a page: the most recent such date not in the future. */
export function resolveDate(written: string | null, today = new Date()): string | null {
	if (!written) return null;
	const match = written.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
	if (!match) return null;
	const day = Number(match[1]);
	const month = Number(match[2]);
	if (day < 1 || day > 31 || month < 1 || month > 12) return null;

	let year = match[3] ? Number(match[3]) : today.getUTCFullYear();
	if (year < 100) year += 2000;
	let date = new Date(Date.UTC(year, month - 1, day, 12));
	if (date.getUTCMonth() !== month - 1) return null;
	if (!match[3] && date.getTime() > today.getTime() + 86_400_000) {
		date = new Date(Date.UTC(year - 1, month - 1, day, 12));
	}
	if (date.getTime() > today.getTime() + 86_400_000) return null;
	if (today.getTime() - date.getTime() > 3 * 365 * 86_400_000) return null;
	return date.toISOString().slice(0, 10);
}

const tidy = (text: string, max: number) =>
	text
		.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);

interface GeminiResponse {
	candidates?: {
		content?: { parts?: { text?: string; thought?: boolean }[] };
		finishReason?: string;
	}[];
	promptFeedback?: { blockReason?: string };
}

const BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

async function callGemini(image: { data: string; mediaType: ImageType }): Promise<Response> {
	const doFetch = fetchImpl ?? fetch;
	const body = JSON.stringify({
		systemInstruction: { parts: [{ text: SYSTEM }] },
		contents: [
			{
				role: 'user',
				parts: [
					{ inlineData: { mimeType: image.mediaType, data: image.data } },
					{ text: 'Transcribe this notebook page.' }
				]
			}
		],
		generationConfig: {
			responseMimeType: 'application/json',
			responseSchema: RESPONSE_SCHEMA,
			temperature: 0
		}
	});
	const request = () =>
		doFetch(`${API}/${encodeURIComponent(config.aiModel)}:generateContent`, {
			method: 'POST',
			// The key travels in a header, never in the URL, so it cannot end up in a log.
			headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() },
			body,
			signal: AbortSignal.timeout(60_000)
		});

	const first = await request();
	if (first.status !== 429 && first.status < 500) return first;
	// One retry for overload or a transient server error.
	await new Promise((resolve) => setTimeout(resolve, 1_500));
	return request();
}

export async function readNotebookPage(
	image: { data: string; mediaType: ImageType },
	today = new Date()
): Promise<ReadPageResult> {
	if (!isImportConfigured()) return { ok: false, error: 'not_configured' };

	let payload: GeminiResponse;
	try {
		const response = await callGemini(image);
		if (response.status === 401 || response.status === 403) {
			log.error('ai.import.auth', { status: response.status });
			return { ok: false, error: 'not_configured' };
		}
		if (!response.ok) {
			log.warn('ai.import.api_error', { status: response.status });
			return { ok: false, error: 'failed' };
		}
		payload = await response.json();
	} catch (err) {
		log.warn('ai.import.failed', { reason: describeError(err) });
		return { ok: false, error: 'failed' };
	}

	const candidate = payload.candidates?.[0];
	if (payload.promptFeedback?.blockReason || BLOCKED.has(candidate?.finishReason ?? '')) {
		log.warn('ai.import.refused', {
			reason: payload.promptFeedback?.blockReason ?? candidate?.finishReason ?? null
		});
		return { ok: false, error: 'refused' };
	}

	const text = (candidate?.content?.parts ?? [])
		.filter((part) => !part.thought && typeof part.text === 'string')
		.map((part) => part.text)
		.join('');
	let page;
	try {
		page = PageSchema.parse(JSON.parse(text));
	} catch {
		log.warn('ai.import.unparsed', { finish: candidate?.finishReason ?? null });
		return { ok: false, error: 'failed' };
	}

	const lines: ImportedLine[] = [];
	for (const line of page.lines.slice(0, 200)) {
		const amountXof = Math.round(line.amount_xof);
		if (!Number.isFinite(amountXof) || amountXof < 1 || amountXof > MAX_ENTRY_XOF) continue;
		const customer = tidy(line.customer, 60);
		if (!customer) continue;
		lines.push({
			customer,
			item: tidy(line.item, 80),
			amountXof,
			date: resolveDate(line.date, today),
			kind: line.kind === 'payment' ? 'payment_cash' : 'purchase',
			crossedOut: line.crossed_out,
			unsure: line.unsure
		});
	}
	log.info('ai.import.read', { lines: lines.length, model: config.aiModel });
	return { ok: true, lines };
}
