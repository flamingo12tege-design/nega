-- Deposit rules: admin approval only, minimum enforced by the database
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes: a 700 birre recharge being created/approved even though the published
-- minimum deposit is ETB 1,300. The page check is not enough on its own:
-- PostgREST clients can insert directly and the old member-owned approval RPC
-- could complete any pending row with a reference. This file:
--   1. exposes the minimum from platform_settings,
--   2. blocks sub-minimum recharge inserts with RLS,
--   3. blocks sub-minimum recharge inserts/updates with a trigger,
--   4. disables automatic approval entirely,
--   5. keeps admin-only approve/reject working, with a minimum check.

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

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

-- 3) Backstop for service-role/admin inserts and amount edits: no recharge row
--    may be created or changed below the minimum.
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

-- 4) Deprecated auto-approval stub. Kept only so an old client that still calls
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
