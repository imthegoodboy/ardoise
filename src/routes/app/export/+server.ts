import { isoDay, clockTime } from '#lib/dates.ts';
import { listAllCustomers } from '#lib/server/customers.ts';
import { exportEntries } from '#lib/server/entries.ts';
import type { RequestHandler } from './$types';

/** Spreadsheet apps run cells that start with these as formulas: neutralise them. */
function cell(value: string | number): string {
	let text = String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
	return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole book as CSV: the shop's data is the shop's, and leaving must be easy. */
export const GET: RequestHandler = async ({ locals }) => {
	const shop = locals.shop!;
	const [customers, entries] = await Promise.all([
		listAllCustomers(shop.id),
		exportEntries(shop.id)
	]);
	const names = new Map(customers.map((customer) => [customer.id, customer.name]));

	const rows = [['date', 'time_utc', 'customer', 'kind', 'label', 'amount_xof', 'crossed_out']];
	for (const entry of entries) {
		rows.push([
			isoDay(entry.occurredAt),
			clockTime(entry.occurredAt),
			names.get(entry.customerId) ?? '',
			entry.kind,
			entry.label,
			String(entry.amountXof),
			entry.voided ? 'yes' : 'no'
		]);
	}
	const csv = '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
	const name = `ardoise-${isoDay(new Date())}.csv`;
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${name}"`
		}
	});
};
