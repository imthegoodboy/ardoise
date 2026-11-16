/**
 * Reading a page of a paper credit notebook with Claude.
 *
 * Shops do not start from zero: they have months of tabs in a school
 * exercise book. One photo per page, Claude transcribes it into lines, and
 * the shopkeeper checks every line before anything is written to the book.
 * The photo is sent once and never stored by Ardoise.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod';
import { MAX_ENTRY_XOF } from '#lib/money.ts';
import { config } from '../config.ts';
import { describeError, log } from '../log.ts';

const PageSchema = z.object({
	lines: z.array(
		z.object({
			customer: z.string().describe('Customer name as written, or the page heading name.'),
			item: z.string().describe('What was taken, as written; empty if only an amount.'),
			amount_xof: z.number().describe('Amount in CFA francs, digits only.'),
			date: z
				.string()
				.nullable()
				.describe('Date as written, normalised to DD/MM or DD/MM/YYYY; null if none.'),
			kind: z.enum(['purchase', 'payment']),
			crossed_out: z.boolean().describe('True if the line is struck through or marked paid.'),
			unsure: z.boolean().describe('True if any part of the line was hard to read.')
		})
	)
});

const SYSTEM = `You transcribe pages of handwritten credit notebooks ("cahiers de crédit") kept by small shops (boutiques) in Senegal and West Africa.

The page is usually in French, sometimes mixed with Wolof. Each line records something a customer took on credit, or a payment they made. Layouts vary:
- a page per customer, with the name as a heading and one line per purchase;
- a running list where each line starts with the customer's name;
- dates in the margin ("12/11"), often written once for several lines below them.

Amounts are in CFA francs (F, FCFA, CFA). Thousands may be written "2.750", "2 750" or "2750"; a trailing "F" is the currency, not a digit. Common items: riz, huile, sucre, pain, lait, café Touba, savon, gaz, oignons, tomate, crédit (phone credit).

Return one entry per line that has an amount. Use kind "payment" for lines that record money received (payé, versement, avance, reçu, "-"). Carry a margin date down to the lines it covers. Mark crossed_out for lines that are struck through or ticked as paid. Mark unsure whenever a name, item or amount is a guess. Do not invent lines; skip totals and page headings that are not purchases. If the photo is not a notebook page, return no lines.`;

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

let client: Anthropic | undefined;

/** Tests inject a stub; production builds one from the environment's credentials. */
export function setAnthropicClient(stub: Anthropic | undefined) {
	client = stub;
}

export function isImportConfigured(): boolean {
	return Boolean(client || config.anthropicApiKey);
}

function getClient(): Anthropic {
	client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 });
	return client;
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

export async function readNotebookPage(
	image: { data: string; mediaType: ImageType },
	today = new Date()
): Promise<ReadPageResult> {
	if (!isImportConfigured()) return { ok: false, error: 'not_configured' };

	let response;
	try {
		response = await getClient().beta.messages.parse({
			model: config.aiModel,
			max_tokens: 16000,
			// If a safety classifier declines a benign page, retry on Anthropic's
			// recommended fallback model instead of failing the import.
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			output_config: { effort: 'medium', format: betaZodOutputFormat(PageSchema) },
			system: SYSTEM,
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'image',
							source: { type: 'base64', media_type: image.mediaType, data: image.data }
						},
						{ type: 'text', text: 'Transcribe this notebook page.' }
					]
				}
			]
		});
	} catch (err) {
		if (
			err instanceof Anthropic.AuthenticationError ||
			err instanceof Anthropic.PermissionDeniedError
		) {
			log.error('ai.import.auth', { reason: describeError(err) });
			return { ok: false, error: 'not_configured' };
		}
		if (err instanceof Anthropic.RateLimitError) {
			log.warn('ai.import.rate_limited');
		} else if (err instanceof Anthropic.APIError) {
			log.warn('ai.import.api_error', { status: err.status, reason: describeError(err) });
		} else {
			log.warn('ai.import.failed', { reason: describeError(err) });
		}
		return { ok: false, error: 'failed' };
	}

	if (response.stop_reason === 'refusal') {
		log.warn('ai.import.refused', { category: response.stop_details?.category ?? null });
		return { ok: false, error: 'refused' };
	}
	const page = response.parsed_output;
	if (!page) {
		log.warn('ai.import.unparsed', { stop: response.stop_reason ?? null });
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
	log.info('ai.import.read', { lines: lines.length, model: response.model });
	return { ok: true, lines };
}
