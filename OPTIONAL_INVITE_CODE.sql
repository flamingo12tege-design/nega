-- Optional invitation codes
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Registration now works with or without ?ref=<member-id>. When no invitation
-- link is used, the new member's referral_code is left empty so they simply
-- have no upline. If your profiles table still requires referral_code, this
-- makes the column optional.

alter table public.profiles alter column referral_code drop not null;

notify pgrst, 'reload schema';
