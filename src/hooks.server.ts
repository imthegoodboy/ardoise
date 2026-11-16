import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import type { Locale } from '#lib/money.ts';
import { SESSION_COOKIE, readSession } from '#lib/server/auth.ts';
import { housekeeping, inBackground, tick } from '#lib/server/background.ts';
import { config } from '#lib/server/config.ts';
import { getDb } from '#lib/server/db/index.ts';
import { migrate } from '#lib/server/db/migrate.ts';
import { describeError, log } from '#lib/server/log.ts';
import { LOCALE_COOKIE, setSessionCookie } from '#lib/server/session.ts';

export const init: ServerInit = async () => {
	const applied = await migrate(await getDb());
	if (applied.length) log.info('db.migrated', { applied: applied.join(',') });
	log.info('server.ready', { demo: config.demo, db: (await getDb()).kind });

	// A long-running server checks unwatched invoices itself every minute.
	// Serverless hosts rely on the cron endpoint and on request-driven ticks.
	if (!process.env.VERCEL && !config.isTest) {
		const timer = setInterval(() => {
			housekeeping(50).catch((err) =>
				log.warn('housekeeping.failed', { reason: describeError(err) })
			);
		}, 60_000);
		timer.unref();
	}
};

function pickLocale(
	cookie: string | undefined,
	shopLocale: Locale | undefined,
	header: string | null
): Locale {
	if (cookie === 'fr' || cookie === 'en') return cookie;
	if (shopLocale) return shopLocale;
	const first = (header ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
	return first.startsWith('en') ? 'en' : 'fr';
}

/**
 * Routes behind the shop's PIN, matched on SvelteKit's route id rather than the
 * raw URL, so an encoded path (`/%61pp/export`) cannot slip past the guard.
 */
const PRIVATE = /^\/(app)(\/|$)|^\/api\/(entries|activity)(\/|$)/;
const PUBLIC_MONEY = /^\/(p|r)\//;

export const handle: Handle = async ({ event, resolve }) => {
	const started = performance.now();

	let client = 'unknown';
	try {
		client = event.getClientAddress();
	} catch {
		// Not available during prerendering or in some adapters.
	}
	event.locals.client = client;
	event.locals.shop = null;
	event.locals.sessionToken = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await readSession(token);
		if (session) {
			event.locals.shop = session.shop;
			event.locals.sessionToken = token;
			if (session.renewedUntil) setSessionCookie(event.cookies, token, session.renewedUntil);
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	event.locals.locale = pickLocale(
		event.cookies.get(LOCALE_COOKIE),
		event.locals.shop?.locale,
		event.request.headers.get('accept-language')
	);

	const routeId = event.route.id ?? '';
	if (PRIVATE.test(routeId) && !event.locals.shop) {
		if (routeId.startsWith('/api/')) {
			return Response.json({ error: 'signed_out' }, { status: 401 });
		}
		const next = event.request.method === 'GET' ? event.url.pathname : '/app';
		redirect(303, '/login?next=' + encodeURIComponent(next));
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});

	const headers = response.headers;
	headers.set('x-content-type-options', 'nosniff');
	// Pay links carry their token in the path: never leak it to another site.
	// (Not `no-referrer`: that makes browsers send `Origin: null` on our own
	// form posts, which the CSRF check then rightly refuses.)
	headers.set('referrer-policy', 'same-origin');
	headers.set('x-frame-options', 'DENY');
	headers.set('cross-origin-opener-policy', 'same-origin');
	headers.set('permissions-policy', 'geolocation=(), microphone=(), payment=(), usb=()');
	if (config.isProduction) {
		headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
	}
	const money = PUBLIC_MONEY.test(routeId) || PUBLIC_MONEY.test(event.url.pathname);
	if (event.locals.shop || money || routeId.startsWith('/api/')) {
		headers.set('cache-control', 'private, no-store');
	}
	// Pay links and receipts must never show up in a search engine.
	if (money) headers.set('x-robots-tag', 'noindex, nofollow');

	// Any traffic keeps unwatched payments moving (at most once a minute).
	if (!config.isTest && routeId !== '/api/health') inBackground(tick());

	// Route ids only: a URL can contain a pay token.
	log.info('http', {
		method: event.request.method,
		route: routeId || '(none)',
		status: response.status,
		ms: Math.round(performance.now() - started)
	});
	return response;
};

export const handleError: HandleServerError = (caught) => {
	// App and framework errors (404, 403...) already carry a safe message.
	if (caught.kind !== 'unknown') return;
	log.error('http.error', {
		route: caught.event.route.id ?? '(none)',
		reason: describeError(caught.error)
	});
	return { message: 'Internal error' };
};
