/**
 * Fade a block in as it scrolls into view, and let CSS play its own entrance
 * (`.in` is added once). Without JavaScript, or with reduced motion, nothing
 * is ever hidden: elements only get `.reveal` once we know they will be shown.
 *
 * Belt and braces, because hidden content is worse than no animation:
 * IntersectionObserver first, a passive scroll check second (observers are
 * paused in some background tabs and embedded previews), and a timer last, so
 * a full-page screenshot or a crawler never sees an empty section.
 */
const pending = new Set<HTMLElement>();
let listening = false;
let safety: ReturnType<typeof setTimeout> | undefined;

function show(node: HTMLElement) {
	node.classList.add('in');
	pending.delete(node);
}

function check() {
	const limit = innerHeight * 0.92;
	for (const node of pending) {
		const box = node.getBoundingClientRect();
		if (box.top < limit && box.bottom > 0) show(node);
	}
}

function listen() {
	if (listening) return;
	listening = true;
	addEventListener('scroll', check, { passive: true });
	addEventListener('resize', check, { passive: true });
	safety = setTimeout(() => {
		for (const node of [...pending]) show(node);
	}, 10_000);
}

export function reveal(node: HTMLElement, delay = 0) {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduced || typeof IntersectionObserver === 'undefined') {
		node.classList.add('in');
		return;
	}

	const box = node.getBoundingClientRect();
	if (box.top < innerHeight * 0.92 && box.bottom > 0) {
		// Already on screen at load: play the entrance, but never start invisible.
		requestAnimationFrame(() => node.classList.add('in'));
		return;
	}

	node.classList.add('reveal');
	node.style.setProperty('--reveal-delay', `${delay}ms`);
	pending.add(node);
	listen();

	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				show(node);
				observer.disconnect();
			}
		},
		{ rootMargin: '0px 0px -8% 0px' }
	);
	observer.observe(node);
	return {
		destroy() {
			observer.disconnect();
			pending.delete(node);
			if (!pending.size && listening) {
				removeEventListener('scroll', check);
				removeEventListener('resize', check);
				clearTimeout(safety);
				listening = false;
			}
		}
	};
}
