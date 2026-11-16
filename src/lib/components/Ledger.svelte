<script lang="ts">
	import { page } from '$app/state';
	import { marginDate } from '#lib/dates.ts';
	import { makeT } from '#lib/i18n/index.ts';
	import { isPayment, type LedgerLine } from '#lib/ledger.ts';
	import { formatXof } from '#lib/money.ts';
	import Icon from './Icon.svelte';

	let {
		lines,
		label,
		justSettled = new Set<string>(),
		pendingIds = new Set<string>(),
		onselect
	}: {
		lines: LedgerLine[];
		label: string;
		/** Lines that just became paid: their strike-through is animated. */
		justSettled?: Set<string>;
		/** Lines written offline that have not reached the server yet. */
		pendingIds?: Set<string>;
		onselect?: (line: LedgerLine) => void;
	} = $props();

	const locale = $derived(page.data.locale);
	const t = $derived(makeT(locale));

	function describe(line: LedgerLine): string {
		if (line.kind === 'payment_lightning') {
			return line.payerName ? t('tab.paidBy', { name: line.payerName }) : t('tab.paidLightning');
		}
		if (line.kind === 'payment_cash' && (!line.label || line.label === 'Espèces')) {
			return t('tab.paidCash');
		}
		return line.label || '—';
	}

	// Stagger the strike animation top to bottom, like a pen going down the page.
	const order = $derived.by(() => {
		// Rebuilt on every change and never mutated afterwards: a plain Map is right here.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, number>();
		let i = 0;
		for (const line of lines) if (justSettled.has(line.id)) map.set(line.id, i++);
		return map;
	});
</script>

<ol class="ledger" aria-label={label}>
	{#each lines as line (line.id)}
		<li
			class:settled={line.settled || line.voided}
			class:voided={line.voided}
			class:just-settled={justSettled.has(line.id)}
			class:payment={isPayment(line.kind) && !line.voided}
			class:pending={pendingIds.has(line.id)}
			style:--i={order.get(line.id) ?? 0}
		>
			<span class="when">{marginDate(line.occurredAt)}</span>
			<span class="what">
				{#if onselect}
					<button type="button" class="line-btn" onclick={() => onselect(line)}>
						{describe(line)}
					</button>
				{:else}
					{describe(line)}
				{/if}
				{#if line.kind === 'payment_lightning'}
					<span class="tag">
						<Icon name="bolt" size={15} />
						{#if line.receiptId}
							<a href="/r/{line.receiptId}">{t('tab.receipt')}</a>
						{:else}
							Lightning
						{/if}
					</span>
				{/if}
				{#if line.voided}
					<span class="tag">{t('tab.voided')}</span>
				{/if}
				{#if pendingIds.has(line.id)}
					<span class="tag"><Icon name="wifiOff" size={15} /> {t('tab.pending')}</span>
				{/if}
			</span>
			<span class="sum">
				{#if isPayment(line.kind)}<span aria-hidden="true">−</span>{/if}{formatXof(
					line.amountXof,
					locale
				)}
			</span>
		</li>
	{/each}
</ol>

<style>
	.line-btn {
		display: inline;
		padding: 0;
		border: 0;
		background: none;
		text-align: start;
		cursor: pointer;
	}

	/* The whole row is the tap target, not just the words. */
	.line-btn::before {
		content: '';
		position: absolute;
		inset: 0;
	}

	.line-btn:focus-visible {
		outline: none;
	}

	li:has(.line-btn:focus-visible) {
		outline: 3px solid var(--ink);
		outline-offset: -3px;
		border-radius: 4px;
	}

	.tag {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		margin-inline-start: var(--s-2);
		font-size: var(--t-meta);
		font-weight: 400;
		color: var(--ink-soft);
		white-space: nowrap;
		vertical-align: 0.05em;
	}

	.payment .tag {
		color: var(--paid);
	}

	.tag a {
		color: inherit;
	}

	.voided .what,
	.voided .sum {
		color: #9a8676;
	}

	.voided::after {
		background: var(--alert) !important;
		opacity: 0.6;
	}

	.pending {
		background: repeating-linear-gradient(
			-45deg,
			transparent 0 8px,
			rgb(247 147 26 / 0.07) 8px 16px
		);
	}
</style>
