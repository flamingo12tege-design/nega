-- Lucky wheel: record spins and show recent winners
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Prize amounts are derived from the label on the server. The client can no
-- longer inflate a public winner by sending a larger p_amount.

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

alter table public.lucky_wheel_spins enable row level security;

-- Winners are public; writes go through the recording RPC only.
drop policy if exists "Wheel winners are public" on public.lucky_wheel_spins;
create policy "Wheel winners are public"
  on public.lucky_wheel_spins for select
  to anon, authenticated
  using (true);

-- Repair any historic spoofed amounts before adding the guard.
update public.lucky_wheel_spins
set amount = case btrim(prize_label)
  when 'ETB 50' then 50
  when 'ETB 100' then 100
  when 'ETB 200' then 200
  when 'ETB 500' then 500
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
    or (btrim(prize_label) in (
      'ETB 50', 'ETB 100', 'ETB 200', 'ETB 500',
      'ETB 80', 'ETB 150', 'ETB 300'
    ) and amount in (50, 100, 200, 500, 80, 150, 300))
    or (amount = 0)
  );

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
  v_label text := btrim(coalesce(p_prize_label, ''));
  v_amount numeric;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_amount := case v_label
    when 'ETB 50' then 50
    when 'ETB 100' then 100
    when 'ETB 200' then 200
    when 'ETB 500' then 500
    when 'ETB 80' then 80
    when 'ETB 150' then 150
    when 'ETB 300' then 300
    when 'Try again' then 0
    else null
  end;

  if v_amount is null then
    raise exception 'Invalid prize';
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
revoke all on function public.get_lucky_wheel_winners() from public;
grant execute on function public.record_lucky_wheel_win(text) to authenticated;
grant execute on function public.get_lucky_wheel_winners() to anon, authenticated;

notify pgrst, 'reload schema';
