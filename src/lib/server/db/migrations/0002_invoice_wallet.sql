-- Bind every invoice to the wallet connection that issued it, so a payment to
-- an old wallet is still found after the shop connects a new one. The sealed
-- connection is dropped from the invoice once it can no longer be paid.
alter table invoices add column wallet_ref text not null default '';
alter table invoices add column wallet_secret text;

-- At most one live invoice per tab, amount and wallet: a double tap on "pay",
-- on two servers at once, cannot mint two invoices.
create unique index invoices_one_pending_idx
	on invoices (customer_id, amount_xof, wallet_ref)
	where status = 'pending';
