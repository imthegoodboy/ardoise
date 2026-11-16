import { describe, expect, it } from 'vitest';
import { safeNext } from './session.ts';

describe('where to go after signing in', () => {
	it.each(['/app', '/app/c/123?x=1', '/p/abc'])('keeps the same-site path %s', (path) => {
		expect(safeNext(path)).toBe(path);
	});

	it.each([
		'https://evil.example',
		'//evil.example',
		'/\\evil.example',
		'/\t/evil.example',
		'/\n/evil.example',
		'/\u0000/x',
		'app',
		'',
		null,
		undefined
	])('refuses %j', (path) => {
		expect(safeNext(path)).toBe('/app');
	});
});
