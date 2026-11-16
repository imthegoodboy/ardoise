<script lang="ts">
	import type { Snippet } from 'svelte';
	import LangSwitch from './LangSwitch.svelte';

	let { shop, place, children }: { shop: string; place?: string; children: Snippet } = $props();
</script>

<header class="page bar">
	<div class="shop">
		<strong>{shop}</strong>
		{#if place}<span class="meta">{place}</span>{/if}
	</div>
	<LangSwitch />
</header>
<main class="page stack public" style:--stack="var(--s-4)">
	{@render children()}
</main>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding-block: var(--s-3);
		border-block-end: 1px solid var(--rule);
	}

	.shop {
		display: grid;
		line-height: 1.25;
	}

	.public {
		padding-block: var(--s-4) var(--s-7);
	}
</style>
