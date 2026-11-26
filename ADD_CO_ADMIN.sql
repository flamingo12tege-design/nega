-- Add a co-admin by email
-- Run this in the Supabase SQL Editor after the co-admin has signed up / been
-- created in Supabase Auth. Safe to re-run.
--
-- Any authenticated user whose public.profiles.role = 'admin' can sign in to
-- the admin console. This promotes Ake@tegene.com and tegene@tegene.com.
-- It does not create passwords — create those users in Supabase Auth first.

insert into public.profiles (id, member_id, phone, role, wallet_balance)
select
  u.id,
  coalesce(p.member_id, 'CAS-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0')),
  coalesce(p.phone, u.phone),
  'admin',
  coalesce(p.wallet_balance, 0)
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) in (lower('Ake@tegene.com'), lower('tegene@tegene.com'))
on conflict (id) do update set
  role = 'admin',
  member_id = coalesce(public.profiles.member_id, excluded.member_id),
  phone = coalesce(public.profiles.phone, excluded.phone);

-- Verify the result:
-- select u.email, p.role from auth.users u
-- left join public.profiles p on p.id = u.id
-- where lower(u.email) in (lower('Ake@tegene.com'), lower('tegene@tegene.com'));
