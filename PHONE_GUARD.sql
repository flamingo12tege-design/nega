-- Phone-number security gate for deposits
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Attack being closed: an authenticated account with no phone number in
-- public.profiles can still submit a recharge row and have it approved.
-- The browser check alone is not enough because a client can call PostgREST
-- or the approval RPC directly. This file makes the database reject it.
--
-- It adds:
--   1. normalized Ethiopian phone helpers (+251XXXXXXXXX),
--   2. one-phone-per-member protection on public.profiles,
--   3. a recharge INSERT policy that requires a valid phone,
--   4. a wallet trigger that blocks pending/completed deposits without a phone,
--   5. a registration-bonus guard so phone-less signups cannot claim ETB 50.
--
-- Existing pending phone-less deposits are not silently approved. Reject them
-- from the admin console after this file has been run. Existing completed rows
-- are left untouched; use this query to inspect them:
--
--   select l.id, l.user_id, p.member_id, p.phone, l.amount, l.status,
--          l.transaction_ref, l.created_at
--   from public.wallet_ledger l
--   left join public.profiles p on p.id = l.user_id
--   where l.type in ('recharge', 'deposit')
--     and public.normalized_ethiopian_phone(p.phone) is null
--   order by l.created_at desc;

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

-- 1) Normalize local, 251 and +251 Ethiopian numbers to +251XXXXXXXXX.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $phone$
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
$phone$;

revoke all on function public.normalized_ethiopian_phone(text) from public;
grant execute on function public.normalized_ethiopian_phone(text) to authenticated;

-- Returns true only when the account has a valid, stored Ethiopian phone.
create or replace function public.has_valid_deposit_phone(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $phone$
  select coalesce((
    select public.normalized_ethiopian_phone(p.phone) is not null
    from public.profiles p
    where p.id = p_user_id
  ), false);
$phone$;

revoke all on function public.has_valid_deposit_phone(uuid) from public;
grant execute on function public.has_valid_deposit_phone(uuid) to authenticated;

-- Keep the published minimum available when this file is run on its own.
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value)
values ('minimum_deposit_amount', '1300')
on conflict (key) do nothing;

create or replace function public.minimum_deposit_amount()
returns numeric
language sql
stable
security definer
set search_path = public
as $phone$
  select coalesce(
    (select nullif(value, '')::numeric
     from public.platform_settings
     where key = 'minimum_deposit_amount'
     limit 1),
    1300
  );
$phone$;

revoke all on function public.minimum_deposit_amount() from public;
grant execute on function public.minimum_deposit_amount() to authenticated;

-- 2) A phone number can belong to only one member. Null/admin accounts are
--    unaffected because the trigger only checks non-null, valid numbers.
create or replace function public.enforce_unique_member_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $phone$
declare
  v_phone text := public.normalized_ethiopian_phone(new.phone);
begin
  if v_phone is not null and exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and public.normalized_ethiopian_phone(p.phone) = v_phone
  ) then
    raise exception 'This phone number is already registered to another member';
  end if;
  return new;
end;
$phone$;

drop trigger if exists profiles_unique_phone on public.profiles;
create trigger profiles_unique_phone
before insert or update of phone
on public.profiles
for each row execute function public.enforce_unique_member_phone();

-- 3) Members may only create pending recharges with a valid phone. This is the
--    authoritative check; do not rely on the payment page alone.
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

-- 4) Backstop for service-role inserts and every approval path. A recharge or
--    deposit without a phone can never be pending or completed. Rejection is
--    always allowed so bad rows can still be cleaned up.
create or replace function public.enforce_deposit_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $phone$
begin
  if new.type in ('recharge', 'deposit')
     and new.status in ('pending', 'completed')
     and not public.has_valid_deposit_phone(new.user_id) then
    raise exception 'A valid phone number is required before a deposit can be submitted or approved';
  end if;
  return new;
end;
$phone$;

drop trigger if exists wallet_ledger_deposit_phone on public.wallet_ledger;
create trigger wallet_ledger_deposit_phone
before insert or update of status, type, user_id
on public.wallet_ledger
for each row execute function public.enforce_deposit_phone();

-- 5) Phone-less bot signups cannot claim the ETB 50 welcome bonus either.
insert into public.platform_settings (key, value)
values ('registration_bonus_amount', '50')
on conflict (key) do nothing;

alter table public.profiles
  add column if not exists registration_bonus_claimed boolean not null default false;

create or replace function public.claim_registration_bonus()
returns numeric
language plpgsql
security definer
set search_path = public
as $phone$
declare
  v_user_id uuid := auth.uid();
  v_amount numeric := coalesce((
    select nullif(value, '')::numeric
    from public.platform_settings
    where key = 'registration_bonus_amount'
  ), 50);
  v_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_valid_deposit_phone(v_user_id) then
    raise exception 'A valid phone number is required before claiming the welcome bonus';
  end if;

  v_claimed := (
    select registration_bonus_claimed
    from public.profiles
    where id = v_user_id
    for update
  );

  if v_claimed is null or v_claimed then
    return 0;
  end if;

  insert into public.wallet_ledger (
    user_id, amount, type, status, description
  ) values (
    v_user_id, v_amount, 'registration_bonus', 'completed', 'Welcome bonus'
  );

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_amount,
      registration_bonus_claimed = true
  where id = v_user_id;

  return v_amount;
end;
$phone$;

revoke all on function public.claim_registration_bonus() from public;
grant execute on function public.claim_registration_bonus() to authenticated;

notify pgrst, 'reload schema';
