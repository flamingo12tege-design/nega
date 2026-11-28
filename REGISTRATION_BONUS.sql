-- Registration welcome bonus
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Credits the ETB 50 welcome bonus to a newly registered member exactly
-- once. The amount is editable in public.platform_settings. The app calls this
-- right after registration, before it shows the "Welcome to CAS" popup, so the
-- bonus is really in the member's wallet.

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

-- Phone gate helpers. Also defined in PHONE_GUARD.sql so this file can be run
-- on its own and still reject phone-less bot signups.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $bonus$
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
$bonus$;

create or replace function public.has_valid_deposit_phone(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $bonus$
  select coalesce((
    select public.normalized_ethiopian_phone(p.phone) is not null
    from public.profiles p
    where p.id = p_user_id
  ), false);
$bonus$;

-- Editable rules (same table used by TEAM_COMMISSION.sql).
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value)
values ('registration_bonus_amount', '50')
-- Seed only: do not reset an admin-edited bonus on re-run.
on conflict (key) do nothing;

alter table public.profiles
  add column if not exists registration_bonus_claimed boolean not null default false;

create or replace function public.claim_registration_bonus()
returns numeric
language plpgsql
security definer
set search_path = public
as $bonus$
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

  -- Lock the profile so a double tap cannot credit the bonus twice.
  v_claimed := (
    select registration_bonus_claimed
    from public.profiles
    where id = v_user_id
    for update
  );

  if v_claimed is null then
    return 0;
  end if;

  if v_claimed then
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
$bonus$;

revoke all on function public.claim_registration_bonus() from public;
grant execute on function public.claim_registration_bonus() to authenticated;

notify pgrst, 'reload schema';
