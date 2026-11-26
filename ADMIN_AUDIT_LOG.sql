-- Admin audit log
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Records every admin action (sign-in, sign-out, deposit/withdrawal reviews,
-- package approvals, balance adjustments, settings changes) together with the
-- admin email, IP address, browser/device and a timestamp.
--
-- The IP and user agent are read server-side from the request headers that
-- Supabase's API gateway forwards, so the browser cannot spoof them through the
-- RPC arguments.

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text,
  action text not null,
  target_type text,
  target_id text,
  member_id text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_admin_id_idx
  on public.admin_audit_logs (admin_id);

alter table public.admin_audit_logs enable row level security;

-- Admins can read the log from the client. Writes only happen through the
-- security-definer RPC below, so no insert/update/delete policies exist.
drop policy if exists "Admins read audit logs" on public.admin_audit_logs;
create policy "Admins read audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, 'user') = 'admin'
    )
  );

-- Write an audit entry for the signed-in admin.
-- The client passes only what happened; identity, IP, device and time are
-- stamped by the database.
create or replace function public.log_admin_action(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_member_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_email text;
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
  v_user_agent text;
  v_id uuid;
begin
  if v_admin is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_admin
      and coalesce(role, 'user') = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_admin;

  -- Supabase exposes the proxied request headers here. Guard the cast so a
  -- malformed header payload can never block the audit write.
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := coalesce(
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(btrim(coalesce(v_headers ->> 'x-real-ip', '')), ''),
    nullif(btrim(coalesce(v_headers ->> 'cf-connecting-ip', '')), ''),
    'unknown'
  );

  v_user_agent := left(coalesce(v_headers ->> 'user-agent', ''), 512);

  insert into public.admin_audit_logs (
    admin_id, admin_email, action, target_type, target_id, member_id,
    ip_address, user_agent, metadata
  ) values (
    v_admin,
    v_email,
    coalesce(nullif(btrim(p_action), ''), 'unknown'),
    nullif(btrim(coalesce(p_target_type, '')), ''),
    nullif(btrim(coalesce(p_target_id, '')), ''),
    nullif(btrim(coalesce(p_member_id, '')), ''),
    v_ip,
    nullif(v_user_agent, ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_admin_action(text, text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, text, jsonb) to authenticated;

-- Read the newest audit entries for the admin console.
create or replace function public.get_admin_audit_logs(p_limit integer default 100)
returns table (
  id uuid,
  admin_id uuid,
  admin_email text,
  action text,
  target_type text,
  target_id text,
  member_id text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and coalesce(role, 'user') = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  return query
    select
      l.id,
      l.admin_id,
      l.admin_email,
      l.action,
      l.target_type,
      l.target_id,
      l.member_id,
      l.ip_address,
      l.user_agent,
      l.metadata,
      l.created_at
    from public.admin_audit_logs l
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.get_admin_audit_logs(integer) from public;
grant execute on function public.get_admin_audit_logs(integer) to authenticated;

notify pgrst, 'reload schema';
