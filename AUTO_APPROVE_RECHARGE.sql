-- Deposit approval policy: admin review only
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Automatic deposit approval is DISABLED. A fake/incorrect CBE reference must
-- never credit a wallet. This file replaces the old member-owned auto-approval
-- RPC with a stub that always fails, and keeps the admin-only approve/reject
-- RPCs working.

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

-- 1) Deprecated auto-approval stub. Kept only so an old client that still calls
--    it gets a clear error instead of silently completing a deposit. It never
--    updates wallet_ledger or profiles.
create or replace function public.auto_approve_recharge(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $dep$
begin
  raise exception 'Automatic deposit approval is disabled. An admin must approve this deposit.';
end;
$dep$;

-- No browser role may execute the deprecated auto-approval path.
revoke all on function public.auto_approve_recharge(uuid) from public;
revoke all on function public.auto_approve_recharge(uuid) from authenticated;

-- 2) Admin approval. Only an admin can complete a pending recharge and credit
--    the member's wallet.
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

-- 3) Admin rejection.
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
