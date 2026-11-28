-- Canonical security hardening for the CAS Supabase database
-- Run this in the Supabase SQL Editor AFTER all feature SQL files. Safe to re-run.
--
-- This file closes the structural gaps that allowed the fake-deposit attack:
--   1. enables RLS on the four money/profile tables,
--   2. removes direct UPDATE/DELETE grants for browser roles,
--   3. gives admins read-only access to profiles/ledger/purchases,
--   4. makes member IDs unique after normalization,
--   5. prints verification queries so the live policies can be inspected.
--
-- Recommended run order for a fresh/repaired database:
--   1. CREATE_IS_ADMIN.sql
--   2. FINANCIAL_RULES.sql
--   3. PHONE_GUARD.sql
--   4. SUPABASE_AUTH_SETUP.sql
--   5. VALIDATE_REFERRAL_CODE.sql
--   6. AUTO_APPROVE_RECHARGE.sql
--   7. GIFT_CODES.sql
--   8. ENABLE_AUDIT_LOGGING.sql
--   9. remaining feature files (TEAM_COMMISSION, LUCKY_WHEEL, etc.)
--  10. SECURITY_HARDENING.sql
--
-- Server-side auto-approval also requires SUPABASE_SERVICE_ROLE_KEY in Vercel.
-- Never put that key in a VITE_ variable or in the repository.

reset role;

-- 1) RLS must be on for every table that holds identity or money.
alter table public.profiles enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.purchases enable row level security;
alter table public.packages enable row level security;

-- 2) Browser roles must never mutate money or identity directly. All writes go
--    through security-definer RPCs that stamp auth.uid() server-side.
revoke update, delete on public.profiles from anon, authenticated;
revoke update, delete on public.wallet_ledger from anon, authenticated;
revoke update, delete on public.purchases from anon, authenticated;
revoke update, delete on public.packages from anon, authenticated;

-- 3) Nobody may create a profile from the browser. The auth trigger and admin
--    scripts create profiles as the table owner, so no client insert is needed.
revoke insert on public.profiles from anon, authenticated;
drop policy if exists "Users insert own profile" on public.profiles;

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (coalesce(lower(role), 'user') in ('user', 'admin'));

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $security$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_admin()
  then
    raise exception 'Role changes require admin access';
  end if;
  return new;
end;
$security$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
before update of role on public.profiles
for each row execute function public.guard_profile_role();

-- Reads needed by the admin console and package catalogue.
drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins read all ledger" on public.wallet_ledger;
create policy "Admins read all ledger"
  on public.wallet_ledger
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Users read own purchases" on public.purchases;
create policy "Users read own purchases"
  on public.purchases
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins read all purchases" on public.purchases;
create policy "Admins read all purchases"
  on public.purchases
  for select
  to authenticated
  using (public.is_admin());

-- Packages are public catalogue data; no writes from browser roles.
drop policy if exists "Packages are public" on public.packages;
create policy "Packages are public"
  on public.packages
  for select
  to anon, authenticated
  using (true);

-- 4) One member ID per person. If this fails, run the preflight query below
--    and merge/remove duplicate member_id values before re-running.
do $security$
begin
  if exists (
    select 1
    from public.profiles
    where member_id is not null
    group by upper(regexp_replace(member_id, '[^A-Za-z0-9]', '', 'g'))
    having count(*) > 1
  ) then
    raise exception
      'Duplicate member_id values exist. Run the preflight query in SECURITY_HARDENING.sql and fix them first.';
  end if;
end
$security$;

create unique index if not exists profiles_normalized_member_id_unique
  on public.profiles (
    upper(regexp_replace(coalesce(member_id, ''), '[^A-Za-z0-9]', '', 'g'))
  )
  where member_id is not null;

notify pgrst, 'reload schema';

-- Verification 1: all four tables must show relrowsecurity = true.
-- select relname, relrowsecurity
-- from pg_class
-- where oid in (
--   'public.profiles'::regclass,
--   'public.wallet_ledger'::regclass,
--   'public.purchases'::regclass,
--   'public.packages'::regclass
-- )
-- order by relname;

-- Verification 2: no UPDATE or DELETE policy should exist for these tables.
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('profiles', 'wallet_ledger', 'purchases', 'packages')
--   and cmd in ('UPDATE', 'DELETE')
-- order by tablename, cmd;

-- Preflight for duplicate member IDs:
-- select upper(regexp_replace(member_id, '[^A-Za-z0-9]', '', 'g')) normalized_id,
--        count(*), array_agg(id) user_ids
-- from public.profiles
-- where member_id is not null
-- group by 1
-- having count(*) > 1;
