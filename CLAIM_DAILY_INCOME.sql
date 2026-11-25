-- Daily income claims
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Makes "Claim today" persist to the database so the claim shows up in the
-- member's wallet history and in the profile "This week" / "This month" totals.
-- Each purchase can be claimed at most once per day and at most once per
-- package payout day (45 days, matching rewardRules.packageDurationDays).

-- 1) Per-claim day column + uniqueness backstop.
alter table public.wallet_ledger
  add column if not exists claim_date date;

create unique index if not exists wallet_ledger_daily_claim_unique
  on public.wallet_ledger (user_id, reference_id, claim_date)
  where type = 'daily_income';

-- 2) Claim RPC: validates ownership/status, blocks repeats, credits the wallet.
create or replace function public.claim_daily_income(p_purchase_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_payout numeric;
  v_claims int;
  v_today date := (now() at time zone 'utc')::date;
  v_duration constant int := 45; -- rewardRules.packageDurationDays
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Lock the purchase so two taps cannot both pass the checks below.
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and user_id = v_user_id
  for update;

  if v_purchase.id is null then
    raise exception 'Purchase not found';
  end if;

  if lower(v_purchase.status) <> 'approved' then
    raise exception 'This package is not active yet';
  end if;

  select daily_payout into v_payout
  from public.packages
  where id = v_purchase.package_id;

  if v_payout is null or v_payout <= 0 then
    raise exception 'Package payout is not configured';
  end if;

  select count(*) into v_claims
  from public.wallet_ledger
  where user_id = v_user_id
    and type = 'daily_income'
    and reference_id = p_purchase_id;

  if v_claims >= v_duration then
    raise exception 'Package completed';
  end if;

  if exists (
    select 1
    from public.wallet_ledger
    where user_id = v_user_id
      and type = 'daily_income'
      and reference_id = p_purchase_id
      and claim_date = v_today
  ) then
    raise exception 'Already claimed today';
  end if;

  insert into public.wallet_ledger (
    user_id, amount, type, status, reference_id, claim_date, description
  ) values (
    v_user_id, v_payout, 'daily_income', 'completed', p_purchase_id, v_today, 'Daily income claim'
  );

  update public.profiles
  set wallet_balance = wallet_balance + v_payout
  where id = v_user_id;

  return v_payout;
end;
$$;

revoke all on function public.claim_daily_income(uuid) from public;
grant execute on function public.claim_daily_income(uuid) to authenticated;

notify pgrst, 'reload schema';
