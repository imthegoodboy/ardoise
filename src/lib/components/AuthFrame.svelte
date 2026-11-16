<script lang="ts">
	import type { Snippet } from 'svelte';
	import LangSwitch from './LangSwitch.svelte';
	import Wordmark from './Wordmark.svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<header class="page bar">
	<Wordmark />
	<LangSwitch />
</header>
<main class="page stack frame" style:--stack="var(--s-5)">
	<h1>{title}</h1>
	{@render children()}
</main>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--s-2);
	}

	.frame {
		padding-block: var(--s-5) var(--s-7);
	}

	h1 {
		font-size: var(--t-title);
	}
</style>
