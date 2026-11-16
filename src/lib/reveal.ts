/**
 * Fade a block in as it scrolls into view, and let CSS play its own entrance
 * (`.in` is added once). Without JavaScript, or with reduced motion, nothing
 * is ever hidden: elements only get `.reveal` once we know they will be shown.
 */
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
	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				node.classList.add('in');
				observer.disconnect();
			}
		},
		{ rootMargin: '0px 0px -12% 0px' }
	);
	observer.observe(node);
	return {
		destroy() {
			observer.disconnect();
		}
	};
}
