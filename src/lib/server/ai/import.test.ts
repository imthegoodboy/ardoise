import { afterEach, describe, expect, it } from 'vitest';
import { isImportConfigured, readNotebookPage, resolveDate, setGeminiForTests } from './import.ts';

const image = { data: 'aGVsbG8=', mediaType: 'image/jpeg' as const };
const today = new Date('2026-11-16T10:00:00Z');

function gemini(body: unknown, status = 200, seen: { url: string; init: RequestInit }[] = []) {
	setGeminiForTests({
		key: 'test-key',
		fetch: (async (url: string, init: RequestInit) => {
			seen.push({ url, init });
			return new Response(JSON.stringify(body), { status });
		}) as unknown as typeof fetch
	});
	return seen;
}

const answer = (lines: unknown[], finishReason = 'STOP') => ({
	candidates: [{ content: { parts: [{ text: JSON.stringify({ lines }) }] }, finishReason }]
});

const line = (customer: string, item: string, amount: number, date: string | null, extra = {}) => ({
	customer,
	item,
	amount_xof: amount,
	date,
	kind: 'purchase',
	crossed_out: false,
	unsure: false,
	...extra
});

afterEach(() => setGeminiForTests(undefined));

describe('notebook import', () => {
	const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
	it.skipIf(hasKey)('is off without credentials', async () => {
		expect(isImportConfigured()).toBe(false);
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'not_configured' });
	});

	it('turns a transcription into reviewable lines', async () => {
		const seen = gemini(
			answer([
				line('Awa', 'Riz 5 kg', 2750, '12/11'),
				line('Awa', 'versement', 2000, '14/11', { kind: 'payment' }),
				line('Modou', 'Pain', 150.4, '28/12', { crossed_out: true, unsure: true }),
				line('  ', 'orphan', 500, null),
				line('Total', '', 0, null)
			])
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

		const { url, init } = seen[0];
		expect(url).toContain('/models/gemini-3.5-flash:generateContent');
		expect(url).not.toContain('test-key');
		expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
		const body = JSON.parse(String(init.body));
		expect(body.contents[0].parts[0].inlineData.mimeType).toBe('image/jpeg');
		expect(body.generationConfig.responseMimeType).toBe('application/json');
	});

	it('reports a safety block instead of an empty page', async () => {
		gemini({ promptFeedback: { blockReason: 'SAFETY' } });
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'refused' });
		gemini(answer([], 'PROHIBITED_CONTENT'));
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'refused' });
	});

	it('rejects output that does not match the schema', async () => {
		gemini({ candidates: [{ content: { parts: [{ text: '{"lines":[{"customer":1}]}' }] } }] });
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'failed' });
	});

	it('treats a rejected key as not configured, and survives outages', async () => {
		gemini({ error: { message: 'API key not valid' } }, 403);
		expect(await readNotebookPage(image, today)).toEqual({ ok: false, error: 'not_configured' });
		setGeminiForTests({
			key: 'test-key',
			fetch: (() => Promise.reject(new Error('socket hang up'))) as unknown as typeof fetch
		});
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
