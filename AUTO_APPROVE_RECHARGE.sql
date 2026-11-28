-- Deposit rules: CBE API auto-approval with database-enforced minimum
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- The member flow verifies the reference server-side with CBE_CHECK_API_KEY,
-- then calls auto_approve_recharge. This file allows that path again, but adds
-- guards that were missing before:
--   1. minimum deposit read from platform_settings (default ETB 1,300),
--   2. no sub-minimum recharge insert/update (RLS + trigger),
--   3. no approval of a sub-minimum or duplicate-reference row,
--   4. approval_source recorded so admin history can say "API approved" vs
--      "Admin approved" without guessing from old rows.

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

alter table public.wallet_ledger
  add column if not exists approval_source text;

-- 1) Single source of truth for the minimum, editable in platform_settings.
create or replace function public.minimum_deposit_amount()
returns numeric
language sql
stable
security definer
set search_path = public
as $dep$
  select coalesce(
    (select nullif(value, '')::numeric
     from public.platform_settings
     where key = 'minimum_deposit_amount'
     limit 1),
    1300
  );
$dep$;

revoke all on function public.minimum_deposit_amount() from public;
grant execute on function public.minimum_deposit_amount() to authenticated;

-- 2) Members may only create pending recharge rows at or above the minimum.
drop policy if exists "Users create recharge requests" on public.wallet_ledger;
create policy "Users create recharge requests"
on public.wallet_ledger
for insert
to authenticated
with check (
  user_id = auth.uid()
  and type = 'recharge'
  and status = 'pending'
  and amount >= public.minimum_deposit_amount()
);

-- 3) Backstop for service-role/admin inserts and amount edits.
create or replace function public.enforce_minimum_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $dep$
begin
  if new.type = 'recharge' and new.amount < public.minimum_deposit_amount() then
    raise exception 'Minimum deposit is ETB %', public.minimum_deposit_amount();
  end if;
  return new;
end;
$dep$;

revoke all on function public.enforce_minimum_deposit() from public;

drop trigger if exists wallet_ledger_minimum_deposit on public.wallet_ledger;
create trigger wallet_ledger_minimum_deposit
before insert or update of amount, type
on public.wallet_ledger
for each row execute function public.enforce_minimum_deposit();

-- 4) API auto-approval. Only the row owner can call it, only for a pending
--    recharge with a reference and at or above the minimum, and only once per
--    reference. The server verifies the reference with the CBE API before
--    calling this RPC.
create or replace function public.auto_approve_recharge(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $dep$
declare
  v_amount numeric;
  v_user_id uuid;
  v_ref text;
  v_min numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_min := public.minimum_deposit_amount();

  for v_user_id, v_amount, v_ref in
    select user_id, amount, transaction_ref
    from public.wallet_ledger
    where id = p_ledger_id
      and user_id = auth.uid()
      and type = 'recharge'
      and status = 'pending'
      and amount >= v_min
      and transaction_ref is not null
      and btrim(transaction_ref) <> ''
    for update
  loop
    if exists (
      select 1
      from public.wallet_ledger l
      where l.type = 'recharge'
        and l.id <> p_ledger_id
        and lower(coalesce(l.status, '')) <> 'rejected'
        and upper(coalesce(l.transaction_ref, '')) = upper(v_ref)
    ) then
      raise exception 'This transaction reference was already used';
    end if;

    update public.wallet_ledger
    set status = 'completed',
        approval_source = 'api'
    where id = p_ledger_id;

    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + v_amount
    where id = v_user_id;

    return v_amount;
  end loop;

  raise exception 'Recharge already processed, below the ETB % minimum, or missing a reference', v_min;
end;
$dep$;

revoke all on function public.auto_approve_recharge(uuid) from public;
grant execute on function public.auto_approve_recharge(uuid) to authenticated;

-- 5) Admin approval. Only an admin can complete a pending recharge and credit
--    the member's wallet, and only if it meets the published minimum.
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
    if v_amount < public.minimum_deposit_amount() then
      raise exception 'Deposit below the ETB % minimum cannot be approved', public.minimum_deposit_amount();
    end if;

    update public.wallet_ledger
    set status = 'completed',
        approval_source = 'admin'
    where id = p_ledger_id;

    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + v_amount
    where id = v_user_id;

    return v_amount;
  end loop;

  raise exception 'Recharge already processed or not found';
end;
$dep$;

-- 6) Admin rejection.
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
