-- Withdrawal requests from deposited balance
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Deposits are withdrawable funds: a member does NOT need to buy a package
-- before requesting a withdrawal. This RPC also keeps the saved bank account
-- in the profile so it survives a reload, and prevents requesting more than
-- the available balance (balance minus pending withdrawal requests).

-- 1) Saved payout account on the member profile.
alter table public.profiles
  add column if not exists payout_account text;

-- 2) Save / update the member's CBE payout account.
create or replace function public.set_payout_account(p_account text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_account text := btrim(coalesce(p_account, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_account !~ '^[0-9]{13}$' then
    raise exception 'Enter a valid 13-digit CBE account number';
  end if;

  update public.profiles
  set payout_account = v_account
  where id = v_user_id;

  return v_account;
end;
$$;

revoke all on function public.set_payout_account(text) from public;
grant execute on function public.set_payout_account(text) to authenticated;

-- 3) Create a pending withdrawal request for the member.
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_account text default null,
  p_method text default 'CBE'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_pending numeric;
  v_amount numeric := abs(coalesce(p_amount, 0));
  v_account text := nullif(btrim(coalesce(p_account, '')), '');
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter a valid withdrawal amount';
  end if;

  -- Lock the profile so two requests cannot both spend the same balance.
  select wallet_balance into v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile not found';
  end if;

  -- Fall back to the account saved on the profile when the form omits it.
  if v_account is null then
    select payout_account into v_account
    from public.profiles
    where id = v_user_id;
  end if;

  if v_account is null or v_account = '' then
    raise exception 'Add a bank account before withdrawing';
  end if;

  if v_account !~ '^[0-9]{13}$' then
    raise exception 'Enter a valid 13-digit CBE account number';
  end if;

  select coalesce(sum(abs(amount)), 0) into v_pending
  from public.wallet_ledger
  where user_id = v_user_id
    and type = 'withdrawal'
    and status = 'pending';

  if v_amount > (v_balance - v_pending) then
    raise exception 'Amount exceeds your available balance';
  end if;

  insert into public.wallet_ledger (
    user_id, amount, type, status, description
  ) values (
    v_user_id,
    -v_amount,
    'withdrawal',
    'pending',
    format('CBE withdrawal to %s via %s', v_account, coalesce(nullif(btrim(p_method), ''), 'CBE'))
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(numeric, text, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
