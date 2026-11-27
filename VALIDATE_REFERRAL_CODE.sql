-- Invitation / referral code validation
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Why this is needed:
--   The registration page is signed out, and RLS only lets a member read their
--   own profile. That made client-side validation impossible, so any code was
--   shown as "Invitation applied" and stored. This adds a security-definer
--   helper that can safely answer "does this code belong to a member?".

reset role;

-- 1) Public (anon-callable) existence check. It only returns true/false and
--    never exposes profile data.
create or replace function public.referral_code_exists(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  with normalized as (
    select upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g')) as code
  )
  select case
    when (select code from normalized) = '' then false
    else exists (
      select 1
      from public.profiles p
      cross join normalized n
      where upper(regexp_replace(coalesce(p.member_id, ''), '[^a-zA-Z0-9]', '', 'g')) = n.code
    )
  end;
$fn$;

revoke all on function public.referral_code_exists(text) from public;
grant execute on function public.referral_code_exists(text) to anon, authenticated;

-- 2) Defence in depth: the signup trigger only stores a referral code that
--    belongs to an existing member, even if a client sends something else.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  generated_member_id text;
  raw_referral text;
  safe_referral text;
begin
  generated_member_id := coalesce(
    new.raw_user_meta_data->>'member_id',
    'CAS-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0')
  );

  raw_referral := nullif(
    upper(regexp_replace(coalesce(new.raw_user_meta_data->>'referral_code', ''), '[^a-zA-Z0-9]', '', 'g')),
    ''
  );

  if raw_referral is not null and exists (
    select 1
    from public.profiles p
    where upper(regexp_replace(coalesce(p.member_id, ''), '[^a-zA-Z0-9]', '', 'g')) = raw_referral
  ) then
    safe_referral := raw_referral;
  else
    safe_referral := null;
  end if;

  insert into public.profiles (
    id,
    member_id,
    phone,
    role,
    wallet_balance,
    referral_code
  )
  values (
    new.id,
    generated_member_id,
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    'user',
    0,
    safe_referral
  )
  on conflict (id) do update set
    member_id = excluded.member_id,
    phone = coalesce(excluded.phone, public.profiles.phone),
    referral_code = coalesce(public.profiles.referral_code, excluded.referral_code);

  return new;
end;
$fn$;

-- 3) Clean up referral codes that were stored before validation existed.
update public.profiles p
set referral_code = null
where coalesce(btrim(p.referral_code), '') <> ''
  and not exists (
    select 1
    from public.profiles owner
    where upper(regexp_replace(coalesce(owner.member_id, ''), '[^a-zA-Z0-9]', '', 'g'))
        = upper(regexp_replace(coalesce(p.referral_code, ''), '[^a-zA-Z0-9]', '', 'g'))
  );

notify pgrst, 'reload schema';
