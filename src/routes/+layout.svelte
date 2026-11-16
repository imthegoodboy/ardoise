<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The server writes <html lang>; keep it right when the language changes in place.
	$effect(() => {
		const locale = page.data.locale;
		if (locale) document.documentElement.lang = locale;
	});
</script>

{@render children()}
