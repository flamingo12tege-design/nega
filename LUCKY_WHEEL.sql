-- Lucky wheel: record spins and show recent winners
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Prize amounts are derived from the label on the server. The client can no
-- longer inflate a public winner by sending a larger p_amount. Spins are
-- earned, never given for free: one for the caller's first approved package,
-- plus one for each invited friend with an approved package.
--
-- Standard prizes: ETB 50, ETB 100, Try again.
-- The ETB 2,000 prize is reserved for locked-package / upper-tier VIP members.

reset role;

create table if not exists public.lucky_wheel_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prize_label text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lucky_wheel_spins_created_at_idx
  on public.lucky_wheel_spins (created_at desc);

create index if not exists lucky_wheel_spins_user_id_idx
  on public.lucky_wheel_spins (user_id);

alter table public.lucky_wheel_spins enable row level security;

-- Winners are public; writes go through the recording RPC only.
drop policy if exists "Wheel winners are public" on public.lucky_wheel_spins;
create policy "Wheel winners are public"
  on public.lucky_wheel_spins for select
  to anon, authenticated
  using (true);

-- VIP tier that unlocks the ETB 2,000 prize. Locked packages always unlock it.
insert into public.platform_settings (key, value) values
  ('lucky_wheel_jackpot_min_vip_tier', '5')
on conflict (key) do nothing;

-- Repair historic labels and spoofed amounts before adding the guard.
-- Unknown labels become "Try again" so they satisfy the strict constraint.
update public.lucky_wheel_spins
set prize_label = case btrim(prize_label)
      when 'ETB 50' then 'ETB 50'
      when 'ETB 100' then 'ETB 100'
      when 'ETB 200' then 'ETB 200'
      when 'ETB 500' then 'ETB 500'
      when 'ETB 2,000' then 'ETB 2,000'
      when 'ETB 80' then 'ETB 80'
      when 'ETB 150' then 'ETB 150'
      when 'ETB 300' then 'ETB 300'
      else 'Try again'
    end,
    amount = case btrim(prize_label)
      when 'ETB 50' then 50
      when 'ETB 100' then 100
      when 'ETB 200' then 200
      when 'ETB 500' then 500
      when 'ETB 2,000' then 2000
      when 'ETB 80' then 80
      when 'ETB 150' then 150
      when 'ETB 300' then 300
      else 0
    end;

alter table public.lucky_wheel_spins
  drop constraint if exists lucky_wheel_spins_amount_label_check;
alter table public.lucky_wheel_spins
  add constraint lucky_wheel_spins_amount_label_check
  check (
    (btrim(prize_label) = 'Try again' and amount = 0)
    or (
      btrim(prize_label) in (
        'ETB 50', 'ETB 100', 'ETB 200', 'ETB 500',
        'ETB 2,000', 'ETB 80', 'ETB 150', 'ETB 300'
      )
      and amount = case btrim(prize_label)
        when 'ETB 50' then 50
        when 'ETB 100' then 100
        when 'ETB 200' then 200
        when 'ETB 500' then 500
        when 'ETB 2,000' then 2000
        when 'ETB 80' then 80
        when 'ETB 150' then 150
        when 'ETB 300' then 300
        else 0
      end
    )
  );

-- The ETB 2,000 prize is only available to members who hold an approved
-- locked package or a package at/above the configured upper VIP tier.
drop function if exists public.lucky_wheel_jackpot_unlocked();
create or replace function public.lucky_wheel_jackpot_unlocked()
returns boolean
language sql
security definer
stable
set search_path = public
as $wheel$
  select exists (
    select 1
    from public.purchases pu
    join public.packages pk on pk.id = pu.package_id
    where pu.user_id = auth.uid()
      and lower(coalesce(pu.status, '')) in ('approved', 'completed')
      and (
        coalesce(pk.locked, false)
        or coalesce(pk.tier, 0) >= coalesce((
          select case when value ~ '^[0-9]+$' then value::integer end
          from public.platform_settings
          where key = 'lucky_wheel_jackpot_min_vip_tier'
        ), 5)
      )
  );
$wheel$;

-- Spins are earned, never given for free:
--   +1 for the caller's first approved package
--   +1 for each direct recruit with at least one approved package
-- Every recorded spin (including "Try again") consumes one earned spin.
drop function if exists public.lucky_wheel_spins_available();
create or replace function public.lucky_wheel_spins_available()
returns integer
language sql
security definer
stable
set search_path = public
as $wheel$
  with me as (
    select
      p.id,
      upper(regexp_replace(coalesce(p.member_id, ''), '[^a-zA-Z0-9]', '', 'g')) as code
    from public.profiles p
    where p.id = auth.uid()
  ),
  earned as (
    select
      case when exists (
        select 1
        from public.purchases pu
        where pu.user_id = me.id
          and lower(coalesce(pu.status, '')) in ('approved', 'completed')
      ) then 1 else 0 end
      + (
        select count(distinct friend.id)
        from public.profiles friend
        join me on me.code <> ''
          and upper(regexp_replace(coalesce(friend.referral_code, ''), '[^a-zA-Z0-9]', '', 'g')) = me.code
        where friend.id <> me.id
          and exists (
            select 1
            from public.purchases pu
            where pu.user_id = friend.id
              and lower(coalesce(pu.status, '')) in ('approved', 'completed')
          )
      ) as total
    from me
  )
  select greatest(
    coalesce((select total from earned), 0)
      - (select count(*)::integer from public.lucky_wheel_spins where user_id = auth.uid()),
    0
  );
$wheel$;

-- Drop the old version that trusted a client-supplied amount.
drop function if exists public.record_lucky_wheel_win(text, numeric);

create or replace function public.record_lucky_wheel_win(p_prize_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $wheel$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_label text := btrim(coalesce(p_prize_label, ''));
  v_amount numeric;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Serialize spins for this member so two simultaneous requests cannot
  -- spend the same earned spin.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select id into v_profile_id from public.profiles where id = v_user_id for update;

  -- Only the current wheel prizes may be minted. Older labels remain valid
  -- in the constraint so historical winners keep their original amounts.
  v_amount := case v_label
    when 'ETB 50' then 50
    when 'ETB 100' then 100
    when 'ETB 2,000' then 2000
    when 'Try again' then 0
    else null
  end;

  if v_amount is null then
    raise exception 'Invalid prize';
  end if;

  if v_label = 'ETB 2,000' and not public.lucky_wheel_jackpot_unlocked() then
    raise exception 'The ETB 2,000 prize is reserved for locked-package and upper-tier VIP members.';
  end if;

  if public.lucky_wheel_spins_available() <= 0 then
    raise exception 'No spins available. Activate your package or invite a friend who activates theirs to earn one.';
  end if;

  insert into public.lucky_wheel_spins (user_id, prize_label, amount)
  values (v_user_id, v_label, v_amount)
  returning id into v_id;

  return v_id;
end;
$wheel$;

-- Public list of recent real wins (excludes "Try again").
create or replace function public.get_lucky_wheel_winners()
returns jsonb
language sql
security definer
stable
set search_path = public
as $wheel$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'member_id', p.member_id,
        'prize', w.prize_label,
        'amount', w.amount,
        'created_at', w.created_at
      )
      order by w.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select s.id, s.prize_label, s.amount, s.created_at, s.user_id
    from public.lucky_wheel_spins s
    where s.amount > 0
    order by s.created_at desc
    limit 30
  ) w
  left join public.profiles p on p.id = w.user_id;
$wheel$;

revoke all on function public.record_lucky_wheel_win(text) from public;
revoke all on function public.lucky_wheel_spins_available() from public;
revoke all on function public.lucky_wheel_jackpot_unlocked() from public;
revoke all on function public.get_lucky_wheel_winners() from public;
grant execute on function public.record_lucky_wheel_win(text) to authenticated;
grant execute on function public.lucky_wheel_spins_available() to authenticated;
grant execute on function public.lucky_wheel_jackpot_unlocked() to authenticated;
grant execute on function public.get_lucky_wheel_winners() to anon, authenticated;

notify pgrst, 'reload schema';
