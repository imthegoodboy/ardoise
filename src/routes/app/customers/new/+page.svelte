<script lang="ts">
	import { enhance } from '$app/forms';
	import CustomerFields from '#lib/components/CustomerFields.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	let busy = $state(false);
</script>

<svelte:head>
	<title>{t('customer.new.title')} · {data.shop.name}</title>
</svelte:head>

<main class="page stack" style:--stack="var(--s-4)">
	<div class="title-row">
		<a class="icon-btn" href="/app"><Icon name="back" label={t('common.back')} /></a>
		<h1>{t('customer.new.title')}</h1>
	</div>

	<form
		method="POST"
		class="stack"
		use:enhance={({ cancel }) => {
			// One tap, one customer: a second tap while saving is ignored.
			if (busy) return cancel();
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if form?.error}
			<p class="note note-error" role="alert">{t(`error.${form.error}` as MessageKey)}</p>
		{/if}
		<CustomerFields name={form?.name} phone={form?.phone} limit={form?.limit} />
		<button class="btn btn-wide" aria-busy={busy}>{t('customer.create')}</button>
	</form>
</main>

<style>
	.title-row {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin-inline-start: calc(-1 * var(--s-3));
	}

	h1 {
		font-size: var(--t-title);
	}
</style>
