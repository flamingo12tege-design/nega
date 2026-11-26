-- Clear test/demo activity from Supabase
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- KEEPS
--   • public.packages (your package catalogue)
--   • public.platform_settings (deposit account, etc.)
--   • the admin profile and admin login
--   • non-admin login accounts and profiles
--
-- REMOVES
--   • every wallet_ledger row (deposits, withdrawals, daily income, bonuses,
--     purchases and old test credits)
--   • every package purchase request
--   • every deposit verification log, when that table exists
--   • every non-admin wallet balance is reset to 0
--
-- If every non-admin member is also test data, uncomment the final block to
-- delete those login accounts (this cascades their profile rows).

begin;

-- 1. Deposit verification log (deposit-only audit trail).
do $$
begin
  if to_regclass('public.deposit_verification_logs') is not null then
    delete from public.deposit_verification_logs;
  end if;
end $$;

-- 2. Wallet activity: deposits, withdrawals, daily income, commissions and purchases.
delete from public.wallet_ledger;

-- 3. Package purchase requests.
delete from public.purchases;

-- 4. Reset non-admin balances so the app starts from a clean slate.
update public.profiles
set wallet_balance = 0
where coalesce(role, 'user') <> 'admin';

-- 5. Some older deployments kept recharge rows in their own table.
do $$
begin
  if to_regclass('public.recharges') is not null then
    delete from public.recharges;
  end if;
end $$;

commit;

-- OPTIONAL: delete test member login accounts as well.
-- Only run this if every non-admin account is test data.
--
-- delete from auth.users
-- where id in (
--   select id from public.profiles
--   where coalesce(role, 'user') <> 'admin'
-- );

-- OPTIONAL: delete uploaded test payment screenshots.
-- delete from storage.objects where bucket_id = 'recharge-proofs';
