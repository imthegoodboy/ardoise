<script lang="ts">
	import { page } from '$app/state';
	import { makeT } from '#lib/i18n/index.ts';

	let {
		name = '',
		phone = '',
		limit = ''
	}: { name?: string; phone?: string; limit?: string } = $props();

	const t = $derived(makeT(page.data.locale));
</script>

<div class="field">
	<label for="c-name">{t('customer.name')}</label>
	<input
		id="c-name"
		name="name"
		class="input"
		required
		maxlength="60"
		autocomplete="off"
		autocapitalize="words"
		placeholder={t('customer.namePlaceholder')}
		value={name}
	/>
</div>

<div class="field">
	<label for="c-phone"
		>{t('customer.phone')} <span class="muted">({t('common.optional')})</span></label
	>
	<input
		id="c-phone"
		name="phone"
		class="input"
		type="tel"
		inputmode="tel"
		autocomplete="off"
		placeholder="77 123 45 67"
		aria-describedby="c-phone-hint"
		value={phone}
	/>
	<span class="hint" id="c-phone-hint">{t('customer.phoneHint')}</span>
</div>

<div class="field">
	<label for="c-limit"
		>{t('customer.limit')} <span class="muted">({t('common.optional')})</span></label
	>
	<div class="amount-wrap">
		<input
			id="c-limit"
			name="limit"
			class="input"
			inputmode="numeric"
			autocomplete="off"
			placeholder="20 000"
			aria-describedby="c-limit-hint"
			value={limit}
		/>
		<span class="unit">F</span>
	</div>
	<span class="hint" id="c-limit-hint">{t('customer.limitHint')}</span>
</div>
