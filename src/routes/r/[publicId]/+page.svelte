<script lang="ts">
	import { sha256 } from '@noble/hashes/sha2.js';
	import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
	import Icon from '#lib/components/Icon.svelte';
	import PublicFrame from '#lib/components/PublicFrame.svelte';
	import { clockTime, longDate } from '#lib/dates.ts';
	import { makeT } from '#lib/i18n/index.ts';
	import { formatSats, formatXof } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);
	const r = $derived(data.receipt);

	const NETWORKS: Record<string, string> = {
		bc: 'Bitcoin (mainnet)',
		tb: 'Testnet',
		tbs: 'Signet',
		bcrt: 'Regtest'
	};

	let verdict = $state<'match' | 'mismatch' | null>(null);
	let computed = $state('');

	// Done with a bundled hash function rather than crypto.subtle, which is
	// missing on plain-http pages: the check must work on any phone.
	function verify() {
		if (!r.preimage) return;
		try {
			computed = bytesToHex(sha256(hexToBytes(r.preimage)));
			verdict = computed === r.paymentHash.toLowerCase() ? 'match' : 'mismatch';
		} catch {
			verdict = 'mismatch';
		}
	}
</script>

<svelte:head>
	<title>{t('receipt.title')} · {data.shop.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PublicFrame shop={data.shop.name} place={data.shop.place}>
	<h1>{t('receipt.title')}</h1>

	{#if !r.paid}
		<p class="note">{t('receipt.notPaid')}</p>
	{:else}
		{#if r.testNetwork}
			<p class="note small">{t('receipt.demo')}</p>
		{/if}

		<dl class="facts">
			<div>
				<dt>{t('receipt.shop')}</dt>
				<dd>{data.shop.name}</dd>
			</div>
			<div>
				<dt>{t('receipt.amount')}</dt>
				<dd class="num big">{money(r.amountXof)}</dd>
			</div>
			<div>
				<dt>{t('receipt.sats')}</dt>
				<dd class="num">{formatSats(r.amountSats, data.locale)}</dd>
			</div>
			<div>
				<dt>{t('receipt.rate')}</dt>
				<dd>1 BTC = {money(Math.round(r.xofPerBtc))}</dd>
			</div>
			{#if r.paidAt}
				<div>
					<dt>{t('receipt.date')}</dt>
					<dd>{longDate(r.paidAt, data.locale)} · {clockTime(r.paidAt)} UTC</dd>
				</div>
			{/if}
			{#if r.network}
				<div>
					<dt>{t('receipt.network')}</dt>
					<dd>Lightning · {NETWORKS[r.network] ?? r.network}</dd>
				</div>
			{/if}
		</dl>

		<section class="proof stack" style:--stack="var(--s-3)">
			<div class="field">
				<span class="label">{t('receipt.hash')}</span>
				<code>{r.paymentHash}</code>
			</div>
			{#if r.preimage}
				<div class="field">
					<span class="label">{t('receipt.preimage')}</span>
					<code>{r.preimage}</code>
				</div>
				<button type="button" class="btn btn-wide no-print" onclick={verify}>
					<Icon name="shield" />
					{t('receipt.verify')}
				</button>
				{#if verdict === 'match'}
					<p class="note note-ok" role="status">{t('receipt.verified')}</p>
				{:else if verdict === 'mismatch'}
					<p class="note note-error" role="status">{t('receipt.mismatch')}</p>
				{/if}
				{#if computed}
					<p class="meta">SHA-256(preimage) = <code class="inline">{computed}</code></p>
				{/if}
			{:else}
				<p class="note">{t('receipt.noProof')}</p>
			{/if}
			<p class="meta">{t('receipt.explain')}</p>
		</section>

		<button type="button" class="btn btn-quiet no-print" onclick={() => window.print()}>
			<Icon name="print" />
			{t('receipt.print')}
		</button>
	{/if}
</PublicFrame>

<style>
	h1 {
		font-size: var(--t-title);
	}

	.facts {
		margin: 0;
		border-block-start: 1px solid var(--rule);
	}

	.facts > div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s-3);
		padding-block: 0.75rem;
		border-block-end: 1px solid var(--rule);
	}

	dt {
		color: var(--ink-soft);
		font-size: var(--t-small);
	}

	dd {
		margin: 0;
		text-align: end;
		font-weight: 700;
	}

	.big {
		font-size: var(--t-lead);
	}

	.proof {
		padding: var(--s-4);
		border-radius: var(--r-control);
		background: var(--peel-soft);
	}

	.label {
		display: block;
		font-weight: 700;
		font-size: var(--t-small);
		padding-block-end: var(--s-1);
	}

	code {
		display: block;
		padding: var(--s-2) var(--s-3);
		border-radius: 0.5rem;
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--rule-strong);
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		font-size: 0.8125rem;
		overflow-wrap: anywhere;
	}

	code.inline {
		display: inline;
		padding: 0;
		box-shadow: none;
		background: none;
	}
</style>
