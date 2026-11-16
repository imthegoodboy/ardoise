<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import { longDate } from '#lib/dates.ts';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const w = $derived(data.wallet);
	let busy = $state(false);
	let replacing = $state(false);

	function errorText(code: string): string {
		if (code === 'pin') return t('error.pin_wrong');
		if (code === 'locked') return t('error.slow_down');
		return t(`wallet.error.${code}` as MessageKey);
	}
</script>

<svelte:head>
	<title>{t('wallet.title')} · {data.shop.name}</title>
</svelte:head>

<main class="page stack" style:--stack="var(--s-4)">
	<h1>{t('wallet.title')}</h1>
	<p>{t('wallet.lead')}</p>

	{#if form && 'connected' in form}
		<p class="note note-ok" role="status">{t('wallet.ok')}</p>
	{/if}
	{#if form && 'disconnected' in form}
		<p class="note" role="status">{t('wallet.disconnected')}</p>
	{/if}
	{#if form && 'error' in form && form.error}
		<p class="note note-error" role="alert">{errorText(form.error)}</p>
	{/if}

	{#if w.kind !== 'none'}
		<section class="connected stack" style:--stack="var(--s-3)">
			<p class="who">
				<Icon name="wallet" />
				<span>
					<strong>{t('wallet.connectedTo', { label: w.label ?? 'Lightning' })}</strong>
					{#if w.connectedAt}
						<span class="meta"
							>{t('wallet.since', { date: longDate(w.connectedAt, data.locale) })}</span
						>
					{/if}
				</span>
			</p>
			{#if w.kind === 'demo'}
				<p class="small">{t('wallet.demoNote')}</p>
			{:else if w.faucet}
				<p class="small">{t('wallet.faucetNote')}</p>
			{/if}
			<div>
				<p class="label">{t('wallet.perms')}</p>
				<ul class="perms">
					<li><Icon name="check" size={18} /> {t('wallet.perm.invoice')}</li>
					<li><Icon name="check" size={18} /> {t('wallet.perm.lookup')}</li>
					{#if !w.faucet}
						<li class="no"><Icon name="shield" size={18} /> {t('wallet.perm.noSpend')}</li>
					{/if}
				</ul>
				{#if w.faucet}<p class="meta">{t('wallet.faucetPerms')}</p>{/if}
			</div>
			<form method="POST" action="?/disconnect" class="row" use:enhance>
				{#if !data.shop.isDemo}
					<label class="sr-only" for="pin-off">{t('wallet.pin')}</label>
					<input
						id="pin-off"
						name="pin"
						class="input pin"
						type="password"
						inputmode="numeric"
						autocomplete="current-password"
						placeholder={t('wallet.pin')}
						maxlength="6"
						required
					/>
				{/if}
				<button class="btn btn-danger btn-small">{t('wallet.disconnect')}</button>
			</form>
		</section>
	{/if}

	{#if w.kind === 'none' || replacing || (form && 'error' in form)}
		<section class="stack" style:--stack="var(--s-3)">
			<h2>{t('wallet.howTitle')}</h2>
			<ol class="how">
				<li>{t('wallet.how1')}</li>
				<li>{t('wallet.how2')}</li>
				<li>{t('wallet.how3')}</li>
			</ol>
			<form
				method="POST"
				action="?/connect"
				class="stack"
				style:--stack="var(--s-3)"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
						replacing = false;
					};
				}}
			>
				<div class="field">
					<label for="url">{t('wallet.field')}</label>
					<textarea
						id="url"
						name="url"
						class="input mono"
						required
						rows="4"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						placeholder="nostr+walletconnect://…"></textarea>
				</div>
				{#if !data.shop.isDemo}
					<div class="field">
						<label for="pin">{t('wallet.pin')}</label>
						<input
							id="pin"
							name="pin"
							class="input pin"
							type="password"
							inputmode="numeric"
							autocomplete="current-password"
							maxlength="6"
							required
						/>
					</div>
				{/if}
				<button class="btn btn-wide" aria-busy={busy}>
					{busy ? t('wallet.testing') : t('wallet.connect')}
				</button>
			</form>
		</section>
	{:else}
		<button type="button" class="btn btn-quiet" onclick={() => (replacing = true)}>
			{t('wallet.replace')}
		</button>
	{/if}

	<details class="why">
		<summary>{t('wallet.why')}</summary>
		<p class="small">{t('wallet.whyBody')}</p>
	</details>
</main>

<style>
	main {
		padding-block: var(--s-3) var(--s-6);
	}

	h1 {
		font-size: var(--t-title);
	}

	h2 {
		font-size: var(--t-lead);
	}

	.connected {
		padding: var(--s-4);
		border-radius: var(--r-control);
		background: var(--peel);
	}

	.who {
		display: flex;
		gap: var(--s-2);
		align-items: flex-start;
	}

	.who > span {
		display: grid;
	}

	.label {
		font-weight: 700;
		font-size: var(--t-small);
		padding-block-end: var(--s-1);
	}

	.perms {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-1);
	}

	.perms li {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		color: var(--paid);
		font-weight: 700;
		font-size: var(--t-small);
	}

	.perms li.no {
		color: var(--ink);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}

	.row .input {
		flex: 1 1 8rem;
	}

	.pin {
		letter-spacing: 0.3em;
	}

	.how {
		margin: 0;
		padding-inline-start: 1.4rem;
		display: grid;
		gap: var(--s-2);
	}

	.mono {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		font-size: 0.875rem;
		word-break: break-all;
	}

	.why summary {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
		font-weight: 700;
		color: var(--ember);
		cursor: pointer;
	}
</style>
