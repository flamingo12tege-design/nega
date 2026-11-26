-- Withdrawal security RPCs (table must already exist)
-- Run this in Supabase SQL Editor. Safe to re-run.
--
-- Create public.withdrawal_security in Table Editor first:
--   user_id uuid primary key -> auth.users(id) on delete cascade
--   password_hash text (nullable)
--   keyword_hash text (nullable)
--   updated_at timestamptz not null default now()
-- Enable RLS, no policies.
--
-- If CREATE FUNCTION is also denied, reset role impersonation first.
reset role;

-- 2) Save / update password and/or keywords.
--    p_password:  null = keep current, '' = clear, text = set new
--    p_keywords:  null = keep current, empty array = clear, 2-3 values = set
create or replace function public.set_withdrawal_security(
  p_password text default null,
  p_current_password text default null,
  p_keywords text[] default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $sec$
declare
  v_user uuid := auth.uid();
  v_raw_password text := coalesce(p_password, '');
  v_clear_password boolean := v_raw_password = '';
  v_password text := nullif(btrim(v_raw_password), '');
  v_current text := nullif(btrim(coalesce(p_current_password, '')), '');
  v_keywords text[] := coalesce(p_keywords, '{}'::text[]);
  v_hash text;
  v_keyword_hash text;
  v_new_hash text;
  v_new_keyword_hash text;
  v_count int;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  v_keywords := array(
    select lower(btrim(k))
    from unnest(v_keywords) as k
    where btrim(k) <> ''
    order by lower(btrim(k))
  );
  v_count := coalesce(array_length(v_keywords, 1), 0);
  if v_count not in (0, 2, 3) then
    raise exception 'Use 2 or 3 keywords, or leave them empty';
  end if;

  if not v_clear_password and v_password is not null and length(v_password) < 4 then
    raise exception 'Use a password of at least 4 characters';
  end if;

  v_hash := (select password_hash from public.withdrawal_security where user_id = v_user);
  v_keyword_hash := (select keyword_hash from public.withdrawal_security where user_id = v_user);

  if v_hash is not null and (v_clear_password or v_password is not null) then
    if v_current is null or v_hash <> crypt(v_current, v_hash) then
      raise exception 'Current password is incorrect';
    end if;
  end if;

  if v_clear_password then
    v_new_hash := null;
  elsif v_password is null then
    v_new_hash := v_hash;
  else
    v_new_hash := crypt(v_password, gen_salt('bf'));
  end if;

  if p_keywords is null then
    v_new_keyword_hash := v_keyword_hash;
  elsif v_count = 0 then
    v_new_keyword_hash := null;
  else
    v_new_keyword_hash := crypt(array_to_string(v_keywords, '|'), gen_salt('bf'));
  end if;

  insert into public.withdrawal_security (user_id, password_hash, keyword_hash, updated_at)
  values (v_user, v_new_hash, v_new_keyword_hash, now())
  on conflict (user_id) do update set
    password_hash = excluded.password_hash,
    keyword_hash = excluded.keyword_hash,
    updated_at = now();
end;
$sec$;

revoke all on function public.set_withdrawal_security(text, text, text[]) from public;
grant execute on function public.set_withdrawal_security(text, text, text[]) to authenticated;

-- 3) Reset a forgotten withdrawal password using the recovery keywords.
create or replace function public.recover_withdrawal_password(
  p_keywords text[],
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $sec$
declare
  v_user uuid := auth.uid();
  v_new text := nullif(btrim(coalesce(p_new_password, '')), '');
  v_input text;
  v_stored text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if length(v_new) < 4 then
    raise exception 'Use a password of at least 4 characters';
  end if;

  v_input := array_to_string(
    array(
      select lower(btrim(k))
      from unnest(coalesce(p_keywords, '{}'::text[])) as k
      where btrim(k) <> ''
      order by lower(btrim(k))
    ),
    '|'
  );

  v_stored := (select keyword_hash from public.withdrawal_security where user_id = v_user);
  if v_stored is null then
    raise exception 'No recovery keywords are set';
  end if;
  if crypt(v_input, v_stored) <> v_stored then
    raise exception 'Keywords do not match';
  end if;

  update public.withdrawal_security
  set password_hash = crypt(v_new, gen_salt('bf')), updated_at = now()
  where user_id = v_user;
end;
$sec$;

revoke all on function public.recover_withdrawal_password(text[], text) from public;
grant execute on function public.recover_withdrawal_password(text[], text) to authenticated;

-- 4) Status used by the app (password and keywords are independent).
create or replace function public.withdrawal_security_status()
returns table (has_password boolean, has_keywords boolean)
language sql
stable
security definer
set search_path = public, extensions
as $sec$
  select
    exists (
      select 1 from public.withdrawal_security
      where user_id = auth.uid() and password_hash is not null
    ),
    exists (
      select 1 from public.withdrawal_security
      where user_id = auth.uid() and keyword_hash is not null
    );
$sec$;

revoke all on function public.withdrawal_security_status() from public;
grant execute on function public.withdrawal_security_status() to authenticated;

-- 5) Keep this in sync: only a real password counts as "set".
create or replace function public.has_withdrawal_password()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $sec$
  select exists (
    select 1 from public.withdrawal_security
    where user_id = auth.uid() and password_hash is not null
  );
$sec$;

revoke all on function public.has_withdrawal_password() from public;
grant execute on function public.has_withdrawal_password() to authenticated;

notify pgrst, 'reload schema';
