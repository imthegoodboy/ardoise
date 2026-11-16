<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import PublicFrame from '#lib/components/PublicFrame.svelte';
	import Qr from '#lib/components/Qr.svelte';
	import { makeT } from '#lib/i18n/index.ts';
	import { formatEur, formatSats, formatXof, xofToEurCents } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);

	const invoice = $derived(data.invoice);
	let now = $state(Date.now());
	const left = $derived(Math.max(0, new Date(invoice.expiresAt).getTime() - now));
	const expired = $derived(
		invoice.status === 'expired' || (invoice.status === 'pending' && left === 0)
	);
	const clock = $derived(
		`${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`
	);

	const sources = $derived(
		invoice.rateSources.map((source) => source.charAt(0).toUpperCase() + source.slice(1)).join(', ')
	);
	const offline = $derived(invoice.rateSources.includes('offline-fallback'));

	let copied = $state(false);
	let busy = $state(false);

	// WebLN: a Lightning wallet living in the browser (Alby and others) can pay
	// in one tap, the way an Ethereum page would ask MetaMask.
	type WebLN = {
		enable(): Promise<void>;
		sendPayment(invoice: string): Promise<{ preimage: string }>;
	};
	let webln = $state<WebLN | null>(null);
	let weblnFailed = $state(false);

	async function payInBrowser() {
		if (!webln) return;
		weblnFailed = false;
		busy = true;
		try {
			await webln.enable();
			await webln.sendPayment(invoice.bolt11);
			await invalidate('pay:invoice');
		} catch {
			weblnFailed = true;
		} finally {
			busy = false;
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(invoice.bolt11);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable; the wallet button and the QR code still work.
		}
	}

	onMount(() => {
		webln = (window as unknown as { webln?: WebLN }).webln ?? null;
		const tick = setInterval(() => (now = Date.now()), 1000);
		const poll = setInterval(async () => {
			if (data.invoice.status === 'paid' || document.visibilityState !== 'visible') return;
			try {
				const response = await fetch(
					`/api/pay/${page.params.token}/invoices/${page.params.publicId}`,
					{ signal: AbortSignal.timeout(10_000) }
				);
				if (!response.ok) return;
				const state = await response.json();
				if (state.status !== data.invoice.status) await invalidate('pay:invoice');
			} catch {
				// Offline for a moment: the next tick tries again.
			}
		}, 2500);
		return () => {
			clearInterval(tick);
			clearInterval(poll);
		};
	});
</script>

<svelte:head>
	<title
		>{invoice.status === 'paid' ? t('invoice.paid') : t('invoice.title')} · {data.shop.name}</title
	>
	<meta name="robots" content="noindex" />
</svelte:head>

<PublicFrame shop={data.shop.name} place={data.shop.place}>
	{#if invoice.status === 'paid'}
		<section class="paid stack" style:--stack="var(--s-3)" aria-live="polite">
			<svg class="tick" viewBox="0 0 64 64" aria-hidden="true">
				<circle cx="32" cy="32" r="30" />
				<path d="M19 33l9 9 17-19" />
			</svg>
			<h1>{t('invoice.paid')}</h1>
			<p>{t('invoice.paidBody', { shop: data.shop.name, amount: money(invoice.amountXof) })}</p>
			<p class="small">
				{data.balanceXof > 0
					? t('invoice.paidRemaining', { amount: money(data.balanceXof) })
					: t('invoice.paidSettled')}
			</p>
			<a class="btn btn-wide" href="/r/{invoice.publicId}">
				<Icon name="receipt" />
				{t('invoice.receipt')}
			</a>
			<a class="btn btn-quiet btn-wide" href="/p/{page.params.token}">{t('invoice.back')}</a>
		</section>
	{:else if expired}
		<section class="stack" style:--stack="var(--s-3)">
			<h1>{t('invoice.title')}</h1>
			<p class="note">{t('invoice.expired')}</p>
			<form method="POST" action="/p/{page.params.token}">
				<input type="hidden" name="amount" value={invoice.amountXof} />
				<button class="btn btn-wide">{t('invoice.newOne')}</button>
			</form>
			<a class="btn btn-plain" href="/p/{page.params.token}">{t('invoice.back')}</a>
		</section>
	{:else}
		<section class="stack" style:--stack="var(--s-3)">
			<div class="head">
				<h1>{t('invoice.title')}</h1>
				<p class="amount num">{money(invoice.amountXof)}</p>
				<p class="small muted">
					{formatSats(invoice.amountSats, data.locale)} sats · ≈ {formatEur(
						xofToEurCents(invoice.amountXof),
						data.locale
					)}
				</p>
			</div>

			<a class="qr-link" href="lightning:{invoice.bolt11}">
				<Qr value={'lightning:' + invoice.bolt11.toUpperCase()} label={t('invoice.qrLabel')} />
			</a>

			<p class="status" role="status">
				<span class="dot" aria-hidden="true"></span>
				{t('invoice.waiting')} · {t('invoice.expiresIn', { time: clock })}
			</p>

			{#if webln}
				<button type="button" class="btn btn-wide" onclick={payInBrowser} aria-busy={busy}>
					<Icon name="wallet" />
					{t('invoice.webln')}
				</button>
				{#if weblnFailed}<p class="note note-error small" role="alert">
						{t('invoice.weblnFailed')}
					</p>{/if}
			{/if}
			<a class="btn btn-wide" class:btn-quiet={webln} href="lightning:{invoice.bolt11}">
				<Icon name="bolt" />
				{t('invoice.open')}
			</a>
			<button type="button" class="btn btn-quiet btn-wide" onclick={copy}>
				<Icon name={copied ? 'check' : 'copy'} />
				{copied ? t('common.copied') : t('invoice.copy')}
			</button>

			{#if data.demo}
				<div class="demo stack" style:--stack="var(--s-2)">
					<p class="small">
						{data.demo === 'simulate' ? t('invoice.demoNote') : t('invoice.faucetNote')}
					</p>
					<form
						method="POST"
						action="?/demo"
						use:enhance={() => {
							busy = true;
							return async ({ update }) => {
								await update();
								busy = false;
							};
						}}
					>
						<button class="btn btn-wide demo-btn" aria-busy={busy}>
							<Icon name="bolt" />
							{data.demo === 'simulate' ? t('invoice.simulate') : t('invoice.faucet')}
						</button>
					</form>
				</div>
			{/if}

			<p class="meta rate">
				{t('invoice.rate', { rate: money(Math.round(invoice.xofPerBtc)) })} ·
				{offline ? t('invoice.rateOffline') : t('invoice.rateSources', { sources })}
			</p>

			<form method="POST" action="?/check">
				<button class="btn btn-plain btn-wide">{t('invoice.check')}</button>
			</form>
		</section>
	{/if}
</PublicFrame>

<style>
	h1 {
		font-size: var(--t-title);
	}

	.head {
		text-align: center;
	}

	.amount {
		font-size: var(--t-amount);
		line-height: 1.1;
	}

	.qr-link {
		display: block;
		width: min(100%, 300px);
		margin-inline: auto;
		padding: var(--s-3);
		border-radius: var(--r-sheet);
		background: #fff;
		box-shadow:
			0 0 0 1.5px var(--rule-strong),
			0 12px 30px -16px rgb(120 60 0 / 0.4);
	}

	.status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		font-size: var(--t-small);
		font-variant-numeric: tabular-nums;
	}

	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--orange);
		animation: blink 1.2s ease-in-out infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0.25;
		}
	}

	.demo {
		padding: var(--s-3);
		border-radius: var(--r-control);
		border: 1.5px dashed var(--ember);
		background: var(--peel-soft);
	}

	.demo-btn {
		background: var(--ink);
		color: var(--peel);
	}

	.rate {
		text-align: center;
	}

	.paid {
		text-align: center;
		padding-block-start: var(--s-4);
	}

	.tick {
		width: 5.5rem;
		height: 5.5rem;
		margin-inline: auto;
		display: block;
	}

	.tick circle {
		fill: var(--paid-wash);
		stroke: var(--paid);
		stroke-width: 3;
	}

	.tick path {
		fill: none;
		stroke: var(--paid);
		stroke-width: 5;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 48;
		stroke-dashoffset: 48;
		animation: draw 520ms cubic-bezier(0.3, 0.7, 0.2, 1) 150ms forwards;
	}

	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
</style>
