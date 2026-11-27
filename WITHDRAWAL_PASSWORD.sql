-- Withdrawal password helpers (legacy compatibility)
-- Run WITHDRAWAL_SECURITY_UPDATE.sql for the full password + recovery keywords
-- flow. This file only creates safe helper functions and never defines
-- request_withdrawal; WITHDRAWAL_ELIGIBILITY.sql owns that RPC.
--
-- The password is stored only as a bcrypt hash in the extensions schema.

reset role;

create table if not exists public.withdrawal_security (
  user_id uuid primary key references auth.users (id) on delete cascade,
  password_hash text,
  keyword_hash text,
  updated_at timestamptz not null default now()
);

alter table public.withdrawal_security enable row level security;
alter table public.withdrawal_security alter column password_hash drop not null;
alter table public.withdrawal_security add column if not exists keyword_hash text;

create or replace function public.set_withdrawal_password(
  p_password text,
  p_current_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $pass$
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
    if v_current = '' or crypt(v_current, v_hash) <> v_hash then
      raise exception 'Current password is incorrect';
    end if;
  end if;

  insert into public.withdrawal_security (user_id, password_hash)
  values (v_user, crypt(v_password, gen_salt('bf')))
  on conflict (user_id) do update
    set password_hash = excluded.password_hash,
        updated_at = now();
end;
$pass$;

revoke all on function public.set_withdrawal_password(text, text) from public;
grant execute on function public.set_withdrawal_password(text, text) to authenticated;

create or replace function public.remove_withdrawal_password(p_current_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $pass$
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
  if crypt(v_current, v_hash) <> v_hash then
    raise exception 'Current password is incorrect';
  end if;

  update public.withdrawal_security
  set password_hash = null, updated_at = now()
  where user_id = v_user;
end;
$pass$;

revoke all on function public.remove_withdrawal_password(text) from public;
grant execute on function public.remove_withdrawal_password(text) to authenticated;

-- True only when an actual password hash exists (keyword-only rows return false).
create or replace function public.has_withdrawal_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $pass$
  select coalesce((
    select password_hash is not null
    from public.withdrawal_security
    where user_id = auth.uid()
  ), false);
$pass$;

revoke all on function public.has_withdrawal_password() from public;
grant execute on function public.has_withdrawal_password() to authenticated;

-- Never recreate the insecure balance-based overload.
drop function if exists public.request_withdrawal(numeric, text, text);

notify pgrst, 'reload schema';
