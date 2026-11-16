<script lang="ts">
	import { page } from '$app/state';
	import { makeT } from '#lib/i18n/index.ts';

	const t = $derived(makeT(page.data.locale ?? 'fr'));
</script>

<svelte:head>
	<title>{page.status} · Ardoise</title>
</svelte:head>

<main class="page stack error">
	<p class="code num" aria-hidden="true">{page.status}</p>
	<h1>{page.status === 404 ? t('common.notFound') : t('common.error')}</h1>
	<p><a class="btn btn-quiet" href="/">{t('common.home')}</a></p>
</main>

<style>
	.error {
		padding-block: var(--s-7);
	}

	.code {
		font-size: var(--t-amount);
		color: var(--orange);
	}
</style>
