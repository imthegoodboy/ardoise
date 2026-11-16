import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { isImportConfigured, readNotebookPage, resolveDate, setAnthropicClient } from './import.ts';

function stub(response: unknown, seen: unknown[] = []): Anthropic {
	return {
		beta: {
			messages: {
				parse: async (params: unknown) => {
					seen.push(params);
					return response;
				}
			}
		}
	} as unknown as Anthropic;
}

const image = { data: 'aGVsbG8=', mediaType: 'image/jpeg' as const };
const today = new Date('2026-11-16T10:00:00Z');

afterEach(() => setAnthropicClient(undefined));

describe('notebook import', () => {
	const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
	it.skipIf(hasKey)('is off without credentials', async () => {
		expect(isImportConfigured()).toBe(false);
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'not_configured' });
	});

	it('turns a transcription into reviewable lines', async () => {
		const seen: unknown[] = [];
		setAnthropicClient(
			stub(
				{
					stop_reason: 'end_turn',
					model: 'claude-opus-5-5',
					parsed_output: {
						lines: [
							{
								customer: 'Awa',
								item: 'Riz 5 kg',
								amount_xof: 2750,
								date: '12/11',
								kind: 'purchase',
								crossed_out: false,
								unsure: false
							},
							{
								customer: 'Awa',
								item: 'versement',
								amount_xof: 2000,
								date: '14/11',
								kind: 'payment',
								crossed_out: false,
								unsure: false
							},
							{
								customer: 'Modou',
								item: 'Pain',
								amount_xof: 150.4,
								date: '28/12',
								kind: 'purchase',
								crossed_out: true,
								unsure: true
							},
							{
								customer: '  ',
								item: 'orphan',
								amount_xof: 500,
								date: null,
								kind: 'purchase',
								crossed_out: false,
								unsure: false
							},
							{
								customer: 'Total',
								item: '',
								amount_xof: 0,
								date: null,
								kind: 'purchase',
								crossed_out: false,
								unsure: false
							}
						]
					}
				},
				seen
			)
		);
		const result = await readNotebookPage(image, today);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.lines).toEqual([
			{
				customer: 'Awa',
				item: 'Riz 5 kg',
				amountXof: 2750,
				date: '2026-11-12',
				kind: 'purchase',
				crossedOut: false,
				unsure: false
			},
			{
				customer: 'Awa',
				item: 'versement',
				amountXof: 2000,
				date: '2026-11-14',
				kind: 'payment_cash',
				crossedOut: false,
				unsure: false
			},
			// 28 December has not happened yet this year, so it was last year.
			{
				customer: 'Modou',
				item: 'Pain',
				amountXof: 150,
				date: '2025-12-28',
				kind: 'purchase',
				crossedOut: true,
				unsure: true
			}
		]);
		const params = seen[0] as {
			model: string;
			fallbacks: string;
			messages: { content: { type: string }[] }[];
		};
		expect(params.model).toBe('claude-opus-5-5');
		expect(params.fallbacks).toBe('default');
		expect(params.messages[0].content[0].type).toBe('image');
	});

	it('reports a refusal instead of an empty page', async () => {
		setAnthropicClient(
			stub({ stop_reason: 'refusal', stop_details: { category: null }, parsed_output: null })
		);
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'refused' });
	});

	it('survives an API failure', async () => {
		setAnthropicClient({
			beta: { messages: { parse: async () => Promise.reject(new Error('socket hang up')) } }
		} as unknown as Anthropic);
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'failed' });
	});

	it('reads the dates people write', () => {
		expect(resolveDate('3/11', today)).toBe('2026-11-03');
		expect(resolveDate('03.11.2026', today)).toBe('2026-11-03');
		expect(resolveDate('3/11/26', today)).toBe('2026-11-03');
		expect(resolveDate('31/02', today)).toBeNull();
		expect(resolveDate('mardi', today)).toBeNull();
		expect(resolveDate('20/11/2027', today)).toBeNull();
		expect(resolveDate(null, today)).toBeNull();
	});
});
