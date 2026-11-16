<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		closeLabel,
		children
	}: {
		open?: boolean;
		title: string;
		closeLabel: string;
		children: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	const titleId = 'sheet-' + Math.random().toString(36).slice(2, 9);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	// Light dismiss for browsers without `closedby`: a tap on the backdrop
	// lands on the dialog element itself, outside its content box.
	function onclick(event: MouseEvent) {
		if (event.target !== dialog || !dialog) return;
		const box = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;
		if (!inside) dialog.close();
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby={titleId}
	closedby="any"
	onclose={() => (open = false)}
	{onclick}
>
	<div class="sheet-head">
		<h2 id={titleId}>{title}</h2>
		<button type="button" class="icon-btn" onclick={() => (open = false)}>
			<Icon name="close" label={closeLabel} />
		</button>
	</div>
	{#if open}
		{@render children()}
	{/if}
</dialog>
