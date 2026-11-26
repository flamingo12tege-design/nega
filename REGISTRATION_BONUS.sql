-- Registration welcome bonus
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Credits the ETB 300 welcome bonus to a newly registered member exactly
-- once. The app calls this right after registration, before it shows the
-- "Welcome to CAS" popup, so the bonus is really in the member's wallet.

alter table public.profiles
  add column if not exists registration_bonus_claimed boolean not null default false;

create or replace function public.claim_registration_bonus()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_amount numeric := 300;
  v_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Lock the profile so a double tap cannot credit the bonus twice.
  select registration_bonus_claimed into v_claimed
  from public.profiles
  where id = v_user_id
  for update;

  if v_claimed is null then
    raise exception 'Profile not found';
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
$$;

revoke all on function public.claim_registration_bonus() from public;
grant execute on function public.claim_registration_bonus() to authenticated;

notify pgrst, 'reload schema';
