-- Withdrawal eligibility: earned income only
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- New rule: deposited money cannot be withdrawn. A member must first buy a
-- package, earn at least ETB 300 of non-deposit income (daily income, task
-- rewards, commissions and bonuses), and only that earned income may be
-- withdrawn. Pending withdrawal requests are reserved.

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
  select
    exists (
      select 1
      from public.purchases
      where user_id = auth.uid()
        and lower(coalesce(status, '')) in ('approved', 'completed')
    ),
    coalesce((
      select sum(amount)
      from public.wallet_ledger
      where user_id = auth.uid()
        and status = 'completed'
        and amount > 0
        and lower(coalesce(type, '')) not in ('recharge', 'deposit')
    ), 0),
    coalesce((
      select sum(abs(amount))
      from public.wallet_ledger
      where user_id = auth.uid()
        and type = 'withdrawal'
        and status = 'pending'
    ), 0),
    greatest(
      0,
      coalesce((
        select sum(amount)
        from public.wallet_ledger
        where user_id = auth.uid()
          and status = 'completed'
          and amount > 0
          and lower(coalesce(type, '')) not in ('recharge', 'deposit')
      ), 0)
      - coalesce((
        select sum(abs(amount))
        from public.wallet_ledger
        where user_id = auth.uid()
          and type = 'withdrawal'
          and status = 'pending'
      ), 0)
    ),
    300;
$wd$;

revoke all on function public.withdraw_eligibility() from public;
grant execute on function public.withdraw_eligibility() to authenticated;

-- 2) Drop the old 3-argument version so it cannot bypass the new checks.
drop function if exists public.request_withdrawal(numeric, text, text);

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
  v_amount numeric := abs(coalesce(p_amount, 0));
  v_account text := nullif(btrim(coalesce(p_account, '')), '');
  v_method text := coalesce(nullif(btrim(p_method), ''), 'CBE');
  v_password text := btrim(coalesce(p_password, ''));
  v_earned numeric;
  v_pending numeric;
  v_available numeric;
  v_hash text;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter a valid withdrawal amount';
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

  -- Only earned income counts. Deposits and recharges are excluded.
  v_earned := coalesce((
    select sum(amount)
    from public.wallet_ledger
    where user_id = v_user_id
      and status = 'completed'
      and amount > 0
      and lower(coalesce(type, '')) not in ('recharge', 'deposit')
  ), 0);

  v_pending := coalesce((
    select sum(abs(amount))
    from public.wallet_ledger
    where user_id = v_user_id
      and type = 'withdrawal'
      and status = 'pending'
  ), 0);

  v_available := greatest(0, v_earned - v_pending);

  if v_available < 300 then
    raise exception 'Withdrawals unlock at ETB 300 of earned income';
  end if;
  if v_amount < 300 then
    raise exception 'Minimum withdrawal is ETB 300';
  end if;
  if v_amount > v_available then
    raise exception 'Amount exceeds your withdrawable income';
  end if;

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
    format('CBE withdrawal to %s via %s', v_account, v_method)
  )
  returning id into v_id;

  return v_id;
end;
$wd$;

revoke all on function public.request_withdrawal(numeric, text, text, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

notify pgrst, 'reload schema';
