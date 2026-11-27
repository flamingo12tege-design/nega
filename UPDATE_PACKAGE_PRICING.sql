-- Update VIP1 / VIP2 package pricing to whole-birr payouts
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- VIP1: investment ETB 1,300, 45 days, total return ETB 2,700 (60 x 45)
-- VIP2: investment ETB 4,200, 45 days, total return ETB 8,685 (193 x 45)
--
-- Daily payouts are stored as whole birr (ETB 60 and ETB 193). This also
-- rounds previously credited daily income and team commission so old decimals
-- do not keep coming back in the wallet, payout counter or team totals.

reset role;

update public.packages
set
  price = case tier when 1 then 1300 when 2 then 4200 else price end,
  daily_payout = case tier when 1 then 60 when 2 then 193 else daily_payout end,
  locked = case when tier in (1, 2) then false else locked end
where tier in (1, 2);

-- Keep member balances in sync with the rounded ledger amounts.
with adjustments as (
  select user_id, sum(round(amount) - amount) as delta
  from public.wallet_ledger
  where type in ('daily_income', 'team_commission')
    and amount <> round(amount)
  group by user_id
)
update public.profiles p
set wallet_balance = coalesce(p.wallet_balance, 0) + a.delta
from adjustments a
where p.id = a.user_id;

update public.wallet_ledger
set amount = round(amount)
where type in ('daily_income', 'team_commission')
  and amount <> round(amount);

-- Verify:
-- select
--   tier,
--   name,
--   price as investment,
--   daily_payout,
--   45 as duration_days,
--   round(daily_payout * 45) as total_return,
--   locked
-- from public.packages
-- where tier in (1, 2)
-- order by tier;

notify pgrst, 'reload schema';
