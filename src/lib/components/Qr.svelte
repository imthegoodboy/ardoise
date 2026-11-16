<script lang="ts">
	import { encode } from 'uqr';

	let {
		value,
		label,
		size = 260
	}: {
		value: string;
		label: string;
		size?: number;
	} = $props();

	// One path for the whole code: a few kilobytes of SVG instead of an image.
	const matrix = $derived.by(() => {
		const qr = encode(value, { ecc: 'L', border: 2 });
		let d = '';
		qr.data.forEach((row, y) => {
			row.forEach((dark, x) => {
				if (dark) d += `M${x} ${y}h1v1h-1z`;
			});
		});
		return { d, size: qr.size };
	});
</script>

<svg
	class="qr"
	width={size}
	height={size}
	viewBox="0 0 {matrix.size} {matrix.size}"
	role="img"
	aria-label={label}
	shape-rendering="crispEdges"
>
	<rect width={matrix.size} height={matrix.size} fill="#fff" />
	<path d={matrix.d} fill="#26170b" />
</svg>

<style>
	.qr {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: var(--r-control);
	}
</style>
