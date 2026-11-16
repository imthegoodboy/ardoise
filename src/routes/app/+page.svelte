<script lang="ts">
	import DemoGuide from '#lib/components/DemoGuide.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { marginDate } from '#lib/dates.ts';
	import { makeT, plural } from '#lib/i18n/index.ts';
	import { formatXof } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);

	let query = $state('');
	const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	const shown = $derived(
		query.trim()
			? data.customers.filter((customer) => fold(customer.name).includes(fold(query.trim())))
			: data.customers
	);
</script>

<svelte:head>
	<title>{t('book.title')} · {data.shop.name}</title>
</svelte:head>

<main class="page stack" style:--stack="var(--s-4)">
	<section class="summary" aria-label={t('book.owed')}>
		<p class="label">{t('book.owed')}</p>
		<p class="total num">{money(data.totals.owedXof)}</p>
		<p class="meta">
			{plural(
				t,
				data.totals.customersOwing,
				'book.customersOwing.one',
				'book.customersOwing.other'
			)}
		</p>
		{#if data.totals.lightningCount30d}
			<p class="ln small">
				<Icon name="bolt" size={16} />
				{t('book.lightning30d')} : <strong class="num">{money(data.totals.lightningXof30d)}</strong>
			</p>
		{/if}
	</section>

	{#if data.shop.walletKind === 'none'}
		<div class="note stack" style:--stack="var(--s-2)">
			<p>{t('book.noWallet')}</p>
			<a class="btn btn-small" href="/app/wallet"
				><Icon name="wallet" size={20} /> {t('book.noWalletCta')}</a
			>
		</div>
	{/if}

	{#if data.shop.isDemo}
		<DemoGuide />
	{/if}

	<div class="tools">
		<label class="search">
			<span class="sr-only">{t('book.search')}</span>
			<Icon name="search" size={20} />
			<input
				class="input"
				type="search"
				bind:value={query}
				placeholder={t('book.search')}
				autocomplete="off"
				enterkeyhint="search"
			/>
		</label>
		<a class="btn" href="/app/customers/new">
			<Icon name="plus" />
			<span class="new-label">{t('book.newCustomer')}</span>
		</a>
	</div>

	{#if data.customers.length === 0}
		<div class="empty stack" style:--stack="var(--s-3)">
			<h2>{t('book.empty.title')}</h2>
			<p class="muted">{t('book.empty.body')}</p>
			<div class="empty-actions">
				<a class="btn" href="/app/customers/new">{t('book.newCustomer')}</a>
				<a class="btn btn-quiet" href="/app/import"><Icon name="camera" /> {t('nav.import')}</a>
			</div>
		</div>
	{:else}
		<h2 class="sr-only">{t('book.customers')}</h2>
		{#if shown.length === 0}
			<p class="muted">{t('book.noMatch')}</p>
		{/if}
		<ul class="customers">
			{#each shown as customer (customer.id)}
				{@const over =
					customer.creditLimitXof !== null && customer.balanceXof > customer.creditLimitXof}
				<li>
					<a href="/app/c/{customer.id}">
						<span class="when"
							>{customer.lastActivityAt ? marginDate(customer.lastActivityAt) : ''}</span
						>
						<span class="who">
							{customer.name}
							{#if over}<span class="over">{t('book.overLimit')}</span>{/if}
						</span>
						{#if customer.balanceXof > 0}
							<span class="sum num">{money(customer.balanceXof)}</span>
						{:else if customer.balanceXof < 0}
							<span class="sum ok">{money(-customer.balanceXof)} {t('book.ahead')}</span>
						{:else}
							<span class="sum ok">{t('book.upToDate')}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		padding-block-end: var(--s-6);
	}

	.summary {
		padding: var(--s-4);
		border-radius: var(--r-control);
		background: var(--peel);
	}

	.label {
		font-weight: 700;
		font-size: var(--t-small);
	}

	.total {
		font-size: var(--t-amount);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.ln {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin-block-start: var(--s-2);
		padding-block-start: var(--s-2);
		border-block-start: 1px solid var(--rule-strong);
	}

	.tools {
		display: flex;
		gap: var(--s-2);
	}

	.search {
		position: relative;
		flex: 1;
	}

	.search :global(svg) {
		position: absolute;
		inset-inline-start: 0.85rem;
		inset-block-start: 50%;
		translate: 0 -50%;
		color: var(--ink-soft);
		pointer-events: none;
	}

	.search .input {
		padding-inline-start: 2.6rem;
	}

	.new-label {
		display: none;
	}

	@media (min-width: 26rem) {
		.new-label {
			display: inline;
		}
	}

	.customers {
		list-style: none;
		margin: 0;
		padding: 0;
		border-block-start: 1px solid var(--rule);
		background: linear-gradient(var(--margin-line), var(--margin-line)) no-repeat 3.5rem 0 / 1.5px
			100%;
	}

	.customers a {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr) auto;
		align-items: baseline;
		min-height: 3.5rem;
		padding-block: 0.95rem;
		border-block-end: 1px solid var(--rule);
		color: var(--ink);
		text-decoration: none;
	}

	.customers a:active {
		background: var(--peel-soft);
	}

	.when {
		font-size: var(--t-meta);
		color: var(--ink-soft);
	}

	.who {
		padding-inline: var(--s-3) var(--s-2);
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.over {
		display: inline-block;
		margin-inline-start: var(--s-1);
		padding: 0 0.4rem;
		border-radius: 0.3rem;
		background: var(--alert-wash);
		color: var(--alert);
		font-size: var(--t-meta);
		font-weight: 700;
	}

	.sum {
		white-space: nowrap;
	}

	.ok {
		color: var(--paid);
		font-size: var(--t-small);
		font-weight: 700;
	}

	.empty {
		padding: var(--s-5) var(--s-4);
		border: 1.5px dashed var(--rule-strong);
		border-radius: var(--r-control);
		text-align: center;
	}

	.empty h2 {
		font-size: var(--t-lead);
	}

	.empty-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-2);
	}
</style>
