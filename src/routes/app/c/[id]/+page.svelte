<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidate } from '$app/navigation';
	import CustomerFields from '#lib/components/CustomerFields.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Ledger from '#lib/components/Ledger.svelte';
	import Qr from '#lib/components/Qr.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { clockTime, longDate } from '#lib/dates.ts';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import { annotateSettled, balanceOf, type LedgerEntry, type LedgerLine } from '#lib/ledger.ts';
	import { formatXof, MAX_ENTRY_XOF, parseAmount } from '#lib/money.ts';
	import { onOutboxChange, queued, send } from '#lib/outbox.ts';
	import { displayPhone, whatsappNumber } from '#lib/phone.ts';
	import { uuid } from '#lib/uuid.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);

	// --- entries: what the server has, plus what this phone wrote and has not seen confirmed
	let local = $state<LedgerEntry[]>([]);
	let pendingIds = $state(new Set<string>());

	const entries = $derived.by(() => {
		const known = new Set(data.entries.map((entry) => entry.id));
		return [...data.entries, ...local.filter((entry) => !known.has(entry.id))];
	});
	const lines = $derived(annotateSettled(entries));
	const balance = $derived(balanceOf(entries));
	const limit = $derived(data.customer.creditLimitXof);

	// Animate the strike-through only for lines that become paid while we watch.
	let seen: Set<string> | null = null;
	let justSettled = $state(new Set<string>());
	$effect(() => {
		const settled = new Set(
			lines.filter((line) => line.kind === 'purchase' && line.settled).map((line) => line.id)
		);
		if (seen) {
			const fresh = [...settled].filter((id) => !seen!.has(id));
			if (fresh.length) justSettled = new Set(fresh);
		}
		seen = settled;
	});

	function loadQueued() {
		const waiting = queued(data.customer.id);
		const ids = new Set(waiting.map((entry) => entry.id));
		// A line that left the queue without reaching the server was rejected: drop it.
		const onServer = new Set(data.entries.map((entry) => entry.id));
		local = local.filter(
			(entry) => !pendingIds.has(entry.id) || ids.has(entry.id) || onServer.has(entry.id)
		);
		pendingIds = ids;
		const known = new Set(local.map((entry) => entry.id));
		for (const entry of waiting) {
			if (!known.has(entry.id)) local.push({ ...entry, voided: false });
		}
	}

	// --- live updates: a payment can land at any moment, from anywhere in the world
	onMount(() => {
		loadQueued();
		const stop = onOutboxChange(loadQueued);
		const refresh = () => {
			if (document.visibilityState === 'visible') invalidate('app:tab');
		};
		const timer = setInterval(refresh, data.paying.length ? 4_000 : 15_000);
		document.addEventListener('visibilitychange', refresh);
		return () => {
			stop();
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
		};
	});

	// --- add a purchase or a cash payment
	let addOpen = $state(false);
	let kind = $state<'purchase' | 'payment_cash'>('purchase');
	let amountText = $state('');
	let label = $state('');
	let chip = $state<{ label: string; unit: number; qty: number } | null>(null);
	let addError = $state('');
	let notice = $state('');

	const amount = $derived(parseAmount(amountText));
	const willExceed = $derived(
		kind === 'purchase' && limit !== null && amount !== null && balance + amount > limit
	);

	function openAdd(which: 'purchase' | 'payment_cash') {
		kind = which;
		amountText = which === 'payment_cash' && balance > 0 ? String(balance) : '';
		label = '';
		chip = null;
		addError = '';
		addOpen = true;
	}

	function pick(item: { label: string; amountXof: number }) {
		if (chip && chip.label === item.label) chip.qty += 1;
		else chip = { label: item.label, unit: item.amountXof, qty: 1 };
		label = chip.qty > 1 ? `${chip.label} ×${chip.qty}` : chip.label;
		amountText = String(chip.unit * chip.qty);
	}

	async function submitEntry(event: SubmitEvent) {
		event.preventDefault();
		if (amount === null || amount > MAX_ENTRY_XOF) {
			addError = t('add.amountInvalid');
			return;
		}
		const entry = {
			id: uuid(),
			customerId: data.customer.id,
			kind,
			amountXof: amount,
			label: label.trim() || (kind === 'payment_cash' ? 'Espèces' : ''),
			occurredAt: new Date().toISOString()
		};
		local.push({ ...entry, voided: false });
		addOpen = false;
		notice = '';

		const result = await send(entry);
		if (result === 'sent') {
			await invalidate('app:tab');
		} else if (result === 'queued') {
			notice = t('add.queued');
		} else if (result === 'signed_out') {
			goto('/login?next=' + encodeURIComponent(location.pathname));
		} else {
			local = local.filter((existing) => existing.id !== entry.id);
			notice = t('common.error');
		}
	}

	// --- share the pay link
	let shareOpen = $state(false);
	let showQr = $state(false);
	let copied = $state(false);
	let canShare = $state(false);
	onMount(() => (canShare = typeof navigator.share === 'function'));

	const message = $derived(
		balance > 0
			? t('share.message', {
					name: data.customer.name,
					shop: data.shop.name,
					amount: formatXof(balance, data.locale, true),
					link: data.payUrl
				})
			: t('share.messageSettled', {
					name: data.customer.name,
					shop: data.shop.name,
					link: data.payUrl
				})
	);
	const whatsapp = $derived(
		`https://wa.me/${data.customer.phone ? whatsappNumber(data.customer.phone) : ''}?text=${encodeURIComponent(message)}`
	);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(data.payUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard blocked (insecure context): the link is visible to copy by hand.
		}
	}

	async function shareOther() {
		try {
			await navigator.share({ text: message });
		} catch {
			// Dismissed by the user.
		}
	}

	// --- one line
	let selected = $state<LedgerLine | null>(null);
	let lineOpen = $state(false);
	function select(line: LedgerLine) {
		if (pendingIds.has(line.id)) return;
		selected = line;
		lineOpen = true;
	}

	let editOpen = $state(false);
	$effect(() => {
		if (form && 'editError' in form && form.editError) editOpen = true;
	});
</script>

<svelte:head>
	<title>{data.customer.name} · {data.shop.name}</title>
</svelte:head>

<main class="page tab">
	<div class="title-row">
		<a class="icon-btn" href="/app"><Icon name="back" label={t('common.back')} /></a>
		<h1>{data.customer.name}</h1>
		<button type="button" class="icon-btn" onclick={() => (editOpen = true)}>
			<Icon name="edit" label={t('tab.edit')} />
		</button>
	</div>
	{#if data.customer.phone}
		<a class="phone small" href="tel:{data.customer.phone}">
			<Icon name="phone" size={16} />
			{displayPhone(data.customer.phone)}
		</a>
	{/if}

	<section class="balance" aria-live="polite">
		{#if balance > 0}
			<p class="label">{t('tab.owes')}</p>
			<p class="amount num">{money(balance)}</p>
		{:else if balance < 0}
			<p class="label">{t('tab.ahead')}</p>
			<p class="amount num ok">{money(-balance)}</p>
		{:else}
			<p class="amount ok settled-mark">
				<Icon name="check" size={32} />
				{t('tab.settled')}
			</p>
		{/if}
		{#if limit !== null}
			<p class="limit" class:over={balance > limit}>
				{balance > limit
					? t('tab.overLimit', { amount: money(limit) })
					: t('tab.limit', { amount: money(limit) })}
			</p>
		{/if}
		{#each data.paying as paying, i (i)}
			<p class="paying small">
				<span class="pulse"><Icon name="bolt" size={16} /></span>
				{t('tab.waiting', { amount: money(paying.amountXof) })}{paying.payerName
					? ` · ${paying.payerName}`
					: ''}
			</p>
		{/each}
	</section>

	{#if notice}
		<p class="note" role="status">{notice}</p>
	{/if}
	{#if form && 'rotated' in form}
		<p class="note note-ok" role="status">{t('share.rotated')}</p>
	{/if}

	<div class="actions no-print">
		<button type="button" class="btn" onclick={() => openAdd('purchase')}>
			<Icon name="plus" />
			{t('tab.addPurchase')}
		</button>
		<button type="button" class="btn btn-quiet" onclick={() => openAdd('payment_cash')}>
			<Icon name="cash" />
			{t('tab.addCash')}
		</button>
		<button type="button" class="btn btn-quiet share" onclick={() => (shareOpen = true)}>
			<Icon name="whatsapp" />
			{t('tab.share')}
		</button>
	</div>

	{#if lines.length === 0}
		<p class="muted empty">{t('tab.empty')}</p>
	{:else}
		<Ledger {lines} {justSettled} {pendingIds} label={t('tab.lines')} onselect={select} />
	{/if}

	<!-- Without JavaScript the sheets cannot open; this form keeps the tab usable. -->
	<noscript>
		<form method="POST" action="?/add" class="stack nojs">
			<h2>{t('tab.addPurchase')}</h2>
			<input type="hidden" name="id" value={data.newEntryId} />
			<input type="hidden" name="kind" value="purchase" />
			<input class="input" name="label" placeholder={t('add.labelPlaceholder')} />
			<input class="input" name="amount" inputmode="numeric" required placeholder="1 500" />
			<button class="btn btn-wide">{t('add.submitEmpty')}</button>
		</form>
	</noscript>
</main>

<Sheet
	bind:open={addOpen}
	title={kind === 'purchase' ? t('add.title') : t('add.cashTitle')}
	closeLabel={t('common.close')}
>
	<form method="POST" action="?/add" class="stack" onsubmit={submitEntry} novalidate>
		<input type="hidden" name="kind" value={kind} />
		<div class="field">
			<label for="amount">{t('add.amount')}</label>
			<div class="amount-wrap">
				<input
					id="amount"
					name="amount"
					class="input input-amount"
					inputmode="numeric"
					autocomplete="off"
					enterkeyhint="done"
					placeholder="0"
					bind:value={amountText}
					oninput={() => (chip = null)}
					aria-invalid={addError ? 'true' : undefined}
					aria-describedby={addError ? 'amount-error' : undefined}
				/>
				<span class="unit">F</span>
			</div>
			{#if addError}<span class="hint error" id="amount-error">{addError}</span>{/if}
		</div>

		{#if kind === 'purchase'}
			<div class="field">
				<span class="label">{t('add.quick')}</span>
				<div class="chips">
					{#each data.quickItems as item (item.label + item.amountXof)}
						{@const active = chip?.label === item.label}
						<button type="button" class="chip" class:active onclick={() => pick(item)}>
							<span>{item.label}{active && chip && chip.qty > 1 ? ` ×${chip.qty}` : ''}</span>
							<span class="num">{money(item.amountXof)}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="field">
			<label for="label">{t('add.label')} <span class="muted">({t('common.optional')})</span></label
			>
			<input
				id="label"
				name="label"
				class="input"
				maxlength="80"
				autocomplete="off"
				placeholder={kind === 'purchase' ? t('add.labelPlaceholder') : t('add.cashLabel')}
				bind:value={label}
				oninput={() => (chip = null)}
			/>
		</div>

		{#if willExceed && limit !== null}
			<p class="note note-error small">{t('add.overLimit', { limit: money(limit) })}</p>
		{/if}

		<button class="btn btn-wide">
			{amount
				? t(kind === 'purchase' ? 'add.submit' : 'add.cashSubmit', { amount: money(amount) })
				: t('add.submitEmpty')}
		</button>
	</form>
</Sheet>

<Sheet bind:open={shareOpen} title={t('share.title')} closeLabel={t('common.close')}>
	<div class="stack" style:--stack="var(--s-3)">
		<div class="field">
			<span class="label">{t('share.preview')}</span>
			<p class="preview">{message}</p>
		</div>
		<a class="btn btn-wide" href={whatsapp} target="_blank" rel="noopener noreferrer">
			<Icon name="whatsapp" />
			{data.customer.phone
				? t('share.whatsappTo', { name: data.customer.name.split(' ')[0] })
				: t('share.whatsapp')}
		</a>
		<div class="share-row">
			{#if canShare}
				<button type="button" class="btn btn-quiet" onclick={shareOther}>
					<Icon name="share" />
					{t('share.other')}
				</button>
			{/if}
			<button type="button" class="btn btn-quiet" onclick={copyLink}>
				<Icon name={copied ? 'check' : 'copy'} />
				{copied ? t('common.copied') : t('share.copy')}
			</button>
			<button
				type="button"
				class="btn btn-quiet"
				aria-expanded={showQr}
				onclick={() => (showQr = !showQr)}
			>
				<Icon name="qr" />
				{t('share.qr')}
			</button>
		</div>
		{#if showQr}
			<div class="qr-box">
				<Qr value={data.payUrl} label={t('share.qr')} size={220} />
				<p class="meta">{t('share.qrHint')}</p>
			</div>
		{/if}
		<p class="link meta">{data.payUrl}</p>
		<a class="btn btn-plain btn-small" href={data.payUrl} target="_blank" rel="noopener">
			<Icon name="external" size={18} />
			{t('share.open')}
		</a>
		<form method="POST" action="?/rotate" use:enhance class="rotate">
			<button class="btn btn-plain btn-small"
				><Icon name="refresh" size={18} /> {t('share.rotate')}</button
			>
			<p class="meta">{t('share.rotateHint')}</p>
		</form>
	</div>
</Sheet>

<Sheet bind:open={lineOpen} title={t('line.title')} closeLabel={t('common.close')}>
	{#if selected}
		{@const line = selected}
		<div class="stack" style:--stack="var(--s-3)">
			<p class="line-sum num">{money(line.amountXof)}</p>
			<p>{line.label || (line.kind === 'payment_lightning' ? t('tab.paidLightning') : '—')}</p>
			<p class="meta">{longDate(line.occurredAt, data.locale)} · {clockTime(line.occurredAt)}</p>
			{#if line.kind === 'payment_lightning'}
				{#if line.payerName}<p>{t('tab.paidBy', { name: line.payerName })}</p>{/if}
				{#if line.receiptId}
					<a class="btn btn-quiet btn-wide" href="/r/{line.receiptId}">
						<Icon name="receipt" />
						{t('invoice.receipt')}
					</a>
				{/if}
				<p class="meta">{t('line.lightningLocked')}</p>
			{:else}
				<form
					method="POST"
					action="?/void"
					use:enhance={() =>
						async ({ update }) => {
							await update();
							lineOpen = false;
						}}
				>
					<input type="hidden" name="entryId" value={line.id} />
					<input type="hidden" name="voided" value={line.voided ? '0' : '1'} />
					<button
						class="btn btn-wide"
						class:btn-danger={!line.voided}
						class:btn-quiet={line.voided}
					>
						{line.voided ? t('line.unvoid') : t('line.void')}
					</button>
				</form>
				<p class="meta">{t('line.voidHint')}</p>
			{/if}
		</div>
	{/if}
</Sheet>

<Sheet bind:open={editOpen} title={t('customer.edit.title')} closeLabel={t('common.close')}>
	<div class="stack">
		<form
			method="POST"
			action="?/edit"
			class="stack"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') editOpen = false;
				}}
		>
			{#if form && 'editError' in form && form.editError}
				<p class="note note-error" role="alert">{t(`error.${form.editError}` as MessageKey)}</p>
			{/if}
			<CustomerFields
				name={data.customer.name}
				phone={data.customer.phone ? displayPhone(data.customer.phone) : ''}
				limit={limit ? String(limit) : ''}
			/>
			<button class="btn btn-wide">{t('common.save')}</button>
		</form>
		<form method="POST" action="?/archive" class="stack" style:--stack="var(--s-2)">
			<button class="btn btn-danger btn-wide">{t('customer.archive')}</button>
			<p class="meta">{t('customer.archiveHint')}</p>
		</form>
	</div>
</Sheet>

<style>
	.tab {
		padding-block-end: var(--s-6);
	}

	.title-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		margin-inline: calc(-1 * var(--s-3));
	}

	h1 {
		font-size: var(--t-title);
		overflow-wrap: anywhere;
	}

	.phone {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		min-height: 2.75rem;
		margin-inline-start: 2.25rem;
		color: var(--ink-soft);
		text-decoration: none;
	}

	.balance {
		margin-block: var(--s-3) var(--s-4);
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

	.ok {
		color: var(--paid);
	}

	.settled-mark {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-display);
		font-weight: 700;
	}

	.limit {
		margin-block-start: var(--s-1);
		font-size: var(--t-small);
		color: var(--ink-soft);
	}

	.limit.over {
		color: var(--alert);
		font-weight: 700;
	}

	.paying {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin-block-start: var(--s-2);
		padding-block-start: var(--s-2);
		border-block-start: 1px solid var(--rule-strong);
		font-weight: 700;
	}

	.pulse {
		display: inline-grid;
		color: var(--ember);
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-2);
		margin-block-end: var(--s-5);
	}

	.actions .share {
		grid-column: 1 / -1;
	}

	.empty {
		padding-block: var(--s-5);
		text-align: center;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}

	.chip {
		display: inline-flex;
		gap: var(--s-2);
		align-items: baseline;
		min-height: 2.75rem;
		padding: 0.55rem 0.8rem;
		border: 1.5px solid var(--rule-strong);
		border-radius: 999px;
		background: var(--paper);
		font-size: var(--t-small);
		cursor: pointer;
		touch-action: manipulation;
	}

	.chip .num {
		color: var(--ink-soft);
		font-weight: 400;
	}

	.chip.active {
		background: var(--peel);
		border-color: var(--orange);
		font-weight: 700;
	}

	.chip.active .num {
		color: var(--ink);
	}

	.error {
		color: var(--alert) !important;
		font-weight: 700;
	}

	.preview {
		padding: var(--s-3);
		border-radius: var(--r-control);
		background: #e7f6ec;
		font-size: var(--t-small);
		overflow-wrap: anywhere;
	}

	.share-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}

	.share-row > * {
		flex: 1 1 8rem;
	}

	.qr-box {
		display: grid;
		justify-items: center;
		gap: var(--s-2);
		text-align: center;
	}

	.link {
		overflow-wrap: anywhere;
	}

	.rotate {
		padding-block-start: var(--s-2);
		border-block-start: 1px solid var(--rule);
	}

	.line-sum {
		font-size: var(--t-display);
	}

	.nojs {
		margin-block-start: var(--s-5);
	}
</style>
