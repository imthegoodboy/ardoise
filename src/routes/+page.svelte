<script lang="ts">
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import LangSwitch from '#lib/components/LangSwitch.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import { formatEur, formatSats, formatXof, xofToEurCents } from '#lib/money.ts';
	import { reveal } from '#lib/reveal.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);
	const k = (key: string) => key as MessageKey;

	// The story's numbers: Awa's three purchases, paid from Paris.
	const TAB = [
		{ key: 'home.sample.rice', when: '03/11', amount: 2750 },
		{ key: 'home.sample.oil', when: '07/11', amount: 1300 },
		{ key: 'home.sample.sugar', when: '12/11', amount: 650 }
	];
	const TOTAL = TAB.reduce((sum, line) => sum + line.amount, 0);
	const totalEur = $derived(formatEur(xofToEurCents(TOTAL), data.locale));

	const features: { icon: IconName; key: string }[] = [
		{ icon: 'shield', key: 'nwc' },
		{ icon: 'receipt', key: 'proof' },
		{ icon: 'bolt', key: 'rate' },
		{ icon: 'wifiOff', key: 'offline' },
		{ icon: 'camera', key: 'import' },
		{ icon: 'book', key: 'privacy' }
	];
	const sources = $derived(
		data.rate?.sources.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ') ?? ''
	);
	const year = new Date().getUTCFullYear();
</script>

<svelte:head>
	<title>Ardoise · {t('app.tagline')}</title>
	<meta name="description" content={t('home.lead')} />
	<meta property="og:title" content="Ardoise · {t('app.tagline')}" />
	<meta property="og:description" content={t('home.lead')} />
</svelte:head>

<header class="top wide">
	<Wordmark />
	<nav class="top-links">
		<LangSwitch />
		{#if !data.signedIn}
			<a class="btn btn-small btn-quiet" href="/login">{t('common.login')}</a>
		{/if}
	</nav>
</header>

<main>
	<!-- 1. The promise, and the notebook page that settles itself -->
	<section class="hero">
		<div class="wide hero-grid">
			<div class="stack hero-copy" style:--stack="var(--s-5)">
				<h1 class="rise" style:--d="0ms">{t('home.title')}</h1>
				<p class="lead rise" style:--d="120ms">{t('home.lead')}</p>
				<div class="ctas rise" style:--d="240ms">
					{#if data.signedIn}
						<a class="btn" href="/app">{t('home.continue')}</a>
					{:else}
						<a class="btn" href="/signup">{t('home.cta')}</a>
					{/if}
					{#if data.demoEnabled}
						<form method="POST" action="/demo">
							<button class="btn btn-quiet">{t('home.demo')}</button>
						</form>
					{/if}
				</div>
				<ul class="strip rise" style:--d="360ms">
					<li><Icon name="check" size={16} /> {t('home.strip.custody')}</li>
					<li><Icon name="check" size={16} /> {t('home.strip.free')}</li>
					<li><Icon name="check" size={16} /> {t('home.strip.open')}</li>
				</ul>
			</div>

			<div class="art">
				<p class="toast" aria-hidden="true">
					<span class="toast-bolt"><Icon name="bolt" size={16} /></span>
					{t('home.toast', { amount: money(TOTAL) })}
				</p>
				<figure class="sheet-art" aria-label={t('home.sample.customer')}>
					<figcaption>
						<span class="meta">{t('home.sample.shop')}</span>
						<strong>{t('home.sample.customer')}</strong>
					</figcaption>
					<ol class="ledger">
						{#each TAB as line, i (line.key)}
							<li class="settled just-settled" style:--i={i}>
								<span class="when">{line.when}</span><span class="what">{t(k(line.key))}</span><span
									class="sum">{money(line.amount)}</span
								>
							</li>
						{/each}
						<li class="payment arrive">
							<span class="when">16/11</span><span class="what"
								><Icon name="bolt" size={15} /> {t('home.sample.paid')}</span
							><span class="sum">−{money(TOTAL)}</span>
						</li>
					</ol>
					<p class="balance"><span>{t('tab.settled')}</span> <Icon name="check" size={20} /></p>
				</figure>
			</div>
		</div>
	</section>

	<!-- 2. Why it matters -->
	<section class="wide problem" aria-labelledby="problem">
		<div use:reveal>
			<p class="kicker">{t('home.problem.kicker')}</p>
			<h2 id="problem">{t('home.problem.title')}</h2>
		</div>
		<dl class="stats">
			<div use:reveal={0}>
				<dt class="num">{t('home.stat.remit.value')}</dt>
				<dd>{t('home.stat.remit.label')}</dd>
			</div>
			<div use:reveal={120}>
				<dt class="num">{t('home.stat.cost.value')}</dt>
				<dd>{t('home.stat.cost.label')}</dd>
			</div>
			<div class="goal" use:reveal={240}>
				<dt class="num">{t('home.stat.goal.value')}</dt>
				<dd>{t('home.stat.goal.label')}</dd>
			</div>
		</dl>
		<p class="meta">{t('home.stat.source')}</p>
	</section>

	<!-- 3. The whole journey, as three screens that play when they scroll in -->
	<section class="flow" aria-labelledby="flow">
		<div class="wide" use:reveal>
			<p class="kicker">{t('home.flow.kicker')}</p>
			<h2 id="flow">{t('home.flow.title')}</h2>
		</div>
		<ol class="wide panels">
			<li class="panel shop" use:reveal={0}>
				<div class="screen" aria-hidden="true">
					<p class="screen-bar">Boutique Diallo</p>
					<p class="mini-name">Awa Ndiaye</p>
					<p class="mini-owe">
						<span class="meta">{t('tab.owes')}</span>
						<strong class="num">{money(TOTAL)}</strong>
					</p>
					<ul class="mini-lines">
						{#each TAB as line, i (line.key)}
							<li style:--n={i}>
								<span>{t(k(line.key))}</span><span class="num">{money(line.amount)}</span>
							</li>
						{/each}
					</ul>
					<span class="mini-btn"><Icon name="whatsapp" size={16} /> {t('tab.share')}</span>
				</div>
				<h3><span class="n">1</span> {t('home.flow.shop.title')}</h3>
				<p>{t('home.flow.shop.body')}</p>
			</li>
			<li class="panel chat" use:reveal={150}>
				<div class="screen" aria-hidden="true">
					<p class="screen-bar">Moussa · Paris</p>
					<div class="typing"><span></span><span></span><span></span></div>
					<div class="bubble">
						<p>{t('home.flow.chat.message')}</p>
						<p class="link">ardoise.app/p/7Qx…</p>
						<span class="time">12:04 ✓✓</span>
					</div>
				</div>
				<h3><span class="n">2</span> {t('home.flow.chat.title')}</h3>
				<p>{t('home.flow.chat.body')}</p>
			</li>
			<li class="panel pay" use:reveal={300}>
				<div class="screen" aria-hidden="true">
					<p class="screen-bar">Boutique Diallo · Médina</p>
					<p class="meta">{t('pay.due')}</p>
					<p class="mini-big num">{money(TOTAL)}</p>
					<p class="meta">≈ {totalEur}</p>
					<span class="mini-btn pay-btn"><Icon name="bolt" size={16} /> {t('pay.submit')}</span>
					<p class="mini-done"><Icon name="check" size={18} /> {t('home.flow.pay.done')}</p>
				</div>
				<h3><span class="n">3</span> {t('home.flow.pay.title')}</h3>
				<p>{t('home.flow.pay.body', { eur: totalEur })}</p>
			</li>
		</ol>
	</section>

	<!-- 4. For the people who will audit it -->
	<section class="band features" aria-labelledby="features">
		<div class="wide stack" style:--stack="var(--s-5)">
			<div class="features-head" use:reveal>
				<div>
					<p class="kicker">{t('home.features.kicker')}</p>
					<h2 id="features">{t('home.features.title')}</h2>
				</div>
				{#if data.rate}
					<p class="live">
						<span class="dot" aria-hidden="true"></span>
						<span>
							<strong
								>{t('home.rate.label')} · {t('home.rate.value', {
									amount: money(1000),
									sats: formatSats(data.rate.satsPerThousand, data.locale)
								})}</strong
							>
							<span class="meta">{t('home.rate.sources', { sources })}</span>
						</span>
					</p>
				{/if}
			</div>
			<ul class="grid">
				{#each features as feature, i (feature.key)}
					<li use:reveal={(i % 3) * 90}>
						<span class="feature-icon"><Icon name={feature.icon} /></span>
						<h3>{t(k(`home.feature.${feature.key}.title`))}</h3>
						<p>{t(k(`home.feature.${feature.key}.body`))}</p>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- 6. Questions a shopkeeper actually asks -->
	<section class="wide faq" aria-labelledby="faq">
		<h2 id="faq" use:reveal>{t('home.faq.title')}</h2>
		<div use:reveal={80}>
			{#each [1, 2, 3, 4] as n (n)}
				<details>
					<summary>{t(k(`home.faq.${n}.q`))}</summary>
					<p>{t(k(`home.faq.${n}.a`))}</p>
				</details>
			{/each}
		</div>
	</section>

	<section class="final">
		<div class="wide stack" style:--stack="var(--s-4)" use:reveal>
			<h2>{t('home.final.title')}</h2>
			<div class="ctas">
				<a class="btn" href={data.signedIn ? '/app' : '/signup'}>
					{data.signedIn ? t('home.continue') : t('home.cta')}
				</a>
				{#if data.demoEnabled}
					<form method="POST" action="/demo">
						<button class="btn btn-quiet">{t('home.demo')}</button>
					</form>
				{/if}
			</div>
		</div>
	</section>
</main>

<!-- The bottom of a notebook page: ruled, with a margin, and a spark running along it. -->
<footer class="foot">
	<div class="spark" aria-hidden="true"></div>
	<div class="wide foot-grid">
		<div class="foot-brand">
			<Wordmark />
			<p class="small">{t('app.tagline')}</p>
			<p class="meta">{t('home.footer.note')}</p>
		</div>
		<nav class="foot-col" aria-label={t('home.footer.product')}>
			<p class="foot-title">{t('home.footer.product')}</p>
			<a href={data.signedIn ? '/app' : '/signup'}
				>{data.signedIn ? t('home.continue') : t('home.cta')}</a
			>
			{#if data.demoEnabled}<a href="/demo">{t('home.demo')}</a>{/if}
			<a href="/login">{t('common.login')}</a>
		</nav>
		<div class="foot-col">
			<p class="foot-title">{t('home.footer.tech')}</p>
			<span>Bitcoin Lightning</span>
			<span>Nostr Wallet Connect</span>
			<span>WebLN · BOLT11</span>
		</div>
		<nav class="foot-col" aria-label={t('home.footer.project')}>
			<p class="foot-title">{t('home.footer.project')}</p>
			<a href="https://github.com/imthegoodboy/ardoise">{t('home.source')}</a>
			<a href="https://github.com/imthegoodboy/ardoise/blob/main/LICENSE"
				>{t('home.footer.licence')}</a
			>
			<LangSwitch />
		</nav>
	</div>
	<p class="wide foot-legal meta">© {year} Ardoise · {t('home.footer')}</p>
</footer>

<style>
	.wide {
		width: 100%;
		max-width: 66rem;
		margin-inline: auto;
		padding-inline: var(--s-4);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: var(--s-2);
	}

	.top-links {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	h2 {
		font-size: clamp(1.625rem, 5.5vw, 2.25rem);
		letter-spacing: -0.015em;
		max-width: 22ch;
	}

	.kicker {
		font-size: var(--t-small);
		font-weight: 700;
		color: var(--ember);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-block-end: var(--s-2);
	}

	/* Hero */

	.hero {
		position: relative;
		overflow: clip;
		background:
			radial-gradient(60rem 30rem at 85% 0%, rgb(247 147 26 / 0.16), transparent 60%),
			var(--peel-soft);
		border-block: 1px solid var(--rule);
		padding-block: var(--s-6) var(--s-7);
	}

	.hero-grid {
		display: grid;
		gap: var(--s-6);
	}

	h1 {
		font-size: clamp(2rem, 7.5vw, 3.25rem);
		letter-spacing: -0.02em;
		max-width: 16ch;
	}

	.lead {
		font-size: var(--t-lead);
		max-width: 34rem;
	}

	.rise {
		animation: rise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: var(--d, 0ms);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}

	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}

	.ctas > * {
		flex: 1 1 12rem;
	}

	.ctas .btn {
		width: 100%;
	}

	.strip {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-4);
		font-size: var(--t-small);
		font-weight: 700;
	}

	.strip li {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
	}

	.strip :global(svg) {
		color: var(--paid);
	}

	.art {
		position: relative;
		align-self: start;
		padding-block-start: var(--s-5);
	}

	.toast {
		position: absolute;
		z-index: 2;
		inset-block-start: 0;
		inset-inline-end: var(--s-2);
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		padding: 0.55rem 0.9rem 0.55rem 0.55rem;
		border-radius: 999px;
		background: var(--ink);
		color: var(--peel-soft);
		font-size: var(--t-small);
		font-weight: 700;
		box-shadow: 0 10px 24px -10px rgb(38 23 11 / 0.6);
		animation:
			toast-in 520ms cubic-bezier(0.2, 0.9, 0.3, 1.3) 600ms both,
			toast-float 4s ease-in-out 1.4s infinite;
	}

	.toast-bolt {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--orange);
		color: var(--ink);
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(-10px) scale(0.9);
		}
	}

	@keyframes toast-float {
		50% {
			transform: translateY(-4px);
		}
	}

	.sheet-art {
		margin: 0;
		padding: var(--s-4) var(--s-4) var(--s-3);
		background: var(--paper);
		border-radius: 0.5rem;
		box-shadow:
			0 1px 0 var(--rule-strong),
			0 18px 40px -18px rgb(120 60 0 / 0.35);
		rotate: -1.2deg;
		animation: rise 800ms cubic-bezier(0.2, 0.8, 0.2, 1) 150ms both;
	}

	figcaption {
		display: grid;
		padding-block-end: var(--s-3);
	}

	figcaption strong {
		font-size: var(--t-lead);
	}

	.sheet-art .ledger .just-settled::after {
		animation-delay: calc(var(--i) * 260ms + 1500ms);
	}

	.arrive {
		animation: arrive 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 900ms both;
	}

	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
	}

	.balance {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--s-2);
		padding-block-start: var(--s-3);
		font-weight: 700;
		color: var(--paid);
		animation: arrive 400ms ease 2400ms both;
	}

	/* Problem */

	.problem {
		padding-block: var(--s-7) var(--s-6);
	}

	.stats {
		display: grid;
		gap: var(--s-4);
		margin: 0 0 var(--s-3);
	}

	.stats > div {
		padding: var(--s-4);
		border-radius: var(--r-control);
		border: 1.5px solid var(--rule-strong);
	}

	.stats dt {
		font-size: var(--t-amount);
		line-height: 1;
		color: var(--ember);
		letter-spacing: -0.02em;
	}

	.stats dd {
		margin: var(--s-2) 0 0;
	}

	.stats .goal {
		background: var(--paid-wash);
		border-color: transparent;
	}

	.stats .goal dt {
		color: var(--paid);
	}

	/* Flow */

	.flow {
		padding-block: var(--s-6);
		border-block-start: 1px solid var(--rule);
	}

	.panels {
		list-style: none;
		margin: var(--s-5) auto 0;
		display: grid;
		gap: var(--s-6);
	}

	.panels > li > p {
		color: var(--ink-soft);
	}

	.panels h3 {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-lead);
		margin-block: var(--s-4) var(--s-1);
	}

	.n {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--orange);
		font-size: var(--t-body);
	}

	.screen {
		display: grid;
		gap: var(--s-2);
		align-content: start;
		min-height: 17rem;
		padding: var(--s-4);
		border-radius: 1.5rem;
		background: var(--paper);
		box-shadow:
			0 0 0 8px #2b1d12,
			0 22px 40px -20px rgb(60 30 0 / 0.5);
		margin: 8px;
		font-size: var(--t-small);
	}

	.screen-bar {
		font-weight: 700;
		font-size: var(--t-meta);
		color: var(--ink-soft);
		padding-block-end: var(--s-2);
		border-block-end: 1px solid var(--rule);
	}

	.mini-name {
		font-weight: 700;
		font-size: var(--t-lead);
	}

	.mini-owe {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: var(--s-2) var(--s-3);
		border-radius: 0.6rem;
		background: var(--peel);
	}

	.mini-lines {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.mini-lines li {
		display: flex;
		justify-content: space-between;
		padding-block: 0.35rem;
		border-block-end: 1px solid var(--rule);
	}

	.mini-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-1);
		min-height: 2.5rem;
		border-radius: 0.6rem;
		background: var(--peel-soft);
		box-shadow: inset 0 0 0 1.5px var(--rule-strong);
		font-weight: 700;
	}

	.mini-btn.pay-btn {
		background: var(--orange);
		box-shadow: none;
	}

	.mini-big {
		font-size: var(--t-display);
		line-height: 1;
	}

	.mini-done {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-1);
		color: var(--paid);
		font-weight: 700;
	}

	.chat .screen {
		background: #efe7dd;
	}

	.chat .screen-bar {
		border-block-end-color: #d9cdbf;
	}

	.typing {
		display: none;
	}

	.bubble {
		justify-self: end;
		max-width: 92%;
		padding: var(--s-3);
		border-radius: 0.9rem 0.9rem 0.2rem 0.9rem;
		background: #d9fdd3;
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.08);
		transform-origin: bottom right;
	}

	.bubble .link {
		margin-block-start: var(--s-1);
		color: #027eb5;
		text-decoration: underline;
		overflow-wrap: anywhere;
	}

	.time {
		display: block;
		text-align: end;
		font-size: 0.7rem;
		color: #667781;
	}

	/* Each screen plays its moment once it has scrolled in. */
	.panel:global(.in) .mini-lines li {
		animation: arrive 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: calc(500ms + var(--n) * 160ms);
	}

	.panel.shop:global(.in) .mini-btn {
		animation: press 600ms ease 1300ms both;
	}

	.panel.chat:global(.in) .typing {
		display: inline-flex;
		justify-self: end;
		gap: 4px;
		padding: 0.6rem 0.8rem;
		border-radius: 0.9rem;
		background: #fff;
		animation: vanish 1ms linear 1300ms forwards;
	}

	.typing span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #8a7f73;
		animation: bounce 900ms ease-in-out infinite;
	}

	.typing span:nth-child(2) {
		animation-delay: 150ms;
	}

	.typing span:nth-child(3) {
		animation-delay: 300ms;
	}

	.panel.chat:global(.in) .bubble {
		animation: pop 420ms cubic-bezier(0.2, 0.9, 0.3, 1.3) 1300ms both;
	}

	.panel.pay:global(.in) .pay-btn {
		animation: press 600ms ease 1200ms both;
	}

	.panel.pay:global(.in) .mini-done {
		animation: arrive 420ms ease 1800ms both;
	}

	@keyframes press {
		40% {
			transform: scale(0.94);
			filter: brightness(0.92);
		}
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
	}

	@keyframes vanish {
		to {
			opacity: 0;
			height: 0;
			padding: 0;
			margin: 0;
		}
	}

	@keyframes bounce {
		50% {
			transform: translateY(-3px);
		}
	}

	/* Features */

	.features {
		padding-block: var(--s-6);
	}

	.features-head {
		display: grid;
		gap: var(--s-4);
	}

	.live {
		display: flex;
		align-items: flex-start;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-control);
		background: var(--paper);
		font-size: var(--t-small);
		align-self: end;
	}

	.live > span:last-child {
		display: grid;
	}

	.dot {
		flex: none;
		width: 0.6rem;
		height: 0.6rem;
		margin-block-start: 0.4rem;
		border-radius: 50%;
		background: var(--paid);
		box-shadow: 0 0 0 0 rgb(28 124 74 / 0.5);
		animation: ping 1.8s ease-out infinite;
	}

	@keyframes ping {
		to {
			box-shadow: 0 0 0 8px rgb(28 124 74 / 0);
		}
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-3);
	}

	.grid li {
		padding: var(--s-4);
		border-radius: var(--r-control);
		background: var(--paper);
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
	}

	.grid li:hover {
		transform: translateY(-3px);
		box-shadow: 0 14px 30px -18px rgb(120 60 0 / 0.45);
	}

	.feature-icon {
		display: inline-grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: var(--peel-soft);
		color: var(--ember);
	}

	.grid h3 {
		font-size: var(--t-body);
		margin-block: var(--s-3) var(--s-1);
	}

	.grid p {
		font-size: var(--t-small);
		color: var(--ink-soft);
	}

	/* FAQ */

	.faq {
		padding-block: var(--s-7) var(--s-6);
	}

	.faq h2 {
		margin-block-end: var(--s-4);
	}

	details {
		border-block-end: 1px solid var(--rule);
	}

	details:first-of-type {
		border-block-start: 1px solid var(--rule);
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		min-height: 3.5rem;
		padding-block: var(--s-3);
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::after {
		content: '+';
		flex: none;
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: var(--peel);
		font-size: 1.25rem;
		line-height: 1;
		transition: rotate 250ms ease;
	}

	details[open] summary::after {
		rotate: 45deg;
	}

	details p {
		padding-block-end: var(--s-4);
		max-width: 44rem;
		color: var(--ink-soft);
		animation: arrive 300ms ease both;
	}

	/* Final call */

	.final {
		padding-block: var(--s-7);
		background:
			radial-gradient(40rem 20rem at 10% 100%, rgb(255 255 255 / 0.25), transparent 60%),
			var(--orange);
	}

	.final .btn {
		background: var(--ink);
		color: var(--peel-soft);
	}

	.final .btn-quiet {
		background: var(--paper);
		color: var(--ink);
		box-shadow: none;
	}

	/* Footer */

	.foot {
		position: relative;
		padding-block: var(--s-6) var(--s-5);
		background:
			linear-gradient(var(--margin-line), var(--margin-line)) no-repeat 2.25rem 0 / 1.5px 100%,
			repeating-linear-gradient(transparent 0 31px, var(--rule) 31px 32px),
			var(--paper);
	}

	.spark {
		position: absolute;
		inset: 0 0 auto;
		height: 3px;
		background:
			linear-gradient(
					90deg,
					transparent 0%,
					var(--orange) 45%,
					#fff4c2 50%,
					var(--orange) 55%,
					transparent 100%
				)
				no-repeat -40% 0 / 40% 100%,
			var(--rule-strong);
		animation: spark 4.5s cubic-bezier(0.6, 0, 0.4, 1) infinite;
	}

	@keyframes spark {
		to {
			background-position:
				140% 0,
				0 0;
		}
	}

	.foot-grid {
		display: grid;
		gap: var(--s-5);
		padding-inline-start: var(--s-6);
	}

	.foot-brand {
		display: grid;
		gap: var(--s-2);
		max-width: 22rem;
	}

	.foot-col {
		display: grid;
		gap: var(--s-1);
		align-content: start;
		font-size: var(--t-small);
	}

	.foot-title {
		font-weight: 700;
		font-size: var(--t-meta);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ember);
	}

	.foot-col a,
	.foot-col span {
		display: inline-flex;
		align-items: center;
		min-height: 2.25rem;
		color: var(--ink);
	}

	.foot-col a {
		text-decoration: none;
		background: linear-gradient(var(--orange), var(--orange)) no-repeat 0 85% / 0% 2px;
		transition: background-size 250ms ease;
		justify-self: start;
	}

	.foot-col a:hover,
	.foot-col a:focus-visible {
		background-size: 100% 2px;
	}

	.foot-col :global(.lang) {
		justify-self: start;
		padding-inline: 0;
	}

	.foot-legal {
		margin-block-start: var(--s-5);
		padding-inline-start: calc(var(--s-4) + var(--s-6));
	}

	@media (min-width: 40rem) {
		.stats {
			grid-template-columns: repeat(3, 1fr);
		}

		.grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.foot-grid {
			grid-template-columns: 1.4fr repeat(3, 1fr);
		}
	}

	@media (min-width: 56rem) {
		.hero {
			padding-block: var(--s-7);
		}

		.hero-grid {
			grid-template-columns: 1.15fr 1fr;
			align-items: center;
			gap: var(--s-7);
		}

		.panels {
			grid-template-columns: repeat(3, 1fr);
			gap: var(--s-5);
		}

		.grid {
			grid-template-columns: repeat(3, 1fr);
		}

		.features-head {
			grid-template-columns: 1fr auto;
			align-items: end;
		}
	}
</style>
