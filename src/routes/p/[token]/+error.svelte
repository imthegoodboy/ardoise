<script lang="ts">
	import { page } from '$app/state';
	import LangSwitch from '#lib/components/LangSwitch.svelte';
	import { makeT } from '#lib/i18n/index.ts';

	// A payer who lands here holds an old or mistyped link: tell them what to do,
	// never send them to a marketing page.
	const t = $derived(makeT(page.data.locale ?? 'fr'));
	const gone = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{gone ? t('pay.gone.title') : t('common.error')} · Ardoise</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="page bar">
	<strong>Ardoise</strong>
	<LangSwitch />
</header>
<main class="page stack gone" style:--stack="var(--s-4)">
	<svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
		<rect x="6" y="8" width="36" height="32" rx="5" fill="#ffe2bf" />
		<path
			d="M14 18h20M14 25h20M14 32h12"
			stroke="#a8470b"
			stroke-width="2.5"
			stroke-linecap="round"
		/>
		<path d="M10 40 38 10" stroke="#26170b" stroke-width="3" stroke-linecap="round" />
	</svg>
	{#if gone}
		<h1>{t('pay.gone.title')}</h1>
		<p>{t('pay.gone.body')}</p>
	{:else}
		<h1>{t('common.error')}</h1>
	{/if}
</main>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--s-3);
		border-block-end: 1px solid var(--rule);
	}

	.gone {
		padding-block: var(--s-6);
	}

	h1 {
		font-size: var(--t-title);
	}
</style>
