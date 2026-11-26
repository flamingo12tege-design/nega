-- Withdrawal password (Profile -> Security Settings)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- A member can set a separate "withdrawal password" in Profile -> Security
-- Settings. When it is set, every withdrawal request must include that
-- password — even if somebody else is logged into the account.
--
-- The password is never stored in plain text: only a bcrypt hash lives in the
-- database, and the hash is not readable from the client (no select policy on
-- the table). All access goes through the security-definer RPCs below.

-- 0) pgcrypto is used for bcrypt hashing.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
  end if;
end $$;

-- 1) Private table: only the RPCs below can read or write it.
create table if not exists public.withdrawal_security (
  user_id uuid primary key references auth.users (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.withdrawal_security enable row level security;

-- No select/insert/update/delete policies are created on purpose: members
-- cannot read the hash or write to the table directly.

-- 2) Set a withdrawal password (first time), or change it (current password
--    required when one already exists).
create or replace function public.set_withdrawal_password(
  p_password text,
  p_current_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_password text := btrim(coalesce(p_password, ''));
  v_current text := btrim(coalesce(p_current_password, ''));
  v_hash text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if length(v_password) < 4 then
    raise exception 'Use a password of at least 4 characters';
  end if;

  select password_hash into v_hash
  from public.withdrawal_security
  where user_id = v_user
  for update;

  if v_hash is not null then
    if v_current = '' or v_hash <> crypt(v_current, v_hash) then
      raise exception 'Current password is incorrect';
    end if;
  end if;

  insert into public.withdrawal_security (user_id, password_hash)
  values (v_user, crypt(v_password, gen_salt('bf')))
  on conflict (user_id) do update
    set password_hash = excluded.password_hash,
        updated_at = now();
end;
$$;

revoke all on function public.set_withdrawal_password(text, text) from public;
grant execute on function public.set_withdrawal_password(text, text) to authenticated;

-- 3) Remove the withdrawal password (current password required).
create or replace function public.remove_withdrawal_password(p_current_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_current text := btrim(coalesce(p_current_password, ''));
  v_hash text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select password_hash into v_hash
  from public.withdrawal_security
  where user_id = v_user
  for update;

  if v_hash is null then
    return;
  end if;

  if v_current = '' or v_hash <> crypt(v_current, v_hash) then
    raise exception 'Current password is incorrect';
  end if;

  delete from public.withdrawal_security where user_id = v_user;
end;
$$;

revoke all on function public.remove_withdrawal_password(text) from public;
grant execute on function public.remove_withdrawal_password(text) to authenticated;

-- 4) Does this member have a withdrawal password? (used by the app to show
--    or hide the password field on the withdraw form)
create or replace function public.has_withdrawal_password()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.withdrawal_security
    where user_id = auth.uid()
  );
$$;

revoke all on function public.has_withdrawal_password() from public;
grant execute on function public.has_withdrawal_password() to authenticated;

-- 5) Withdrawal requests must carry the password when one is set.
--    The old 3-argument version is dropped so the password check cannot be
--    bypassed by calling the previous signature.
drop function if exists public.request_withdrawal(numeric, text, text);

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
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_pending numeric;
  v_amount numeric := abs(coalesce(p_amount, 0));
  v_account text := nullif(btrim(coalesce(p_account, '')), '');
  v_password text := btrim(coalesce(p_password, ''));
  v_hash text;
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

  -- Security setting: the withdrawal password is required when it is set.
  select password_hash into v_hash
  from public.withdrawal_security
  where user_id = v_user_id;

  if v_hash is not null then
    if v_password = '' then
      raise exception 'Enter your withdrawal password';
    end if;
    if v_hash <> crypt(v_password, v_hash) then
      raise exception 'Incorrect withdrawal password';
    end if;
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

revoke all on function public.request_withdrawal(numeric, text, text, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

notify pgrst, 'reload schema';
