-- Invitation / referral code validation
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Why this is needed:
--   The registration page is signed out, and RLS only lets a member read their
--   own profile. That made client-side validation impossible, so any code was
--   shown as "Invitation applied" and stored. This adds a security-definer
--   helper that can safely answer "does this code belong to a member?".

reset role;

-- Phone and deposit helpers used by this signup trigger.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $fn$
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
$fn$;

create or replace function public.maximum_deposit_amount()
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select nullif(value, '')::numeric
     from public.platform_settings
     where key = 'maximum_deposit_amount'
     limit 1),
    (select max(price) from public.packages),
    300000
  );
$fn$;

revoke all on function public.normalized_ethiopian_phone(text) from public;
grant execute on function public.normalized_ethiopian_phone(text) to authenticated;
revoke all on function public.maximum_deposit_amount() from public;
grant execute on function public.maximum_deposit_amount() to authenticated;

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
  v_phone text;
begin
  -- Never allow a profile to be created for a direct signup without a valid
  -- Ethiopian phone number.
  v_phone := public.normalized_ethiopian_phone(
    coalesce(new.raw_user_meta_data->>'phone', new.phone)
  );
  if v_phone is null then
    raise exception 'A valid Ethiopian phone number is required to register';
  end if;

  generated_member_id := nullif(
    btrim(coalesce(new.raw_user_meta_data->>'member_id', '')),
    ''
  );
  if generated_member_id is null then
    generated_member_id := 'CAS-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  end if;

  -- A client-supplied code must never collide with an existing member.
  while exists (
    select 1
    from public.profiles p
    where upper(regexp_replace(coalesce(p.member_id, ''), '[^A-Za-z0-9]', '', 'g')) =
          upper(regexp_replace(generated_member_id, '[^A-Za-z0-9]', '', 'g'))
  ) loop
    generated_member_id := 'CAS-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  end loop;

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
    v_phone,
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
