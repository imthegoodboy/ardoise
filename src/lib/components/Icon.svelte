<script lang="ts" module>
	// Hand-tuned 24px stroke icons. Inline, so there is no icon font to download.
	const paths = {
		back: 'M15 5l-7 7 7 7',
		close: 'M6 6l12 12M18 6L6 18',
		plus: 'M12 5v14M5 12h14',
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
		book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11M9 8h6',
		camera: 'M4 8h3l2-3h6l2 3h3v11H4V8zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
		wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4V7zM4 7l11-3v3M15 13.5h2',
		settings:
			'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
		share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
		copy: 'M9 9h10v10H9zM5 15V5h10',
		qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2M18 18h2v2h-2z',
		bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		phone:
			'M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z',
		receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
		cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4',
		edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
		refresh: 'M20 11a8 8 0 0 0-14.3-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.5L20 16M20 20v-4h-4',
		whatsapp:
			'M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 1a5 5 0 0 1-2.5-2.5l1-1-1-2L9 8.5z',
		external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
		print: 'M7 9V4h10v5M7 17H4v-8h16v8h-3M7 14h10v6H7z',
		shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4',
		wifiOff:
			'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M12 20h.01M19 13a10 10 0 0 0-2-1.4'
	} as const;
	export type IconName = keyof typeof paths;
</script>

<script lang="ts">
	let {
		name,
		size = 24,
		label
	}: {
		name: IconName;
		size?: number;
		/** Only for icons that carry meaning on their own; decorative icons stay hidden. */
		label?: string;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	focusable="false"
>
	<path d={paths[name]} />
</svg>
