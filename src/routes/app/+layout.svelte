<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
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
		if (!queued().length) return;
		const delivered = await flush();
		if (delivered) await invalidateAll();
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
		return () => {
			stop();
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
		border-block-start: 3px solid transparent;
		margin-block-start: -1px;
	}

	.tabs a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
		border-block-start-color: var(--orange);
	}

	.tabs a:active {
		background: var(--peel-soft);
	}

	@media (min-width: 40rem) {
		.tabs {
			border-inline: 1px solid var(--rule-strong);
			border-radius: var(--r-sheet) var(--r-sheet) 0 0;
		}
	}
</style>
