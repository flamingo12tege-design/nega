-- Deposit rules: CBE API auto-approval with database-enforced minimum
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- The member flow verifies the reference server-side with CBE_CHECK_API_KEY,
-- then calls auto_approve_recharge. This file allows that path again, but adds
-- guards that were missing before:
--   1. minimum deposit read from platform_settings (default ETB 1,300),
--   2. no sub-minimum recharge insert/update (RLS + trigger),
--   3. no approval of a sub-minimum or duplicate-reference row,
--   4. no deposit from an account without a valid stored phone number,
--   5. approval_source recorded so admin history can say "API approved" vs
--      "Admin approved" without guessing from old rows.

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

alter table public.wallet_ledger
  add column if not exists approval_source text;

-- Phone gate helpers. Also defined in PHONE_GUARD.sql so either file can be run
-- on its own; re-running either one keeps them in sync.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $dep$
declare
  v_phone text := regexp_replace(btrim(coalesce(p_phone, '')), '[^0-9+]', '', 'g');
begin
  if v_phone ~ '^\+251[79][0-9]{8}$' then
    return v_phone;
  elsif v_phone ~ '^251[79][0-9]{8}$' then
    return '+' || v_phone;
  elsif v_phone ~ '^0[79][0-9]{8}$' then
    return '+251' || substring(v_phone from 2);
  end if;
  return null;
end;
$dep$;

revoke all on function public.normalized_ethiopian_phone(text) from public;
grant execute on function public.normalized_ethiopian_phone(text) to authenticated;

create or replace function public.has_valid_deposit_phone(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $dep$
  select coalesce((
    select public.normalized_ethiopian_phone(p.phone) is not null
    from public.profiles p
    where p.id = p_user_id
  ), false);
$dep$;

revoke all on function public.has_valid_deposit_phone(uuid) from public;
grant execute on function public.has_valid_deposit_phone(uuid) to authenticated;

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
  and public.has_valid_deposit_phone(auth.uid())
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

  if new.type in ('recharge', 'deposit')
     and new.status in ('pending', 'completed')
     and not public.has_valid_deposit_phone(new.user_id) then
    raise exception 'A valid phone number is required before a deposit can be submitted or approved';
  end if;

  return new;
end;
$dep$;

revoke all on function public.enforce_minimum_deposit() from public;

drop trigger if exists wallet_ledger_minimum_deposit on public.wallet_ledger;
create trigger wallet_ledger_minimum_deposit
before insert or update of amount, type, status, user_id
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
      and public.has_valid_deposit_phone(user_id)
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
      and public.has_valid_deposit_phone(user_id)
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
