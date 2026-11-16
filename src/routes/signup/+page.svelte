<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthFrame from '#lib/components/AuthFrame.svelte';
	import { makeT, type MessageKey } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	let busy = $state(false);
	const PIN_PATTERN = '[0-9]{6}';
</script>

<svelte:head>
	<title>{t('signup.title')} · Ardoise</title>
</svelte:head>

<AuthFrame title={t('signup.title')}>
	<form
		method="POST"
		class="stack"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if form?.error}
			<p class="note note-error" role="alert">{t(`error.${form.error}` as MessageKey)}</p>
		{/if}

		<div class="field">
			<label for="name">{t('signup.shop')}</label>
			<input
				id="name"
				name="name"
				class="input"
				required
				maxlength="60"
				autocomplete="organization"
				placeholder={t('signup.shopPlaceholder')}
				value={form?.name ?? ''}
			/>
		</div>

		<div class="field">
			<label for="place"
				>{t('signup.place')} <span class="muted">({t('common.optional')})</span></label
			>
			<input
				id="place"
				name="place"
				class="input"
				maxlength="60"
				autocomplete="address-level2"
				placeholder={t('signup.placePlaceholder')}
				value={form?.place ?? ''}
			/>
		</div>

		<div class="field">
			<label for="phone">{t('signup.phone')}</label>
			<input
				id="phone"
				name="phone"
				class="input"
				type="tel"
				required
				autocomplete="username"
				inputmode="tel"
				placeholder="77 123 45 67"
				aria-describedby="phone-hint"
				value={form?.phone ?? ''}
			/>
			<span class="hint" id="phone-hint">{t('signup.phoneHint')}</span>
		</div>

		<div class="field">
			<label for="pin">{t('signup.pin')}</label>
			<input
				id="pin"
				name="pin"
				class="input pin"
				type="password"
				required
				inputmode="numeric"
				autocomplete="new-password"
				pattern={PIN_PATTERN}
				minlength="6"
				maxlength="6"
				aria-describedby="pin-hint"
			/>
			<span class="hint" id="pin-hint">{t('signup.pinHint')}</span>
		</div>

		<fieldset class="field lang">
			<legend class="label">{t('signup.language')}</legend>
			<label
				><input type="radio" name="locale" value="fr" checked={data.locale === 'fr'} /> Français</label
			>
			<label
				><input type="radio" name="locale" value="en" checked={data.locale === 'en'} /> English</label
			>
		</fieldset>

		<button class="btn btn-wide" aria-busy={busy}>{t('signup.submit')}</button>
	</form>

	<p class="small">
		{t('signup.haveAccount')} <a href="/login">{t('common.login')}</a>
	</p>
</AuthFrame>

<style>
	.pin {
		letter-spacing: 0.4em;
		font-size: var(--t-lead);
	}

	.lang {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-5);
	}

	.lang legend {
		font-weight: 700;
		font-size: var(--t-small);
		padding-block-end: var(--s-2);
		width: 100%;
	}

	.lang label {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		min-height: 2.75rem;
	}

	.lang input {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: var(--ember);
	}
</style>
