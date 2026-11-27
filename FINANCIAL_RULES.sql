-- CAS financial rules - single source of truth
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Applies the published rules to public.platform_settings so the database and
-- the app agree. Individual feature SQL files read the same keys.

reset role;

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value) values
  -- Packages: 4.6% of the investment paid daily for a 45-day recycle.
  ('daily_return_percent', '4.6'),
  ('recycle_duration_days', '45'),
  ('package_duration_days', '45'),
  -- Welcome / deposits / withdrawals.
  ('registration_bonus_amount', '50'),
  ('minimum_deposit_amount', '1300'),
  ('minimum_withdrawal_amount', '300'),
  ('maximum_withdrawal_amount', '0'), -- 0 = no upper limit
  ('withdrawal_amount_whole_etb', 'true'),
  ('withdrawal_fee_percent', '10'),
  ('withdrawal_frequency', 'Once per day'),
  ('withdrawal_days', 'Monday - Saturday'),
  ('withdrawal_hours', '3:00 AM - 11:00 PM'),
  ('withdrawal_processing', '1-48 Hours'),
  ('withdrawal_closed_day', 'Sunday'),
  -- Referrals: 10% one-time Level 1 invite reward.
  ('invite_reward_percent', '10'),
  -- Daily team commission: Level 1 / Level 2 / Level 3.
  ('team_commission_level1_percent', '8'),
  ('team_commission_level2_percent', '3'),
  ('team_commission_level3_percent', '1'),
  ('team_commission_duration_days', '45')
-- Seed only: re-running this file must never overwrite admin-edited rules.
on conflict (key) do nothing;

notify pgrst, 'reload schema';
