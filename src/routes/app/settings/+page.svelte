<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	const err = (code: string) => t(`error.${code}` as MessageKey);
</script>

<svelte:head>
	<title>{t('settings.title')} · {data.shop.name}</title>
</svelte:head>

<main class="page stack" style:--stack="var(--s-5)">
	<h1>{t('settings.title')}</h1>

	{#if data.shop.isDemo}
		<p class="note">{t('demo.expires')}</p>
	{/if}

	<section class="stack" style:--stack="var(--s-3)">
		<h2>{t('settings.shop')}</h2>
		<form
			method="POST"
			action="?/shop"
			class="stack"
			style:--stack="var(--s-3)"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			{#if form && 'shopSaved' in form}<p class="note note-ok" role="status">
					{t('settings.saved')}
				</p>{/if}
			{#if form && 'shopError' in form && form.shopError}<p class="note note-error" role="alert">
					{err(form.shopError)}
				</p>{/if}
			<div class="field">
				<label for="s-name">{t('signup.shop')}</label>
				<input
					id="s-name"
					name="name"
					class="input"
					required
					maxlength="60"
					value={data.settings.name}
				/>
			</div>
			<div class="field">
				<label for="s-place">{t('signup.place')}</label>
				<input id="s-place" name="place" class="input" maxlength="60" value={data.settings.place} />
			</div>
			<div class="field">
				<label for="s-locale">{t('settings.language')}</label>
				<select id="s-locale" name="locale" class="input">
					<option value="fr" selected={data.settings.locale === 'fr'}>Français</option>
					<option value="en" selected={data.settings.locale === 'en'}>English</option>
				</select>
			</div>
			<button class="btn">{t('common.save')}</button>
		</form>
	</section>

	{#if !data.shop.isDemo}
		<section class="stack" style:--stack="var(--s-3)">
			<h2>{t('settings.pinTitle')}</h2>
			<form method="POST" action="?/pin" class="stack" style:--stack="var(--s-3)" use:enhance>
				{#if form && 'pinChanged' in form}<p class="note note-ok" role="status">
						{t('settings.pinChanged')}
					</p>{/if}
				{#if form && 'pinError' in form && form.pinError}<p class="note note-error" role="alert">
						{err(form.pinError)}
					</p>{/if}
				<input type="text" name="username" autocomplete="username" hidden value={data.shop.name} />
				<div class="field">
					<label for="p-cur">{t('settings.pinCurrent')}</label>
					<input
						id="p-cur"
						name="current"
						class="input pin"
						type="password"
						inputmode="numeric"
						autocomplete="current-password"
						maxlength="6"
						required
					/>
				</div>
				<div class="field">
					<label for="p-new">{t('settings.pinNew')}</label>
					<input
						id="p-new"
						name="next"
						class="input pin"
						type="password"
						inputmode="numeric"
						autocomplete="new-password"
						maxlength="6"
						required
					/>
				</div>
				<button class="btn btn-quiet">{t('settings.pinTitle')}</button>
			</form>
		</section>
	{/if}

	<section class="stack" style:--stack="var(--s-2)">
		<a class="btn btn-quiet" href="/app/export" download>
			<Icon name="receipt" />
			{t('settings.export')}
		</a>
		<p class="meta">{t('settings.exportHint')}</p>
	</section>

	<section class="stack" style:--stack="var(--s-3)">
		<h2>{t('settings.devices')}</h2>
		<form method="POST" action="/logout">
			<button class="btn btn-quiet btn-wide">{t('common.logout')}</button>
		</form>
		{#if !data.shop.isDemo}
			<form method="POST" action="?/logoutAll">
				<button class="btn btn-plain">{t('settings.logoutAll')}</button>
			</form>
		{/if}
	</section>

	<section class="stack privacy" style:--stack="var(--s-2)">
		<h2>{t('settings.privacy')}</h2>
		<p class="small">{t('settings.privacyBody')}</p>
	</section>

	<section class="stack danger" style:--stack="var(--s-3)">
		<h2>{t('settings.delete')}</h2>
		<p class="small">{t('settings.deleteHint')}</p>
		<form method="POST" action="?/delete" class="stack" style:--stack="var(--s-3)">
			{#if form && 'deleteError' in form && form.deleteError}<p
					class="note note-error"
					role="alert"
				>
					{err(form.deleteError)}
				</p>{/if}
			{#if !data.shop.isDemo}
				<div class="field">
					<label for="d-pin">{t('wallet.pin')}</label>
					<input
						id="d-pin"
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
			<button class="btn btn-danger">{t('settings.deleteConfirm')}</button>
		</form>
	</section>
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

	section + section {
		padding-block-start: var(--s-5);
		border-block-start: 1px solid var(--rule);
	}

	.pin {
		letter-spacing: 0.3em;
	}

	.danger h2 {
		color: var(--alert);
	}
</style>
