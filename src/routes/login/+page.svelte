<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import AuthFrame from '#lib/components/AuthFrame.svelte';
	import { makeT } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(makeT(data.locale));
	let busy = $state(false);
	const PIN_PATTERN = '[0-9]{6}';

	// A new sign-in on this phone starts from a clean offline book.
	onMount(() => navigator.serviceWorker?.controller?.postMessage('purge'));
</script>

<svelte:head>
	<title>{t('login.title')} · Ardoise</title>
</svelte:head>

<AuthFrame title={t('login.title')}>
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
			<p class="note note-error" role="alert">
				{form.error === 'locked'
					? t('error.locked', { minutes: form.minutes })
					: t('error.invalid_login')}
			</p>
		{/if}

		<div class="field">
			<label for="phone">{t('login.phone')}</label>
			<input
				id="phone"
				name="phone"
				class="input"
				type="tel"
				required
				autocomplete="username"
				inputmode="tel"
				enterkeyhint="next"
				placeholder="77 123 45 67"
				value={form?.phone ?? ''}
			/>
		</div>

		<div class="field">
			<label for="pin">{t('login.pin')}</label>
			<input
				id="pin"
				name="pin"
				class="input pin"
				type="password"
				required
				inputmode="numeric"
				autocomplete="current-password"
				enterkeyhint="go"
				pattern={PIN_PATTERN}
				maxlength="6"
			/>
		</div>

		<button class="btn btn-wide" aria-busy={busy}>{t('login.submit')}</button>
	</form>

	<p class="small">
		{t('login.noAccount')} <a href="/signup">{t('login.create')}</a>
	</p>
</AuthFrame>

<style>
	.pin {
		letter-spacing: 0.4em;
		font-size: var(--t-lead);
	}
</style>
