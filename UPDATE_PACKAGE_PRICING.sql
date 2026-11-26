-- Update VIP1 / VIP2 package pricing
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- VIP1: investment ETB 1,300, 45 days, total return ETB 2,691
-- VIP2: investment ETB 4,200, 45 days, total return ETB 8,694
--
-- Total return is daily_payout x 45 days. The exact daily payouts are
-- 59.8 and 193.2, which display as ETB 60 and ETB 193 in the app.

update public.packages
set
  price = case tier when 1 then 1300 when 2 then 4200 else price end,
  daily_payout = case tier when 1 then 59.8 when 2 then 193.2 else daily_payout end,
  locked = case when tier in (1, 2) then false else locked end
where tier in (1, 2);

-- Verify:
-- select
--   tier,
--   name,
--   price as investment,
--   daily_payout,
--   45 as duration_days,
--   round(daily_payout * 45, 2) as total_return,
--   locked
-- from public.packages
-- where tier in (1, 2)
-- order by tier;

notify pgrst, 'reload schema';
