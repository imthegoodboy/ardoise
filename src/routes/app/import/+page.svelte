<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import { makeT, plural } from '#lib/i18n/index.ts';
	import { formatXof, parseAmount } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));

	interface Row {
		keep: boolean;
		customer: string;
		item: string;
		amount: string;
		date: string;
		kind: 'purchase' | 'payment_cash';
		unsure: boolean;
	}

	let rows = $state<Row[]>([]);
	let reading = $state(false);
	let readError = $state('');
	let added = $state<number | null>(null);

	const known = $derived(new Set(data.names.map((name) => name.toLowerCase())));
	const kept = $derived(
		rows.filter((row) => row.keep && parseAmount(row.amount) && row.customer.trim())
	);
	const payload = $derived(
		JSON.stringify(
			kept.map((row) => ({
				customer: row.customer.trim(),
				item: row.item.trim(),
				amountXof: parseAmount(row.amount),
				date: row.date || null,
				kind: row.kind
			}))
		)
	);

	function errorText(code: string) {
		if (code === 'not_configured') return t('import.notConfigured');
		if (code === 'nothing') return t('import.nothing');
		if (code === 'too_big') return t('import.tooBig');
		if (code === 'slow_down') return t('error.slow_down');
		return t('import.failed');
	}

	/** Phone photos are 3-12 MB; 1600 px is plenty to read handwriting and ~10x lighter to send. */
	async function shrink(file: Blob): Promise<Blob> {
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			bitmap.close();
			return await new Promise<Blob>((resolve, reject) =>
				canvas.toBlob(
					(blob) => (blob ? resolve(blob) : reject(new Error('encode'))),
					'image/jpeg',
					0.82
				)
			);
		} catch {
			return file;
		}
	}

	async function read(file: Blob) {
		reading = true;
		readError = '';
		added = null;
		rows = [];
		try {
			const body = new FormData();
			body.set('photo', new File([await shrink(file)], 'page.jpg', { type: 'image/jpeg' }));
			const response = await fetch('?/read', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'success' && result.data?.lines) {
				rows = (
					result.data.lines as Array<
						Omit<Row, 'keep' | 'amount' | 'date'> & {
							amountXof: number;
							date: string | null;
							crossedOut: boolean;
						}
					>
				).map((line) => ({
					keep: !line.crossedOut,
					customer: line.customer,
					item: line.item,
					amount: String(line.amountXof),
					date: line.date ?? '',
					kind: line.kind,
					unsure: line.unsure
				}));
			} else if (result.type === 'failure') {
				readError = errorText(String(result.data?.readError ?? 'failed'));
			} else {
				await applyAction(result);
			}
		} catch {
			readError = t('import.failed');
		} finally {
			reading = false;
		}
	}

	function onPick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) read(file);
	}

	async function useSample() {
		const response = await fetch('/samples/cahier.jpg');
		if (response.ok) read(await response.blob());
	}
</script>

<svelte:head>
	<title>{t('import.title')} · {data.shop.name}</title>
</svelte:head>

<main class="page stack" style:--stack="var(--s-4)">
	<h1>{t('import.title')}</h1>

	{#if added !== null || (form && 'added' in form)}
		<div class="note note-ok stack" style:--stack="var(--s-2)" role="status">
			<p>{t('import.added', { n: added ?? (form && 'added' in form ? (form.added ?? 0) : 0) })}</p>
			<a class="btn btn-small" href="/app">{t('nav.book')}</a>
		</div>
	{/if}

	{#if !data.configured}
		<p class="note">{t('import.notConfigured')}</p>
	{:else if rows.length === 0}
		<p>{t('import.lead')}</p>

		<!-- With JavaScript the photo is shrunk first; without, this form still works. -->
		<form method="POST" action="?/read" enctype="multipart/form-data" class="stack pick">
			<label class="btn btn-wide camera">
				<Icon name="camera" />
				{t('import.photo')}
				<input
					class="sr-only"
					type="file"
					name="photo"
					accept="image/jpeg,image/png,image/webp"
					capture="environment"
					onchange={onPick}
				/>
			</label>
			<noscript><button class="btn btn-quiet btn-wide">{t('import.read')}</button></noscript>
		</form>
		<button type="button" class="btn btn-quiet" onclick={useSample} disabled={reading}>
			{t('import.sample')}
		</button>

		{#if reading}
			<p class="reading" role="status">
				<span class="dot" aria-hidden="true"></span>
				{t('import.reading')}
			</p>
		{/if}
		{#if readError || (form && 'readError' in form && form.readError)}
			<p class="note note-error" role="alert">
				{readError || errorText(String(form && 'readError' in form ? form.readError : 'failed'))}
			</p>
		{/if}
		<p class="meta">{t('import.privacy')}</p>
	{:else}
		<h2>{t('import.review')}</h2>
		<p class="small muted">{t('import.reviewHint')}</p>

		<ol class="rows">
			{#each rows as row, i (i)}
				<li class:off={!row.keep} class:unsure={row.unsure}>
					<label class="keep">
						<input type="checkbox" bind:checked={row.keep} />
						<span class="sr-only">{t('import.keep')}</span>
					</label>
					<div class="cells">
						<div class="who">
							<input
								class="input"
								aria-label={t('import.customer')}
								list="known-names"
								bind:value={row.customer}
							/>
							{#if row.customer.trim() && !known.has(row.customer.trim().toLowerCase())}
								<span class="tag">{t('import.newCustomer')}</span>
							{/if}
							{#if row.unsure}<span class="tag warn">{t('import.uncertain')}</span>{/if}
						</div>
						<input class="input" aria-label={t('import.item')} bind:value={row.item} />
						<div class="split">
							<input
								class="input num"
								aria-label={t('import.amount')}
								inputmode="numeric"
								bind:value={row.amount}
							/>
							<input class="input" type="date" aria-label="Date" bind:value={row.date} />
						</div>
						{#if row.kind === 'payment_cash'}<span class="tag paid">{t('tab.paidCash')}</span>{/if}
					</div>
				</li>
			{/each}
		</ol>
		<datalist id="known-names">
			{#each data.names as name (name)}<option value={name}></option>{/each}
		</datalist>

		<form
			method="POST"
			action="?/save"
			use:enhance={() =>
				async ({ result, update }) => {
					if (result.type === 'success') {
						added = Number(result.data?.added ?? 0);
						rows = [];
						await invalidateAll();
					} else {
						await update();
					}
				}}
		>
			<input type="hidden" name="lines" value={payload} />
			<button class="btn btn-wide" disabled={kept.length === 0}>
				{plural(t, kept.length, 'import.add.one', 'import.add.other')}
				· {formatXof(
					kept.reduce((sum, row) => sum + (parseAmount(row.amount) ?? 0), 0),
					data.locale
				)}
			</button>
		</form>
		<button type="button" class="btn btn-plain" onclick={() => (rows = [])}
			>{t('import.another')}</button
		>
	{/if}
</main>

<style>
	main {
		padding-block: var(--s-3) var(--s-6);
	}

	h1 {
		font-size: var(--t-title);
	}

	h2 {
		font-size: var(--t-lead);
	}

	.camera {
		min-height: 4rem;
		font-size: var(--t-lead);
	}

	.camera:focus-within {
		outline: 3px solid var(--ink);
		outline-offset: 2px;
	}

	.reading {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-weight: 700;
	}

	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: var(--orange);
		animation: blink 1s ease-in-out infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0.25;
		}
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		border-block-start: 1px solid var(--rule);
	}

	.rows li {
		display: grid;
		grid-template-columns: 2.5rem 1fr;
		gap: var(--s-2);
		padding-block: var(--s-3);
		border-block-end: 1px solid var(--rule);
	}

	.rows li.off .cells {
		opacity: 0.45;
	}

	.rows li.unsure {
		background: linear-gradient(90deg, var(--peel-soft), transparent 70%);
	}

	.keep {
		display: grid;
		place-items: center;
		align-self: start;
		min-height: var(--tap);
	}

	.keep input {
		width: 1.4rem;
		height: 1.4rem;
		accent-color: var(--ember);
	}

	.cells {
		display: grid;
		gap: var(--s-2);
	}

	.cells .input {
		min-height: 2.9rem;
		padding-block: var(--s-2);
	}

	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-1) var(--s-2);
	}

	.who .input {
		flex: 1 1 10rem;
		font-weight: 700;
	}

	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-2);
	}

	.tag {
		font-size: var(--t-meta);
		font-weight: 700;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		background: var(--peel);
		justify-self: start;
	}

	.tag.warn {
		background: var(--alert-wash);
		color: var(--alert);
	}

	.tag.paid {
		background: var(--paid-wash);
		color: var(--paid);
	}
</style>
