-- Team invite rewards and daily team commission (database-backed)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Adds:
--   1) Commission rate settings (editable in public.platform_settings).
--   2) team_commission_due()  -> what the caller can claim today.
--   3) claim_team_commission()-> credits wallet + wallet history once/day.
--   4) handle_recruitment_bonus() trigger -> pays inviter 10% once when a
--      direct recruit's package is approved.

reset role;

-- Settings table (already created by SUPABASE_AUTH_SETUP.sql in most projects).
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists "Platform settings are public" on public.platform_settings;
create policy "Platform settings are public"
  on public.platform_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings"
  on public.platform_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Default rates (change these values in Supabase to customise).
insert into public.platform_settings (key, value) values
  ('invite_reward_percent', '10'),
  ('team_commission_level1_percent', '8'),
  ('team_commission_level2_percent', '3'),
  ('team_commission_level3_percent', '1'),
  ('team_commission_duration_days', '45')
on conflict (key) do nothing;

-- One claim per user per day, plus one recruitment bonus per purchase.
alter table public.wallet_ledger
  add column if not exists claim_date date;

create unique index if not exists wallet_ledger_team_commission_unique
  on public.wallet_ledger (user_id, claim_date)
  where type = 'team_commission';

create unique index if not exists wallet_ledger_recruitment_unique
  on public.wallet_ledger (reference_id)
  where type = 'recruitment_bonus';

-- Recomputable daily commission due for the caller.
create or replace function public.team_commission_due()
returns numeric
language sql
security definer
stable
set search_path = public
as $tc$
  with params as (
    select
      coalesce((select value::numeric from public.platform_settings where key = 'team_commission_level1_percent'), 8) as l1,
      coalesce((select value::numeric from public.platform_settings where key = 'team_commission_level2_percent'), 3) as l2,
      coalesce((select value::numeric from public.platform_settings where key = 'team_commission_level3_percent'), 1) as l3,
      coalesce((select value::integer from public.platform_settings where key = 'team_commission_duration_days'), 45) as duration
  ),
  me as (
    select
      p.id,
      upper(regexp_replace(coalesce(p.member_id, ''), '[^a-zA-Z0-9]', '', 'g')) as my_code,
      coalesce((
        select max(pk.tier)
        from public.purchases pu
        join public.packages pk on pk.id = pu.package_id
        where pu.user_id = p.id and lower(coalesce(pu.status, '')) in ('approved', 'completed')
      ), 0) as vip
    from public.profiles p
    where p.id = auth.uid()
  ),
  downline as (
    select p.id, p.member_id, 1 as level
    from public.profiles p
    join me on true
    where me.my_code <> ''
      and p.id <> me.id
      and upper(btrim(coalesce(p.referral_code, ''))) = me.my_code

    union all

    select p.id, p.member_id, d.level + 1
    from public.profiles p
    join downline d
      on upper(btrim(coalesce(p.referral_code, ''))) =
         upper(regexp_replace(coalesce(d.member_id, ''), '[^a-zA-Z0-9]', '', 'g'))
    where d.level < 3 and p.id <> d.id
  ),
  ranked as (
    select distinct on (id) id, level
    from downline
    order by id, level
  ),
  members as (
    select
      r.id,
      r.level,
      coalesce((
        select max(pk.tier)
        from public.purchases pu
        join public.packages pk on pk.id = pu.package_id
        where pu.user_id = r.id and lower(coalesce(pu.status, '')) in ('approved', 'completed')
      ), 0) as vip,
      coalesce((
        select min(pu.created_at)
        from public.purchases pu
        where pu.user_id = r.id and lower(coalesce(pu.status, '')) in ('approved', 'completed')
      ), null) as first_active,
      coalesce((
        select pk.daily_payout
        from public.purchases pu
        join public.packages pk on pk.id = pu.package_id
        where pu.user_id = r.id and lower(coalesce(pu.status, '')) in ('approved', 'completed')
        order by pk.tier desc, pu.created_at asc
        limit 1
      ), 0) as daily_payout
    from ranked r
  )
  select coalesce(sum(
    case m.level
      when 1 then m.daily_payout * p.l1 / 100
      when 2 then m.daily_payout * p.l2 / 100
      when 3 then m.daily_payout * p.l3 / 100
      else 0
    end
  ), 0)
  from members m
  cross join me
  cross join params p
  where m.first_active is not null
    and (now() at time zone 'utc')::date < (m.first_active at time zone 'utc')::date + p.duration
    and (m.vip < 1 or me.vip >= m.vip);
$tc$;

-- Claim today's team commission once per day.
create or replace function public.claim_team_commission()
returns numeric
language plpgsql
security definer
set search_path = public
as $tc$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_amount numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1 from public.wallet_ledger
    where user_id = v_user_id and type = 'team_commission' and claim_date = v_today
  ) then
    raise exception 'Already claimed today';
  end if;

  v_amount := public.team_commission_due();
  if v_amount is null or v_amount <= 0 then
    raise exception 'No team commission due';
  end if;

  insert into public.wallet_ledger (
    user_id, amount, type, status, claim_date, description
  ) values (
    v_user_id, v_amount, 'team_commission', 'completed', v_today, 'Daily team commission'
  );

  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + v_amount
  where id = v_user_id;

  return v_amount;
end;
$tc$;

-- One-time 10% reward to the inviter when a direct recruit's package is approved.
create or replace function public.handle_recruitment_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $rb$
declare
  v_inviter_id uuid;
  v_rate numeric;
  v_bonus numeric;
begin
  if lower(coalesce(new.status, '')) not in ('approved', 'completed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and lower(coalesce(old.status, '')) in ('approved', 'completed') then
    return new;
  end if;

  select p.id into v_inviter_id
  from public.profiles p
  join public.profiles buyer on upper(btrim(coalesce(buyer.referral_code, ''))) =
    upper(regexp_replace(coalesce(p.member_id, ''), '[^a-zA-Z0-9]', '', 'g'))
  where buyer.id = new.user_id
    and p.id <> new.user_id
  limit 1;

  if v_inviter_id is null then
    return new;
  end if;

  v_rate := coalesce((select value::numeric from public.platform_settings where key = 'invite_reward_percent'), 10);
  v_bonus := round(coalesce(new.amount, 0) * v_rate / 100, 2);
  if v_bonus <= 0 then
    return new;
  end if;

  insert into public.wallet_ledger (
    user_id, amount, type, status, reference_id, description
  ) values (
    v_inviter_id, v_bonus, 'recruitment_bonus', 'completed', new.id, 'Invite reward'
  )
  on conflict do nothing;

  if found then
    update public.profiles
    set wallet_balance = coalesce(wallet_balance, 0) + v_bonus
    where id = v_inviter_id;
  end if;

  return new;
end;
$rb$;

drop trigger if exists on_purchase_approved on public.purchases;
create trigger on_purchase_approved
  after insert or update of status on public.purchases
  for each row execute function public.handle_recruitment_bonus();

revoke all on function public.team_commission_due() from public;
revoke all on function public.claim_team_commission() from public;
grant execute on function public.team_commission_due() to authenticated;
grant execute on function public.claim_team_commission() to authenticated;

notify pgrst, 'reload schema';
