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

-- Editable rules (same table used by TEAM_COMMISSION.sql).
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value)
values ('registration_bonus_amount', '50')
on conflict (key) do update set value = excluded.value, updated_at = now();

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
