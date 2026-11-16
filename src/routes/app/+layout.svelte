<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import { formatXof } from '#lib/money.ts';
	import { flush, onOutboxChange, queued } from '#lib/outbox.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const t = $derived(makeT(data.locale));

	const tabs: { href: string; icon: IconName; label: MessageKey }[] = [
		{ href: '/app', icon: 'book', label: 'nav.book' },
		{ href: '/app/import', icon: 'camera', label: 'nav.import' },
		{ href: '/app/wallet', icon: 'wallet', label: 'nav.wallet' },
		{ href: '/app/settings', icon: 'settings', label: 'nav.settings' }
	];

	const current = (href: string) =>
		href === '/app'
			? page.url.pathname === '/app' || page.url.pathname.startsWith('/app/c')
			: page.url.pathname.startsWith(href);

	let online = $state(true);
	let waiting = $state(0);

	async function sync() {
		const before = queued().length;
		if (!before) return;
		await flush();
		// Refresh whenever the queue shrank: delivered lines appear, rejected ones vanish.
		if (queued().length < before) await invalidateAll();
	}

	// --- "Moussa paid 12 550 F for Awa": announced wherever the shopkeeper is
	interface Payment {
		entryId: string;
		customerId: string;
		customerName: string;
		amountXof: number;
		payerName: string | null;
	}
	let toasts = $state<Payment[]>([]);
	let since: number | null = null;

	async function listen() {
		if (document.visibilityState !== 'visible' || !navigator.onLine) return;
		try {
			const query = since === null ? '' : `?since=${since}`;
			const response = await fetch(`/api/activity${query}`, {
				signal: AbortSignal.timeout(10_000)
			});
			if (!response.ok) return;
			const body: { now: number; payments: Payment[] } = await response.json();
			since = body.now;
			const fresh = body.payments.filter((p) => !toasts.some((t) => t.entryId === p.entryId));
			if (!fresh.length) return;
			toasts = [...fresh, ...toasts].slice(0, 3);
			navigator.vibrate?.([60, 40, 60]);
			await invalidateAll();
			for (const payment of fresh) {
				setTimeout(() => dismiss(payment.entryId), 9_000);
			}
		} catch {
			// Network blip: the next tick tries again.
		}
	}

	function dismiss(entryId: string) {
		toasts = toasts.filter((toast) => toast.entryId !== entryId);
	}

	onMount(() => {
		online = navigator.onLine;
		waiting = queued().length;
		const stop = onOutboxChange(() => (waiting = queued().length));
		const up = () => {
			online = true;
			sync();
		};
		const down = () => (online = false);
		window.addEventListener('online', up);
		window.addEventListener('offline', down);
		sync();
		listen();
		const timer = setInterval(() => {
			listen();
			// A flush that failed once is retried while lines are waiting.
			if (navigator.onLine && queued().length) sync();
		}, 8_000);
		return () => {
			stop();
			clearInterval(timer);
			window.removeEventListener('online', up);
			window.removeEventListener('offline', down);
		};
	});
</script>

<div class="app">
	<header class="page head">
		<a class="shop" href="/app">
			<strong>{data.shop.name}</strong>
			{#if data.shop.place}<span class="meta">{data.shop.place}</span>{/if}
		</a>
		{#if data.shop.isDemo}
			<span class="badge">{t('demo.badge')}</span>
		{/if}
	</header>

	{#if !online || waiting}
		<p class="page offline" role="status">
			<Icon name="wifiOff" size={18} />
			<span>
				{#if !online}{t('common.offline')}{/if}
				{#if waiting}{t('common.queued', { n: waiting })}{/if}
			</span>
		</p>
	{/if}

	{@render children()}
</div>

<div class="toasts" aria-live="polite">
	{#each toasts as toast (toast.entryId)}
		<div class="toast">
			<span class="bolt"><Icon name="bolt" size={18} /></span>
			<a href="/app/c/{toast.customerId}" onclick={() => dismiss(toast.entryId)}>
				<strong>
					{toast.payerName
						? t('toast.paidBy', {
								payer: toast.payerName,
								amount: formatXof(toast.amountXof, data.locale)
							})
						: t('toast.paid', { amount: formatXof(toast.amountXof, data.locale) })}
				</strong>
				<span class="meta">{t('toast.for', { name: toast.customerName })}</span>
			</a>
			<button type="button" class="icon-btn" onclick={() => dismiss(toast.entryId)}>
				<Icon name="close" size={18} label={t('common.close')} />
			</button>
		</div>
	{/each}
</div>

<nav class="tabs no-print" aria-label={t('nav.main')}>
	{#each tabs as tab (tab.href)}
		<a href={tab.href} aria-current={current(tab.href) ? 'page' : undefined}>
			<Icon name={tab.icon} />
			<span>{t(tab.label)}</span>
		</a>
	{/each}
</nav>

<style>
	.app {
		min-height: 100dvh;
		padding-block-end: calc(4.5rem + env(safe-area-inset-bottom));
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding-block: var(--s-3) var(--s-2);
	}

	.shop {
		display: grid;
		color: var(--ink);
		text-decoration: none;
		line-height: 1.25;
	}

	.badge {
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: var(--ink);
		color: var(--peel);
		font-size: var(--t-meta);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.offline {
		display: flex;
		gap: var(--s-2);
		align-items: flex-start;
		padding-block: var(--s-2);
		font-size: var(--t-small);
		background: var(--peel);
		border-radius: var(--r-control);
		margin-block-end: var(--s-2);
	}

	.offline :global(svg) {
		flex: none;
		margin-block-start: 0.15rem;
	}

	.tabs {
		position: fixed;
		inset-inline: 0;
		inset-block-end: 0;
		z-index: 10;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		max-width: var(--page);
		margin-inline: auto;
		padding-block-end: env(safe-area-inset-bottom);
		background: var(--paper);
		border-block-start: 1px solid var(--rule-strong);
	}

	.tabs a {
		display: grid;
		justify-items: center;
		gap: 0.1rem;
		padding-block: 0.55rem 0.45rem;
		font-size: var(--t-meta);
		color: var(--ink-soft);
		text-decoration: none;
		position: relative;
		transition: color 150ms ease;
	}

	/* A short tab under the rule, centred on the icon: it never runs into the rounded corners. */
	.tabs a::before {
		content: '';
		position: absolute;
		inset-block-start: -1px;
		inset-inline-start: 50%;
		width: 2.75rem;
		height: 3px;
		border-radius: 0 0 3px 3px;
		background: var(--orange);
		translate: -50% 0;
		scale: 0 1;
		transition: scale 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.tabs a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
	}

	.tabs a[aria-current='page']::before {
		scale: 1 1;
	}

	.tabs a:active {
		background: var(--peel-soft);
	}

	.toasts {
		position: fixed;
		z-index: 20;
		inset-inline: 0;
		inset-block-start: max(var(--s-3), env(safe-area-inset-top));
		display: grid;
		gap: var(--s-2);
		width: min(100% - 2 * var(--s-4), 30rem);
		margin-inline: auto;
		pointer-events: none;
	}

	.toast {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3);
		border-radius: var(--r-control);
		background: var(--ink);
		color: var(--peel-soft);
		box-shadow: 0 16px 34px -14px rgb(38 23 11 / 0.7);
		pointer-events: auto;
		animation: toast-in 480ms cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
	}

	.toast a {
		display: grid;
		color: inherit;
		text-decoration: none;
	}

	.toast .meta {
		color: var(--peel);
	}

	.toast .icon-btn {
		color: var(--peel-soft);
	}

	.bolt {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: var(--orange);
		color: var(--ink);
		animation: zap 900ms ease 300ms 2;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(-16px) scale(0.96);
		}
	}

	@keyframes zap {
		50% {
			box-shadow: 0 0 0 8px rgb(247 147 26 / 0.35);
		}
	}

	@media (min-width: 40rem) {
		.tabs {
			overflow: clip;
			border-inline: 1px solid var(--rule-strong);
			border-radius: var(--r-sheet) var(--r-sheet) 0 0;
		}
	}
</style>
