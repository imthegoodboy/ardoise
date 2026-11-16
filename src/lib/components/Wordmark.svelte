<script lang="ts">
	let { href = '/' }: { href?: string } = $props();
</script>

<a class="wordmark" {href}>
	<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
		<rect x="3" y="3" width="26" height="26" rx="5" fill="#f7931a" />
		<path d="M9 11h14M9 16h14M9 21h9" stroke="#26170b" stroke-width="2.4" stroke-linecap="round" />
		<path d="M7 16.5 25 15" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
	</svg>
	<span>Ardoise</span>
</a>

<style>
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 2.75rem;
		font-weight: 700;
		font-size: 1.25rem;
		letter-spacing: -0.01em;
		color: var(--ink);
		text-decoration: none;
	}
</style>
