-- Reuse a pending invoice only for the person who asked for it. Two relatives
-- paying the same tab at the same moment each get their own invoice, and
-- neither one's name or "paid" screen is the other's.
alter table invoices add column requester text not null default '';

drop index if exists invoices_one_pending_idx;
create unique index invoices_one_pending_idx
	on invoices (customer_id, amount_xof, wallet_ref, requester)
	where status = 'pending';
