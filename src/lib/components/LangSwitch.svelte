<script lang="ts">
	import { page } from '$app/state';
	import { makeT } from '#lib/i18n/index.ts';

	const t = $derived(makeT(page.data.locale));
	const href = $derived(
		`/lang?to=${t('common.otherLangCode')}&next=${encodeURIComponent(page.url.pathname)}`
	);
</script>

<a class="lang" {href} hreflang={t('common.otherLangCode')} lang={t('common.otherLangCode')}
	>{t('common.otherLang')}</a
>

<style>
	.lang {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding-inline: var(--s-3);
		font-size: var(--t-small);
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		border-radius: var(--r-control);
	}

	.lang:active {
		background: rgb(38 23 11 / 0.08);
	}
</style>
