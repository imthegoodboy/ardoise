/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Offline support for the shopkeeper's screens.
 *
 * Code and fonts are cached at install. The book pages (/app) are fetched
 * from the network first and fall back to the last copy seen, so a shop can
 * still look up a tab when the network drops; new lines go to the outbox.
 * Public pages (pay links, receipts) and the API are never cached.
 */
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

const STATIC = `ardoise-static-${version}`;
const PAGES = 'ardoise-pages';

const precache = [...immutable.map((file) => file.path), ...assets.map((file) => file.path)].filter(
	(path) => !path.startsWith('/samples/') && !path.endsWith('.png')
);
const precached = new Set(precache);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(STATIC)
			.then((cache) => cache.addAll(precache))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('ardoise-static-') && key !== STATIC)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('message', (event) => {
	// Sent on sign-out: a shared phone must not keep someone's book.
	if (event.data === 'purge') event.waitUntil(caches.delete(PAGES));
});

async function bookPage(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok && !response.redirected) {
			const cache = await caches.open(PAGES);
			await cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request, { cacheName: PAGES });
		if (cached) return cached;
		if (request.mode === 'navigate') {
			const home = await caches.match('/app', { cacheName: PAGES });
			if (home) return home;
		}
		return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
	}
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (precached.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}
	if (
		(url.pathname === '/app' || url.pathname.startsWith('/app/')) &&
		!url.pathname.startsWith('/app/export')
	) {
		event.respondWith(bookPage(request));
	}
});
