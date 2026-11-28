-- Deposit rules: CBE API auto-approval with database-enforced minimum
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- The member flow verifies the reference in a trusted server function with
-- CBE_CHECK_API_KEY, then finalizes through finalize_verified_recharge. This
-- file adds the database guards that were missing before:
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
  add column if not exists approval_source text,
  add column if not exists verified_amount numeric;

-- A bank reference may only back one live recharge. Check for historic
-- duplicates before running this file; if the index cannot be created, clean
-- those rows first:
--   select upper(btrim(transaction_ref)) ref, count(*)
--   from public.wallet_ledger
--   where type in ('recharge', 'deposit')
--     and status in ('pending', 'completed')
--     and btrim(coalesce(transaction_ref, '')) <> ''
--   group by 1 having count(*) > 1;
create unique index if not exists wallet_ledger_recharge_ref_unique
  on public.wallet_ledger (upper(btrim(transaction_ref)))
  where type in ('recharge', 'deposit')
    and status in ('pending', 'completed')
    and transaction_ref is not null
    and btrim(transaction_ref) <> '';

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

-- Hard cap: no deposit may exceed the highest package price. This blocks fake
-- million-birr auto-credits even if the bank verifier is compromised.
create or replace function public.maximum_deposit_amount()
returns numeric
language sql
stable
security definer
set search_path = public
as $dep$
  select coalesce(
    (select nullif(value, '')::numeric
     from public.platform_settings
     where key = 'maximum_deposit_amount'
     limit 1),
    (select max(price) from public.packages),
    300000
  );
$dep$;

revoke all on function public.maximum_deposit_amount() from public;
grant execute on function public.maximum_deposit_amount() to authenticated;

-- 2) Members may only create pending recharge rows within the published range.
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
  and amount <= public.maximum_deposit_amount()
  and amount = floor(amount)
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

  if new.type = 'recharge' and new.amount > public.maximum_deposit_amount() then
    raise exception 'Maximum deposit is ETB %', public.maximum_deposit_amount();
  end if;

  if new.type = 'recharge' and new.amount <> floor(new.amount) then
    raise exception 'Deposit amount must be a whole ETB amount';
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

-- One pending recharge per member. Attackers previously spammed rows before
-- approval; this stops duplicate queues without failing on old duplicate rows.
create or replace function public.enforce_single_pending_recharge()
returns trigger
language plpgsql
security definer
set search_path = public
as $dep$
begin
  if new.type = 'recharge' and new.status = 'pending' and exists (
    select 1
    from public.wallet_ledger l
    where l.user_id = new.user_id
      and l.type = 'recharge'
      and l.status = 'pending'
      and l.id <> new.id
  ) then
    raise exception 'Another recharge is already awaiting review';
  end if;
  return new;
end;
$dep$;

drop trigger if exists wallet_ledger_single_pending_recharge on public.wallet_ledger;
create trigger wallet_ledger_single_pending_recharge
before insert or update of status, user_id, type
on public.wallet_ledger
for each row execute function public.enforce_single_pending_recharge();

-- 4) API auto-approval. Only the server verifier (service role) can call it,
--    and only for a pending recharge with a reference, within the published
--    amount range, and only once per reference. The server verifies the
--    reference with the CBE API before calling this RPC.
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
  v_caller_role text;
begin
  -- Only the server-side verifier (service role) may call this RPC. Neither a
  -- member nor an admin should be able to approve a row directly; admins use
  -- approve_recharge() for manual review.
  v_caller_role := coalesce(auth.jwt() ->> 'role', '');
  if v_caller_role <> 'service_role' then
    raise exception 'Server-side payment verification is required';
  end if;

  v_min := public.minimum_deposit_amount();

  for v_user_id, v_amount, v_ref in
    select user_id, amount, transaction_ref
    from public.wallet_ledger
    where id = p_ledger_id
      and type = 'recharge'
      and status = 'pending'
      and amount >= v_min
      and amount <= public.maximum_deposit_amount()
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
revoke all on function public.auto_approve_recharge(uuid) from anon;
revoke all on function public.auto_approve_recharge(uuid) from authenticated;
grant execute on function public.auto_approve_recharge(uuid) to service_role;

-- 4b) Trusted finalizer used by the server verifier. The amount and reference
--     come from the CBE-verified server call, not from a browser-controlled
--     wallet row. The row must match both values exactly before any credit.
create or replace function public.finalize_verified_recharge(
  p_ledger_id uuid,
  p_verified_amount numeric,
  p_verified_ref text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $dep$
declare
  v_user_id uuid;
  v_ref text := upper(btrim(coalesce(p_verified_ref, '')));
  v_member_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Server-side payment verification is required';
  end if;

  if p_verified_amount is null
     or p_verified_amount <> floor(p_verified_amount)
     or p_verified_amount < public.minimum_deposit_amount()
     or p_verified_amount > public.maximum_deposit_amount()
  then
    raise exception 'Verified amount is outside the published deposit range';
  end if;

  if v_ref = '' then
    raise exception 'A verified transaction reference is required';
  end if;

  for v_user_id in
    select l.user_id
    from public.wallet_ledger l
    where l.id = p_ledger_id
      and l.type = 'recharge'
      and l.status = 'pending'
      and l.amount = p_verified_amount
      and upper(btrim(coalesce(l.transaction_ref, ''))) = v_ref
      and public.has_valid_deposit_phone(l.user_id)
    for update
  loop
    if exists (
      select 1
      from public.wallet_ledger l
      where l.id <> p_ledger_id
        and l.type in ('recharge', 'deposit')
        and l.status in ('pending', 'completed')
        and upper(btrim(coalesce(l.transaction_ref, ''))) = v_ref
    ) then
      raise exception 'This transaction reference was already used';
    end if;

    update public.wallet_ledger
    set status = 'completed',
        approval_source = 'api',
        verified_amount = p_verified_amount
    where id = p_ledger_id;

    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + p_verified_amount
    where id = v_user_id
    returning member_id into v_member_id;

    if to_regclass('public.admin_audit_logs') is not null then
      insert into public.admin_audit_logs (
        admin_id, admin_email, action, target_type, target_id, member_id, metadata
      ) values (
        null,
        'cbe-verifier',
        'deposit.auto_approved',
        'wallet_ledger',
        p_ledger_id::text,
        v_member_id,
        jsonb_build_object(
          'amount', p_verified_amount,
          'transaction_ref', v_ref
        )
      );
    end if;

    return p_verified_amount;
  end loop;

  raise exception 'Verified recharge not found or amount/reference mismatch';
end;
$dep$;

revoke all on function public.finalize_verified_recharge(uuid, numeric, text) from public;
revoke all on function public.finalize_verified_recharge(uuid, numeric, text) from anon;
revoke all on function public.finalize_verified_recharge(uuid, numeric, text) from authenticated;
grant execute on function public.finalize_verified_recharge(uuid, numeric, text) to service_role;

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
  v_ref text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  for v_user_id, v_amount, v_ref in
    select user_id, amount, transaction_ref
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

    if v_amount > public.maximum_deposit_amount() then
      raise exception 'Deposit above the ETB % maximum cannot be approved', public.maximum_deposit_amount();
    end if;

    if v_amount <> floor(v_amount) then
      raise exception 'Deposit amount must be a whole ETB amount';
    end if;

    if v_user_id = auth.uid() then
      raise exception 'An admin cannot approve their own recharge';
    end if;

    if coalesce(btrim(coalesce(v_ref, '')), '') <> '' and exists (
      select 1
      from public.wallet_ledger l
      where l.id <> p_ledger_id
        and l.status in ('pending', 'completed')
        and upper(btrim(coalesce(l.transaction_ref, ''))) = upper(btrim(v_ref))
    ) then
      raise exception 'This transaction reference was already used';
    end if;

    update public.wallet_ledger
    set status = 'completed',
        approval_source = 'admin'
    where id = p_ledger_id;

    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + v_amount
    where id = v_user_id;

    begin
      perform public.log_admin_action(
        'deposit.approved',
        'wallet_ledger',
        p_ledger_id::text,
        null,
        jsonb_build_object('amount', v_amount, 'user_id', v_user_id)
      );
    exception when others then
      raise warning 'Deposit approved but audit log could not be written: %', sqlerrm;
    end;

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
