-- Lucky wheel: record spins and show recent winners
-- Run this once in the Supabase SQL Editor. Safe to re-run.

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

-- Record the caller's spin. Prize is checked against the wheel's slices.
create or replace function public.record_lucky_wheel_win(
  p_prize_label text,
  p_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $wheel$
declare
  v_user_id uuid := auth.uid();
  v_label text := btrim(coalesce(p_prize_label, ''));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_label not in (
    'ETB 50', 'ETB 100', 'ETB 200', 'ETB 500',
    'ETB 80', 'ETB 150', 'ETB 300', 'Try again'
  ) then
    raise exception 'Invalid prize';
  end if;

  insert into public.lucky_wheel_spins (user_id, prize_label, amount)
  values (v_user_id, v_label, greatest(0, coalesce(p_amount, 0)))
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

revoke all on function public.record_lucky_wheel_win(text, numeric) from public;
revoke all on function public.get_lucky_wheel_winners() from public;
grant execute on function public.record_lucky_wheel_win(text, numeric) to authenticated;
grant execute on function public.get_lucky_wheel_winners() to anon, authenticated;

notify pgrst, 'reload schema';
