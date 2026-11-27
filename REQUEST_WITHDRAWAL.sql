-- Legacy payout-account helper
-- Run this in the Supabase SQL Editor only if the set_payout_account RPC is
-- missing. Safe to re-run.
--
-- This file used to create an insecure request_withdrawal() that allowed
-- deposited funds to be withdrawn. That function is no longer defined here.
-- WITHDRAWAL_ELIGIBILITY.sql is the single source of truth for withdrawals,
-- so always run it after this file.

reset role;

drop function if exists public.request_withdrawal(numeric, text, text);

alter table public.profiles
  add column if not exists payout_account text;

create or replace function public.set_payout_account(p_account text)
returns text
language plpgsql
security definer
set search_path = public
as $acct$
declare
  v_user_id uuid := auth.uid();
  v_account text := btrim(coalesce(p_account, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_account !~ '^[0-9]{13}$' then
    raise exception 'Enter a valid 13-digit CBE account number';
  end if;

  update public.profiles
  set payout_account = v_account
  where id = v_user_id;

  return v_account;
end;
$acct$;

revoke all on function public.set_payout_account(text) from public;
grant execute on function public.set_payout_account(text) to authenticated;

notify pgrst, 'reload schema';
