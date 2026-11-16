<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { makeT } from '#lib/i18n/index.ts';

	const t = $derived(makeT(page.data.locale));
	const KEY = 'ardoise.demo-guide-hidden';
	let hidden = $state(false);

	onMount(() => {
		try {
			hidden = sessionStorage.getItem(KEY) === '1';
		} catch {
			// Storage blocked: keep the guide visible.
		}
	});

	function hide() {
		hidden = true;
		try {
			sessionStorage.setItem(KEY, '1');
		} catch {
			// Nothing to remember it in; it simply comes back next visit.
		}
	}
</script>

{#if !hidden}
	<aside class="guide" aria-labelledby="guide-title">
		<div class="guide-head">
			<h2 id="guide-title">{t('demo.guide.title')}</h2>
			<button type="button" class="btn btn-plain btn-small" onclick={hide}
				>{t('demo.guide.hide')}</button
			>
		</div>
		<ol>
			<li>{t('demo.guide.1')}</li>
			<li>{t('demo.guide.2')}</li>
			<li>{t('demo.guide.3')}</li>
			<li>{t('demo.guide.4')}</li>
		</ol>
	</aside>
{/if}

<style>
	.guide {
		padding: var(--s-3) var(--s-4) var(--s-4);
		border-radius: var(--r-control);
		background: var(--ink);
		color: var(--peel-soft);
	}

	.guide-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		font-size: var(--t-body);
		color: var(--orange);
	}

	.guide-head :global(.btn-plain) {
		color: var(--peel);
	}

	ol {
		margin: var(--s-2) 0 0;
		padding-inline-start: 1.25rem;
		display: grid;
		gap: var(--s-1);
		font-size: var(--t-small);
	}

	li::marker {
		font-weight: 700;
		color: var(--orange);
	}
</style>
