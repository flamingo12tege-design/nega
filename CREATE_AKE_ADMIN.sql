-- Create Ake as an admin with a direct password (no magic link, no email confirmation)
--
-- WARNING: Hosted Supabase does NOT allow the SQL Editor to INSERT into auth.users.
-- Running this file there will fail with:
--   ERROR: 42501: must be owner of table users
--
-- On hosted Supabase, create the user in:
--   Authentication -> Users -> Add user -> enter password -> Auto Confirm User = ON
-- then run ADD_CO_ADMIN.sql to grant admin role.
-- Or use the admin dashboard Admins form (needs SUPABASE_SERVICE_ROLE_KEY).
--
-- This file is only usable on local/self-hosted Supabase.
--
-- IMPORTANT: change the password in the CTE below before running.
-- This script creates the Auth user (bcrypt password, email already confirmed),
-- links the email identity, and gives the profile the admin role.

with new_user as (
  select
    gen_random_uuid() as id,
    lower('Ake@tegene.com') as email,
    'Ake@2026' as password
  where not exists (
    select 1 from auth.users where lower(email) = lower('Ake@tegene.com')
  )
)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
select
  id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  email,
  crypt(password, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
from new_user;

-- Link the email identity so password login works.
insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(),
  now(),
  now()
from auth.users u
where lower(u.email) = lower('Ake@tegene.com')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- Give the profile admin role (also covers the trigger-created profile).
insert into public.profiles (id, member_id, phone, role, wallet_balance)
select
  u.id,
  'CAS-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
  null,
  'admin',
  0
from auth.users u
where lower(u.email) = lower('Ake@tegene.com')
on conflict (id) do update set role = 'admin';

-- Verify:
-- select u.email, u.email_confirmed_at, p.role
-- from auth.users u left join public.profiles p on p.id = u.id
-- where lower(u.email) = lower('Ake@tegene.com');

notify pgrst, 'reload schema';
