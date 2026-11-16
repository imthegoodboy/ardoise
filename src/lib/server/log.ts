/**
 * Structured logs, one JSON object per line.
 *
 * Rule: nothing personal or secret is ever logged. Callers pass route ids and
 * counters, never URLs (pay links carry tokens), bodies, names, phone numbers
 * or wallet strings. As a second line of defence, `scrub` masks anything that
 * looks like one of those before a line is written.
 */
import { config } from './config.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const PATTERNS: [RegExp, string][] = [
	[/nostr\+walletconnect:\/\/\S+/gi, '[nwc-url]'],
	[/\b(secret|token|pin|preimage|password)=[^&\s"]+/gi, '$1=[redacted]'],
	[/\blni?(bc|tb|bcrt)[0-9a-z]{20,}/gi, '[invoice]'],
	[/\bsk-ant-[\w-]+/g, '[api-key]'],
	[/\+?\d[\d\s().-]{7,}\d/g, '[number]'],
	[/\b[0-9a-f]{64}\b/gi, '[hex64]']
];

export function scrub(text: string): string {
	let out = text;
	for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
	return out.length > 600 ? out.slice(0, 600) + '…' : out;
}

type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: Level, msg: string, fields?: Fields) {
	if (order[level] < (order[config.logLevel] ?? 20)) return;
	const line: Record<string, unknown> = { t: new Date().toISOString(), level, msg };
	if (fields) {
		for (const [k, v] of Object.entries(fields)) {
			line[k] = typeof v === 'string' ? scrub(v) : v;
		}
	}
	const text = JSON.stringify(line);
	if (level === 'error' || level === 'warn') console.error(text);
	else console.log(text);
}

export const log = {
	debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
	info: (msg: string, fields?: Fields) => write('info', msg, fields),
	warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
	error: (msg: string, fields?: Fields) => write('error', msg, fields)
};

/** Reduce any thrown value to a short, scrubbed description that is safe to log. */
export function describeError(err: unknown): string {
	if (err instanceof Error) return scrub(err.name + ': ' + err.message);
	return scrub(String(err));
}
