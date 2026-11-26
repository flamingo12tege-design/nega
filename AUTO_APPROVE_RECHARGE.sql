-- Auto-approve verified recharges
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes: auto deposit saying "Payment verified, awaiting admin approval".
-- The member flow was calling the ADMIN-ONLY approve_recharge RPC, so it could
-- never auto-approve. This adds an owner-only RPC for CBE-verified deposits
-- and also repairs the admin recharge RPCs (they contained a stray VALUES
-- statement that made them fail).

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

-- 1) Member-owned auto approval. Only the row owner can call it, and only for
--    a pending recharge that has a transaction reference (i.e. was verified
--    by the CBE Check API before the row was created).
create or replace function public.auto_approve_recharge(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $dep$
declare
  v_amount numeric;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  for v_user_id, v_amount in
    select user_id, amount
    from public.wallet_ledger
    where id = p_ledger_id
      and type = 'recharge'
      and status = 'pending'
      and transaction_ref is not null
      and btrim(transaction_ref) <> ''
    for update
  loop
    update public.wallet_ledger
    set status = 'completed'
    where id = p_ledger_id;

    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + v_amount
    where id = v_user_id;

    return v_amount;
  end loop;

  raise exception 'Recharge already processed or not found';
end;
$dep$;

revoke all on function public.auto_approve_recharge(uuid) from public;
grant execute on function public.auto_approve_recharge(uuid) to authenticated;

-- 2) Fix admin approval (removed the invalid bare VALUES statement).
create or replace function public.approve_recharge(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $dep$
declare
  v_amount numeric;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  for v_user_id, v_amount in
    select user_id, amount
    from public.wallet_ledger
    where id = p_ledger_id
      and type = 'recharge'
      and status = 'pending'
    for update
  loop
    update public.wallet_ledger
    set status = 'completed'
    where id = p_ledger_id;

    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + v_amount
    where id = v_user_id;

    return v_amount;
  end loop;

  raise exception 'Recharge already processed or not found';
end;
$dep$;

-- 3) Fix admin rejection.
create or replace function public.reject_recharge(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $dep$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.wallet_ledger
  set status = 'rejected'
  where id = p_ledger_id
    and type = 'recharge'
    and status = 'pending';

  if not found then
    raise exception 'Recharge already processed or not found';
  end if;
end;
$dep$;

revoke all on function public.approve_recharge(uuid) from public;
revoke all on function public.reject_recharge(uuid) from public;
grant execute on function public.approve_recharge(uuid) to authenticated;
grant execute on function public.reject_recharge(uuid) to authenticated;

notify pgrst, 'reload schema';
