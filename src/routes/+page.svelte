<script lang="ts">
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import LangSwitch from '#lib/components/LangSwitch.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import { formatNumber, formatXof } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const money = (amount: number) => formatXof(amount, data.locale);

	const features: { icon: IconName; key: string }[] = [
		{ icon: 'shield', key: 'nwc' },
		{ icon: 'receipt', key: 'proof' },
		{ icon: 'bolt', key: 'rate' },
		{ icon: 'wifiOff', key: 'offline' },
		{ icon: 'camera', key: 'import' },
		{ icon: 'book', key: 'privacy' }
	];
	const k = (key: string) => key as MessageKey;
	const sources = $derived(
		data.rate?.sources.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ') ?? ''
	);
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
				<h1>{t('home.title')}</h1>
				<p class="lead">{t('home.lead')}</p>
				<div class="ctas">
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
				<ul class="strip">
					<li><Icon name="check" size={16} /> {t('home.strip.custody')}</li>
					<li><Icon name="check" size={16} /> {t('home.strip.free')}</li>
					<li><Icon name="check" size={16} /> {t('home.strip.open')}</li>
				</ul>
			</div>

			<figure class="sheet-art" aria-label={t('home.sample.customer')}>
				<figcaption>
					<span class="meta">{t('home.sample.shop')}</span>
					<strong>{t('home.sample.customer')}</strong>
				</figcaption>
				<ol class="ledger">
					<li class="settled just-settled" style:--i="0">
						<span class="when">03/11</span><span class="what">{t('home.sample.rice')}</span><span
							class="sum">{money(2750)}</span
						>
					</li>
					<li class="settled just-settled" style:--i="1">
						<span class="when">07/11</span><span class="what">{t('home.sample.oil')}</span><span
							class="sum">{money(1300)}</span
						>
					</li>
					<li class="settled just-settled" style:--i="2">
						<span class="when">12/11</span><span class="what">{t('home.sample.sugar')}</span><span
							class="sum">{money(650)}</span
						>
					</li>
					<li class="payment arrive">
						<span class="when">16/11</span><span class="what"
							><Icon name="bolt" size={15} /> {t('home.sample.paid')}</span
						><span class="sum">−{money(4700)}</span>
					</li>
				</ol>
				<p class="balance"><span>{t('tab.settled')}</span> <Icon name="check" size={20} /></p>
			</figure>
		</div>
	</section>

	<!-- 2. Why it matters -->
	<section class="wide problem" aria-labelledby="problem">
		<p class="kicker">{t('home.problem.kicker')}</p>
		<h2 id="problem">{t('home.problem.title')}</h2>
		<div class="problem-copy">
			<p>{t('home.problem.body1')}</p>
			<p>{t('home.problem.body2')}</p>
		</div>
		<dl class="stats">
			<div>
				<dt class="num">{t('home.stat.remit.value')}</dt>
				<dd>{t('home.stat.remit.label')}</dd>
			</div>
			<div>
				<dt class="num">{t('home.stat.cost.value')}</dt>
				<dd>{t('home.stat.cost.label')}</dd>
			</div>
			<div class="goal">
				<dt class="num">{t('home.stat.goal.value')}</dt>
				<dd>{t('home.stat.goal.label')}</dd>
			</div>
		</dl>
		<p class="meta">{t('home.stat.source')}</p>
	</section>

	<!-- 3. The whole journey, as three screens -->
	<section class="flow" aria-labelledby="flow">
		<div class="wide">
			<p class="kicker">{t('home.flow.kicker')}</p>
			<h2 id="flow">{t('home.flow.title')}</h2>
		</div>
		<ol class="wide panels">
			<li>
				<div class="screen" aria-hidden="true">
					<p class="screen-bar">Boutique Diallo</p>
					<p class="mini-name">Awa Ndiaye</p>
					<p class="mini-owe">
						<span class="meta">{t('tab.owes')}</span> <strong class="num">{money(4700)}</strong>
					</p>
					<ul class="mini-lines">
						<li><span>{t('home.sample.rice')}</span><span class="num">{money(2750)}</span></li>
						<li><span>{t('home.sample.oil')}</span><span class="num">{money(1300)}</span></li>
						<li><span>{t('home.sample.sugar')}</span><span class="num">{money(650)}</span></li>
					</ul>
					<span class="mini-btn">{t('tab.share')}</span>
				</div>
				<h3><span class="n">1</span> {t('home.flow.shop.title')}</h3>
				<p>{t('home.flow.shop.body')}</p>
			</li>
			<li>
				<div class="screen chat" aria-hidden="true">
					<p class="screen-bar">Moussa</p>
					<div class="bubble">
						<p>{t('home.flow.chat.message')}</p>
						<p class="link">ardoise.app/p/7Qx…</p>
						<span class="time">12:04 ✓✓</span>
					</div>
				</div>
				<h3><span class="n">2</span> {t('home.flow.chat.title')}</h3>
				<p>{t('home.flow.chat.body')}</p>
			</li>
			<li>
				<div class="screen" aria-hidden="true">
					<p class="screen-bar">Boutique Diallo · Médina</p>
					<p class="meta">{t('pay.due')}</p>
					<p class="mini-big num">{money(4700)}</p>
					<p class="meta">≈ 7,17 €</p>
					<span class="mini-btn pay"><Icon name="bolt" size={16} /> {t('pay.submit')}</span>
					<p class="mini-done"><Icon name="check" size={18} /> {t('home.flow.pay.done')}</p>
				</div>
				<h3><span class="n">3</span> {t('home.flow.pay.title')}</h3>
				<p>{t('home.flow.pay.body')}</p>
			</li>
		</ol>
	</section>

	<!-- 4. Before and after, in the product's own ink -->
	<section class="wide compare" aria-labelledby="compare">
		<h2 id="compare">{t('home.compare.title')}</h2>
		<div class="compare-head" aria-hidden="true">
			<span>{t('home.compare.before')}</span><span>{t('home.compare.after')}</span>
		</div>
		<ul class="pairs">
			{#each [1, 2, 3, 4] as n (n)}
				<li>
					<p class="before">
						<span class="sr-only">{t('home.compare.before')} :</span>
						<s>{t(k(`home.compare.${n}.before`))}</s>
					</p>
					<p class="after">
						<Icon name="check" size={18} />
						<span
							><span class="sr-only">{t('home.compare.after')} :</span>
							{t(k(`home.compare.${n}.after`))}</span
						>
					</p>
				</li>
			{/each}
		</ul>
	</section>

	<!-- 5. For the people who will audit it -->
	<section class="band features" aria-labelledby="features">
		<div class="wide stack" style:--stack="var(--s-5)">
			<div class="features-head">
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
									sats: formatNumber(data.rate.satsPerThousand, data.locale)
								})}</strong
							>
							<span class="meta">{t('home.rate.sources', { sources })}</span>
						</span>
					</p>
				{/if}
			</div>
			<ul class="grid">
				{#each features as feature (feature.key)}
					<li>
						<Icon name={feature.icon} />
						<h3>{t(k(`home.feature.${feature.key}.title`))}</h3>
						<p>{t(k(`home.feature.${feature.key}.body`))}</p>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- 6. Questions a shopkeeper actually asks -->
	<section class="wide faq" aria-labelledby="faq">
		<h2 id="faq">{t('home.faq.title')}</h2>
		{#each [1, 2, 3, 4, 5, 6] as n (n)}
			<details>
				<summary>{t(k(`home.faq.${n}.q`))}</summary>
				<p>{t(k(`home.faq.${n}.a`))}</p>
			</details>
		{/each}
	</section>

	<section class="final">
		<div class="wide stack" style:--stack="var(--s-4)">
			<h2>{t('home.final.title')}</h2>
			<p>{t('home.final.body')}</p>
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

<footer class="wide foot">
	<Wordmark />
	<p class="meta">{t('home.footer')}</p>
	<a class="meta" href="https://github.com/imthegoodboy/ardoise">{t('home.source')}</a>
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
		background: var(--peel-soft);
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

	.sheet-art {
		margin: 0;
		padding: var(--s-4) var(--s-4) var(--s-3);
		background: var(--paper);
		border-radius: 0.5rem;
		box-shadow:
			0 1px 0 var(--rule-strong),
			0 18px 40px -18px rgb(120 60 0 / 0.35);
		rotate: -1.2deg;
		align-self: start;
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
		animation: arrive 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 700ms both;
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

	.problem-copy {
		display: grid;
		gap: var(--s-3);
		margin-block: var(--s-4) var(--s-5);
		max-width: 40rem;
		font-size: var(--t-lead);
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
		background:
			linear-gradient(var(--rule), var(--rule)) top / 100% 1px no-repeat,
			var(--paper);
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

	.mini-btn.pay {
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

	.chat {
		background: #efe7dd;
	}

	.chat .screen-bar {
		border-block-end-color: #d9cdbf;
	}

	.bubble {
		justify-self: end;
		max-width: 92%;
		padding: var(--s-3);
		border-radius: 0.9rem 0.9rem 0.2rem 0.9rem;
		background: #d9fdd3;
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.08);
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

	/* Compare */

	.compare {
		padding-block: var(--s-7) var(--s-6);
	}

	.compare-head {
		display: none;
	}

	.pairs {
		list-style: none;
		margin: var(--s-4) 0 0;
		padding: 0;
		border-block-start: 1px solid var(--rule);
	}

	.pairs li {
		display: grid;
		gap: var(--s-2);
		padding-block: var(--s-4);
		border-block-end: 1px solid var(--rule);
	}

	.before {
		color: var(--ink-soft);
	}

	.before s {
		text-decoration-color: rgb(168 71 11 / 0.7);
		text-decoration-thickness: 2px;
	}

	.after {
		display: flex;
		gap: var(--s-2);
		font-weight: 700;
	}

	.after :global(svg) {
		flex: none;
		color: var(--paid);
		margin-block-start: 0.15rem;
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
		animation: blink 1.6s ease-in-out infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0.3;
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
	}

	.grid :global(svg) {
		color: var(--ember);
	}

	.grid h3 {
		font-size: var(--t-body);
		margin-block: var(--s-2) var(--s-1);
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
	}

	details[open] summary::after {
		content: '−';
	}

	details p {
		padding-block-end: var(--s-4);
		max-width: 44rem;
		color: var(--ink-soft);
	}

	/* Final call */

	.final {
		padding-block: var(--s-7);
		background: var(--orange);
	}

	.final p {
		font-size: var(--t-lead);
		max-width: 34rem;
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

	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding-block: var(--s-5) var(--s-6);
	}

	@media (min-width: 40rem) {
		.stats {
			grid-template-columns: repeat(3, 1fr);
		}

		.grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.pairs li {
			grid-template-columns: 1fr 1fr;
			gap: var(--s-5);
		}

		.compare-head {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: var(--s-5);
			margin-block-start: var(--s-4);
			font-size: var(--t-small);
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: var(--ink-soft);
		}

		.compare-head span:last-child {
			color: var(--paid);
		}

		.pairs {
			margin-block-start: var(--s-2);
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
