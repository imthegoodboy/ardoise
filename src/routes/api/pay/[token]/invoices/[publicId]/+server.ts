import { loadPayerInvoice } from '#lib/server/paypage.ts';
import { clientKey, hit } from '#lib/server/ratelimit.ts';
import type { RequestHandler } from './$types';

const POLL_LIMIT = { max: 90, windowSeconds: 60 };

/** Polled by the invoice page every few seconds while the payer's wallet does its work. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const limit = await hit(clientKey('poll', locals.client), POLL_LIMIT);
	if (!limit.allowed) {
		return Response.json(
			{ error: 'slow_down' },
			{ status: 429, headers: { 'retry-after': String(limit.retryAfter) } }
		);
	}
	const { invoice, balanceXof } = await loadPayerInvoice(params.token, params.publicId);
	return Response.json({
		status: invoice.status,
		paidAt: invoice.paidAt?.toISOString() ?? null,
		balanceXof
	});
};
