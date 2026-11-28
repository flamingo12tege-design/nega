-- Gift code redemption system
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Admins generate gift codes with an amount and max redemptions.
-- Users redeem codes from the Gifts page; each user can redeem a code once.

reset role;

-- Keep the phone gate usable even when this file is run on its own.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $gift$
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
$gift$;

create or replace function public.has_valid_deposit_phone(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $gift$
  select coalesce((
    select public.normalized_ethiopian_phone(p.phone) is not null
    from public.profiles p
    where p.id = p_user_id
  ), false);
$gift$;

create or replace function public.maximum_deposit_amount()
returns numeric
language sql
stable
security definer
set search_path = public
as $gift$
  select coalesce(
    (select nullif(value, '')::numeric
     from public.platform_settings
     where key = 'maximum_deposit_amount'
     limit 1),
    (select max(price) from public.packages),
    300000
  );
$gift$;

revoke all on function public.normalized_ethiopian_phone(text) from public;
grant execute on function public.normalized_ethiopian_phone(text) to authenticated;
revoke all on function public.has_valid_deposit_phone(uuid) from public;
grant execute on function public.has_valid_deposit_phone(uuid) to authenticated;
revoke all on function public.maximum_deposit_amount() from public;
grant execute on function public.maximum_deposit_amount() to authenticated;

create table if not exists public.gift_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount numeric not null check (amount > 0),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.gift_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_code_id uuid not null references public.gift_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (gift_code_id, user_id)
);

create index if not exists gift_codes_created_at_idx on public.gift_codes(created_at desc);
create index if not exists gift_code_redemptions_user_idx on public.gift_code_redemptions(user_id, created_at desc);

alter table public.gift_codes enable row level security;
alter table public.gift_code_redemptions enable row level security;

drop policy if exists "Admins manage gift codes" on public.gift_codes;
create policy "Admins manage gift codes"
  on public.gift_codes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins read gift redemptions" on public.gift_code_redemptions;
create policy "Admins read gift redemptions"
  on public.gift_code_redemptions
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Users read own gift redemptions" on public.gift_code_redemptions;
create policy "Users read own gift redemptions"
  on public.gift_code_redemptions
  for select
  to authenticated
  using (user_id = auth.uid());

-- Generate one or more gift codes. Admin only.
create or replace function public.generate_gift_codes(
  p_amount numeric,
  p_max_redemptions integer default 1,
  p_count integer default 1
)
returns table (
  id uuid,
  code text,
  amount numeric,
  max_redemptions integer,
  redeemed_count integer,
  active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $gift$
declare
  v_count integer := least(greatest(coalesce(p_count, 1), 1), 20);
  v_max integer := greatest(coalesce(p_max_redemptions, 1), 1);
  v_amount numeric := coalesce(p_amount, 0);
  v_code text;
  i integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if v_amount <= 0
     or v_amount <> floor(v_amount)
     or v_amount > public.maximum_deposit_amount()
  then
    raise exception 'Gift amount must be a whole ETB amount up to %', public.maximum_deposit_amount();
  end if;

  if v_max < 1 or v_max > 100 then
    raise exception 'Redemption limit must be between 1 and 100';
  end if;

  for i in 1..v_count loop
    -- Generate a readable code; retry on the rare collision.
    loop
      v_code := 'CAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.gift_codes gc where gc.code = v_code);
    end loop;

    insert into public.gift_codes (code, amount, max_redemptions, created_by)
    values (v_code, v_amount, v_max, auth.uid());
  end loop;

  return query
  select gc.id, gc.code, gc.amount, gc.max_redemptions, gc.redeemed_count, gc.active, gc.created_at
  from public.gift_codes gc
  where gc.created_by = auth.uid()
  order by gc.created_at desc
  limit v_count;
end;
$gift$;

-- Redeem a gift code for the current user. Each user can redeem a code once.
create or replace function public.redeem_gift_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $gift$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_gift public.gift_codes%rowtype;
  v_existing uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Phone-less/bot accounts must not be able to consume gift codes.
  if not public.has_valid_deposit_phone(v_user_id) then
    raise exception 'A valid phone number is required to redeem a gift code';
  end if;

  if v_code = '' then
    raise exception 'Gift code is required';
  end if;

  select * into v_gift
  from public.gift_codes
  where upper(code) = v_code
  for update;

  if v_gift.id is null then
    raise exception 'Invalid gift code';
  end if;

  if not v_gift.active then
    raise exception 'Gift code is inactive';
  end if;

  if v_gift.redeemed_count >= v_gift.max_redemptions then
    raise exception 'Gift code has already been used';
  end if;

  select id into v_existing
  from public.gift_code_redemptions
  where gift_code_id = v_gift.id and user_id = v_user_id;

  if v_existing is not null then
    raise exception 'Gift code already redeemed';
  end if;

  insert into public.gift_code_redemptions (gift_code_id, user_id, amount)
  values (v_gift.id, v_user_id, v_gift.amount);

  update public.gift_codes
  set redeemed_count = redeemed_count + 1
  where id = v_gift.id;

  insert into public.wallet_ledger (user_id, amount, type, status, description)
  values (v_user_id, v_gift.amount, 'gift_code', 'completed', 'Gift code redemption');

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_gift.amount
  where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'amount', v_gift.amount,
    'code', v_gift.code
  );
end;
$gift$;

revoke all on function public.generate_gift_codes(numeric, integer, integer) from public;
revoke all on function public.redeem_gift_code(text) from public;
grant execute on function public.generate_gift_codes(numeric, integer, integer) to authenticated;
grant execute on function public.redeem_gift_code(text) to authenticated;

notify pgrst, 'reload schema';
