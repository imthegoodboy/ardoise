import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import type { Locale } from '#lib/money.ts';
import { SESSION_COOKIE, readSession, sweepSessions } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { getDb } from '#lib/server/db/index.ts';
import { migrate } from '#lib/server/db/migrate.ts';
import { reconcile } from '#lib/server/invoices.ts';
import { describeError, log } from '#lib/server/log.ts';
import { sweep } from '#lib/server/ratelimit.ts';
import { LOCALE_COOKIE, setSessionCookie } from '#lib/server/session.ts';

export const init: ServerInit = async () => {
	const applied = await migrate(await getDb());
	if (applied.length) log.info('db.migrated', { applied: applied.join(',') });
	log.info('server.ready', { demo: config.demo, db: (await getDb()).kind });

	// A long-running server checks unwatched invoices itself. Serverless hosts
	// call /api/cron/reconcile on a schedule instead.
	if (!process.env.VERCEL && !config.isTest) {
		const timer = setInterval(() => {
			reconcile({ limit: 50 })
				.then(() => Promise.all([sweep(), sweepSessions()]))
				.catch((err) => log.warn('reconcile.failed', { reason: describeError(err) }));
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

/** Pages behind the shop's PIN. Everything else is public. */
const PRIVATE = /^\/(app)(\/|$)|^\/api\/(entries|activity)(\/|$)/;

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

	const path = event.url.pathname;
	if (PRIVATE.test(path) && !event.locals.shop) {
		if (path.startsWith('/api/')) {
			return Response.json({ error: 'signed_out' }, { status: 401 });
		}
		const next = event.request.method === 'GET' ? path : '/app';
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
	if (
		event.locals.shop ||
		path.startsWith('/p/') ||
		path.startsWith('/r/') ||
		path.startsWith('/api/')
	) {
		headers.set('cache-control', 'private, no-store');
	}
	// Pay links and receipts must never show up in a search engine.
	if (path.startsWith('/p/') || path.startsWith('/r/')) {
		headers.set('x-robots-tag', 'noindex, nofollow');
	}

	// Route ids only: a URL can contain a pay token.
	log.info('http', {
		method: event.request.method,
		route: event.route.id ?? '(none)',
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
