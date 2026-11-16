<script lang="ts">
	import AuthFrame from '#lib/components/AuthFrame.svelte';
	import { makeT } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
</script>

<svelte:head>
	<title>{t('demo.title')} · Ardoise</title>
</svelte:head>

<AuthFrame title={t('demo.title')}>
	{#if form?.error}
		<p class="note note-error" role="alert">{t('error.slow_down')}</p>
	{/if}
	<p>{t('demo.body')}</p>
	<p class="note">{t(`demo.wallet.${data.wallet}`)}</p>
	{#if data.signedIn}
		<p class="note note-error">{t('demo.signedInWarning')}</p>
	{/if}
	<form method="POST">
		<button class="btn btn-wide">{t('demo.enter')}</button>
	</form>
</AuthFrame>
