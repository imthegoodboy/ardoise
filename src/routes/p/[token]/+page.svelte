<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import PublicFrame from '#lib/components/PublicFrame.svelte';
	import { longDate, marginDate } from '#lib/dates.ts';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import { formatEur, formatXof, parseAmount, xofToEurCents } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);
	const eur = (amount: number) => formatEur(xofToEurCents(amount), data.locale);

	const due = $derived(Math.max(0, data.balanceXof));
	const suggested = $derived(Math.min(Math.max(due, data.limits.min), data.limits.max));
	// svelte-ignore state_referenced_locally
	let amountText = $state(String(suggested));
	const amount = $derived(parseAmount(amountText));
	const inRange = $derived(
		amount !== null && amount >= data.limits.min && amount <= data.limits.max
	);
	let busy = $state(false);

	const oldest = $derived(data.oldestOpenAt);
	const dueLine = $derived(
		[`≈ ${eur(due)}`, oldest ? t('pay.since', { date: longDate(oldest, data.locale) }) : '']
			.filter(Boolean)
			.join(' · ')
	);
	const amountHint = $derived(
		[amount ? `≈ ${eur(amount)}` : '', t('pay.amountHint')].filter(Boolean).join(' · ')
	);
	// One tap for the usual choices: everything, or a round part of it.
	const choices = $derived(
		due >= data.limits.min
			? [due, ...[10_000, 5_000, 2_000].filter((value) => value < due)].slice(0, 4)
			: [5_000, 2_000, 1_000]
	);

	function errorText(code: string): string {
		if (code === 'amount') {
			return t('pay.error.amount', { min: money(data.limits.min), max: money(data.limits.max) });
		}
		return t(`pay.error.${code}` as MessageKey);
	}
</script>

<svelte:head>
	<title>{t('pay.title', { name: data.firstName })} · {data.shop.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PublicFrame shop={data.shop.name} place={data.shop.place}>
	<h1>{t('pay.title', { name: data.firstName })}</h1>

	<section class="due" aria-live="polite">
		{#if due > 0}
			<p class="label">{t('pay.due')}</p>
			<p class="amount num">{money(due)}</p>
			<p class="small muted">{dueLine}</p>
		{:else}
			<p class="nothing"><Icon name="check" size={28} /> {t('pay.nothingDue')}</p>
			{#if data.balanceXof < 0}
				<p class="small">{t('pay.ahead', { amount: money(-data.balanceXof) })}</p>
			{/if}
		{/if}
	</section>

	{#if data.lines.length}
		<details class="items" open>
			<summary>{t('pay.items')} ({data.lines.length + data.hiddenLines})</summary>
			<ol class="ledger">
				{#each data.lines as line (line.id)}
					<li>
						<span class="when">{marginDate(line.occurredAt)}</span>
						<span class="what"
							>{line.label || '—'}
							{#if line.owedXof < line.amountXof}
								<span class="meta">({t('pay.partial', { amount: money(line.owedXof) })})</span>
							{/if}
						</span>
						<span class="sum">{money(line.amountXof)}</span>
					</li>
				{/each}
			</ol>
		</details>
	{/if}

	{#if data.canPay}
		<form
			method="POST"
			class="stack pay"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			{#if form?.error}
				<p class="note note-error" role="alert">{errorText(form.error)}</p>
			{/if}

			<div class="field">
				<label for="amount">{t('pay.amount')}</label>
				<div class="amount-wrap">
					<input
						id="amount"
						name="amount"
						class="input input-amount"
						inputmode="numeric"
						autocomplete="off"
						required
						bind:value={amountText}
						aria-describedby="amount-hint"
					/>
					<span class="unit">F</span>
				</div>
				<span class="hint" id="amount-hint">{amountHint}</span>
				<div class="choices" role="group" aria-label={t('pay.amount')}>
					{#each choices as choice, i (choice)}
						<button
							type="button"
							class="chip"
							class:active={amount === choice}
							aria-pressed={amount === choice}
							onclick={() => (amountText = String(choice))}
						>
							{i === 0 && choice === due ? `${t('pay.all')} · ` : ''}{money(choice)}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<label for="name">{t('pay.name')} <span class="muted">({t('common.optional')})</span></label
				>
				<input
					id="name"
					name="name"
					class="input"
					maxlength="40"
					autocomplete="given-name"
					enterkeyhint="go"
					aria-describedby="name-hint"
					value={form?.payerName ?? ''}
				/>
				<span class="hint" id="name-hint">{t('pay.nameHint')}</span>
			</div>

			<button class="btn btn-wide pay-btn" aria-busy={busy}>
				<Icon name="bolt" />
				{t('pay.submit')}{#if inRange && amount}&nbsp;· {money(amount)}{/if}
			</button>
			<p class="meta center">{t('pay.wallets')}</p>
		</form>
	{:else}
		<p class="note">{t('pay.noWallet')}</p>
	{/if}

	<p class="meta about">{t('pay.about')}</p>
</PublicFrame>

<style>
	h1 {
		font-size: var(--t-title);
	}

	.due {
		padding: var(--s-4);
		border-radius: var(--r-control);
		background: var(--peel);
	}

	.label {
		font-weight: 700;
		font-size: var(--t-small);
	}

	.amount {
		font-size: var(--t-amount);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.nothing {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-lead);
		font-weight: 700;
		color: var(--paid);
	}

	.items summary {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
		font-weight: 700;
		cursor: pointer;
	}

	.pay {
		padding-block-start: var(--s-2);
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-block-start: var(--s-3);
	}

	.chip {
		min-height: 2.75rem;
		padding: 0.5rem 0.9rem;
		border: 1.5px solid var(--rule-strong);
		border-radius: 999px;
		background: var(--paper);
		font-size: var(--t-small);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		touch-action: manipulation;
	}

	.chip.active {
		background: var(--peel);
		border-color: var(--orange);
	}

	.pay-btn {
		min-height: 3.75rem;
		font-size: var(--t-lead);
	}

	.center {
		text-align: center;
	}

	.about {
		padding-block-start: var(--s-4);
		border-block-start: 1px solid var(--rule);
	}
</style>
