-- Purchase package RPC
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Use this small file instead of rerunning the whole SUPABASE_AUTH_SETUP.sql
-- if your editor truncated the larger script. It recreates only
-- public.purchase_package() with a correctly closed $$ ... $$; block.

create or replace function public.purchase_package(p_package_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_price numeric;
  v_purchase_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select price into v_price
  from public.packages
  where id = p_package_id
    and locked = false;

  if v_price is null then
    raise exception 'Package unavailable';
  end if;

  select wallet_balance into v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile not found';
  end if;

  if v_balance < v_price then
    raise exception 'Insufficient balance';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance - v_price
  where id = v_user_id;

  insert into public.purchases (
    user_id, package_id, amount, payment_method, status
  ) values (
    v_user_id, p_package_id, v_price, 'Wallet balance', 'approved'
  ) returning id into v_purchase_id;

  insert into public.wallet_ledger (
    user_id, amount, type, reference_id, status, description
  ) values (
    v_user_id, -v_price, 'purchase', v_purchase_id, 'completed', 'Package purchase'
  );

  return v_purchase_id;
end;
$$;

revoke all on function public.purchase_package(text) from public;
grant execute on function public.purchase_package(text) to authenticated;

notify pgrst, 'reload schema';
