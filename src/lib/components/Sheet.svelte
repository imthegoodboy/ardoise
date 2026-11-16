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
	// lands on the dialog element itself, outside its content box. Both the
	// press and the release must be outside, so selecting text in a field and
	// letting go over the backdrop does not close the sheet mid-edit.
	let pressedOutside = false;

	function outside(event: MouseEvent | PointerEvent): boolean {
		if (event.target !== dialog || !dialog) return false;
		const box = dialog.getBoundingClientRect();
		return (
			event.clientX < box.left ||
			event.clientX > box.right ||
			event.clientY < box.top ||
			event.clientY > box.bottom
		);
	}

	function onpointerdown(event: PointerEvent) {
		pressedOutside = outside(event);
	}

	function onclick(event: MouseEvent) {
		if (pressedOutside && outside(event)) dialog?.close();
		pressedOutside = false;
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby={titleId}
	closedby="any"
	onclose={() => (open = false)}
	{onpointerdown}
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
