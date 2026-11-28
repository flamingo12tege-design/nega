-- Withdrawal eligibility: earned income only
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- New rule: deposited money cannot be withdrawn. A member must first buy an
-- approved package (investment), and only income EARNED AFTER that first
-- approved purchase is withdrawable. Welcome/gift promotional credits and
-- deposits/recharges are excluded. Pending AND completed withdrawals are
-- reserved so an approved payout cannot be requested a second time.
-- Withdrawals use fixed whole-ETB amounts only:
-- 300, 500, 1000, 1500, 3000, 5000, 10000, 20000, 30000.
-- No in-between/custom amounts are accepted. A 10% whole-birr fee is retained
-- by CAS; the member receives net. No withdrawals on Sunday, 3:00 AM -
-- 11:00 PM EAT only, once/day.

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Fixed-amount rules are canonical; align the min/max even if they were edited
-- before this rule change. Other settings keep any admin edits.
insert into public.platform_settings (key, value)
values
  ('minimum_withdrawal_amount', '300'),
  ('maximum_withdrawal_amount', '30000')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

insert into public.platform_settings (key, value)
values
  ('withdrawal_fixed_amounts', '300,500,1000,1500,3000,5000,10000,20000,30000'),
  ('withdrawal_fee_percent', '10')
on conflict (key) do nothing;

-- 1) Eligibility summary used by the app.
create or replace function public.withdraw_eligibility()
returns table (
  has_package boolean,
  earned numeric,
  pending numeric,
  available numeric,
  min_amount numeric
)
language sql
stable
security definer
set search_path = public
as $wd$
  with first_investment as (
    select min(created_at) as invested_at
    from public.purchases
    where user_id = auth.uid()
      and lower(coalesce(status, '')) in ('approved', 'completed')
  ),
  earned_income as (
    select coalesce(sum(l.amount), 0) as total
    from public.wallet_ledger l
    cross join first_investment fi
    where l.user_id = auth.uid()
      and l.status = 'completed'
      and l.amount > 0
      and fi.invested_at is not null
      and l.created_at >= fi.invested_at
      -- Only income earned after investing counts. Promotional credits
      -- (welcome/gift) and deposits/recharges are deliberately excluded.
      and lower(coalesce(l.type, '')) in (
        'daily_income', 'team_commission', 'recruitment_bonus',
        'referral_bonus', 'task_reward', 'commission', 'pay_income'
      )
  ),
  outstanding_withdrawals as (
    select coalesce(sum(abs(amount)), 0) as total
    from public.wallet_ledger
    where user_id = auth.uid()
      and type = 'withdrawal'
      and lower(coalesce(status, '')) in ('pending', 'completed')
  )
  select
    (select invested_at is not null from first_investment),
    (select total from earned_income),
    (select total from outstanding_withdrawals),
    greatest(0, (select total from earned_income) - (select total from outstanding_withdrawals)),
    coalesce((select nullif(value, '')::numeric from public.platform_settings where key = 'minimum_withdrawal_amount'), 300);
$wd$;

revoke all on function public.withdraw_eligibility() from public;
grant execute on function public.withdraw_eligibility() to authenticated;

-- 2) Drop every old overload so this becomes the ONLY request_withdrawal.
--    Older scripts recreated weaker 3-arg / balance-based versions.
drop function if exists public.request_withdrawal(numeric, text, text);
drop function if exists public.request_withdrawal(numeric, text, text, text);

-- 3) Withdrawal request with eligibility, account and password checks.
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_account text default null,
  p_method text default 'CBE',
  p_password text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $wd$
declare
  v_user_id uuid := auth.uid();
  v_amount numeric := coalesce(p_amount, 0);
  v_account text := nullif(btrim(coalesce(p_account, '')), '');
  v_method text := coalesce(nullif(btrim(p_method), ''), 'CBE');
  v_password text := btrim(coalesce(p_password, ''));
  v_earned numeric;
  v_outstanding numeric;
  v_available numeric;
  v_hash text;
  v_min numeric := coalesce((
    select nullif(value, '')::numeric
    from public.platform_settings
    where key = 'minimum_withdrawal_amount'
  ), 300);
  v_fee_percent numeric := coalesce((
    select nullif(value, '')::numeric
    from public.platform_settings
    where key = 'withdrawal_fee_percent'
  ), 10);
  v_fee numeric;
  v_net numeric;
  v_id uuid;
  v_now timestamp := (now() at time zone 'Africa/Addis_Ababa');
  v_dow integer := extract(isodow from v_now)::integer; -- 1=Mon ... 7=Sun
  v_hour integer := extract(hour from v_now)::integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Serialize requests from the same member so two simultaneous calls cannot
  -- both pass the once/day and available-income checks.
  perform 1 from public.profiles where id = v_user_id for update;

  if v_amount <= 0 then
    raise exception 'Enter a valid withdrawal amount';
  end if;
  -- Fixed whole-ETB amounts only; no custom or in-between values.
  if v_amount <> floor(v_amount) then
    raise exception 'Withdrawal amount must be a whole ETB amount';
  end if;
  if v_amount not in (300, 500, 1000, 1500, 3000, 5000, 10000, 20000, 30000) then
    raise exception 'Choose one of the fixed withdrawal amounts: 300, 500, 1000, 1500, 3000, 5000, 10000, 20000 or 30000';
  end if;

  -- Withdrawal schedule: Monday-Saturday, 3:00 AM - 11:00 PM (EAT).
  if v_dow = 7 then
    raise exception 'Withdrawals are not available on Sunday';
  end if;
  if v_hour < 3 or v_hour >= 23 then
    raise exception 'Withdrawals are available from 3:00 AM to 11:00 PM';
  end if;

  -- One withdrawal request per day (EAT).
  if exists (
    select 1
    from public.wallet_ledger
    where user_id = v_user_id
      and type = 'withdrawal'
      and (created_at at time zone 'Africa/Addis_Ababa')::date = v_now::date
  ) then
    raise exception 'You can only request one withdrawal per day';
  end if;

  -- A package must be approved before any withdrawal is allowed.
  if not exists (
    select 1
    from public.purchases
    where user_id = v_user_id
      and lower(coalesce(status, '')) in ('approved', 'completed')
  ) then
    raise exception 'Buy a package before requesting a withdrawal';
  end if;

  -- Only income earned after the first approved package counts.
  -- Deposits, recharges, welcome and gift credits are excluded.
  v_earned := coalesce((
    select sum(l.amount)
    from public.wallet_ledger l
    where l.user_id = v_user_id
      and l.status = 'completed'
      and l.amount > 0
      and l.created_at >= (
        select min(created_at)
        from public.purchases
        where user_id = v_user_id
          and lower(coalesce(status, '')) in ('approved', 'completed')
      )
      and lower(coalesce(l.type, '')) in (
        'daily_income', 'team_commission', 'recruitment_bonus',
        'referral_bonus', 'task_reward', 'commission', 'pay_income'
      )
  ), 0);

  v_outstanding := coalesce((
    select sum(abs(amount))
    from public.wallet_ledger
    where user_id = v_user_id
      and type = 'withdrawal'
      and lower(coalesce(status, '')) in ('pending', 'completed')
  ), 0);

  v_available := greatest(0, v_earned - v_outstanding);

  -- Minimum earned income / minimum withdrawal amount.
  if v_available < v_min then
    raise exception 'Withdrawals unlock at ETB % of earned income', v_min;
  end if;
  if v_amount < v_min then
    raise exception 'Minimum withdrawal is ETB %', v_min;
  end if;
  if v_amount > v_available then
    raise exception 'Amount exceeds your withdrawable income';
  end if;

  -- CAS keeps the fee; the member receives the whole-birr net amount.
  v_fee := round(v_amount * v_fee_percent / 100);
  v_net := v_amount - v_fee;

  -- Fall back to the bank account saved on the profile.
  if v_account is null then
    v_account := nullif(btrim(coalesce((
      select payout_account
      from public.profiles
      where id = v_user_id
    ), '')), '');
  end if;

  if v_account is null then
    raise exception 'Add a bank account before withdrawing';
  end if;
  if v_account !~ '^[0-9]{13}$' then
    raise exception 'Enter a valid 13-digit CBE account number';
  end if;

  -- Optional withdrawal security password (table may not exist yet).
  if to_regclass('public.withdrawal_security') is not null then
    v_hash := (
      select password_hash
      from public.withdrawal_security
      where user_id = v_user_id
    );
    if v_hash is not null then
      if v_password = '' then
        raise exception 'Enter your withdrawal password';
      end if;
      if crypt(v_password, v_hash) <> v_hash then
        raise exception 'Incorrect withdrawal password';
      end if;
    end if;
  end if;

  insert into public.wallet_ledger (
    user_id, amount, type, status, description
  ) values (
    v_user_id,
    -v_amount,
    'withdrawal',
    'pending',
    format('CBE withdrawal to %s via %s · Fee ETB %s · Payout ETB %s', v_account, v_method, v_fee, v_net)
  )
  returning id into v_id;

  return v_id;
end;
$wd$;

revoke all on function public.request_withdrawal(numeric, text, text, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

notify pgrst, 'reload schema';
