-- Withdrawal approval audit fix
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes: "Could not approve withdrawal — relation public.admin_audit_logs does not exist"
--
-- The withdrawal RPCs used to write an audit row directly. If the audit table
-- had not been created yet, the whole approval failed even though the withdrawal
-- itself was valid. Now audit logging is best-effort: a missing table, missing
-- RPC or malformed metadata can never block a withdrawal again.

-- 1) Make sure the audit table exists and is readable only by admins.
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

-- 2) Audit writer that never fails when the table is unavailable.
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
as $cas$
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
    select 1 from public.profiles
    where id = v_admin and coalesce(role, 'user') = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  -- Best effort: no table means no audit row, but never break the action.
  if to_regclass('public.admin_audit_logs') is null then
    return null;
  end if;

  v_email := (select u.email from auth.users u where u.id = v_admin);

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
$cas$;

revoke all on function public.log_admin_action(text, text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, text, jsonb) to authenticated;

-- 3) Rebuild approval with guarded audit logging.
create or replace function public.approve_withdrawal(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $cas$
declare
  v_row public.wallet_ledger%rowtype;
  v_balance numeric;
  v_fee_percent numeric := coalesce((
    select nullif(value, '')::numeric
    from public.platform_settings
    where key = 'withdrawal_fee_percent'
  ), 10);
  v_fee numeric;
  v_net numeric;
  v_found boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  for v_row in
    select *
    from public.wallet_ledger
    where id = p_ledger_id
      and type = 'withdrawal'
      and status = 'pending'
    for update
  loop
    v_found := true;

    v_balance := (
      select wallet_balance
      from public.profiles
      where id = v_row.user_id
      for update
    );

    if v_balance < abs(v_row.amount) then
      raise exception 'Insufficient balance';
    end if;

    -- The member is debited the requested gross amount; CAS keeps the fee and
    -- the admin pays out the net amount.
    v_fee := round(abs(v_row.amount) * v_fee_percent / 100);
    v_net := abs(v_row.amount) - v_fee;

    update public.profiles
    set wallet_balance = wallet_balance - abs(v_row.amount)
    where id = v_row.user_id;

    update public.wallet_ledger
    set status = 'completed', amount = -abs(v_row.amount)
    where id = p_ledger_id;

    begin
      perform public.log_admin_action(
        'withdrawal.approved',
        'wallet_ledger',
        p_ledger_id::text,
        null,
        jsonb_build_object(
          'amount', abs(v_row.amount),
          'fee', v_fee,
          'payout', v_net,
          'user_id', v_row.user_id
        )
      );
    exception when others then
      null;
    end;

    return v_net;
  end loop;

  raise exception 'Withdrawal already processed or not found';
end;
$cas$;

create or replace function public.reject_withdrawal(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $cas$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.wallet_ledger
  set status = 'rejected'
  where id = p_ledger_id
    and type = 'withdrawal'
    and status = 'pending';

  if not found then
    raise exception 'Withdrawal already processed or not found';
  end if;

  begin
    perform public.log_admin_action(
      'withdrawal.rejected',
      'wallet_ledger',
      p_ledger_id::text,
      null,
      jsonb_build_object()
    );
  exception when others then
    null;
  end;
end;
$cas$;

revoke all on function public.approve_withdrawal(uuid) from public;
revoke all on function public.reject_withdrawal(uuid) from public;
grant execute on function public.approve_withdrawal(uuid) to authenticated;
grant execute on function public.reject_withdrawal(uuid) to authenticated;

-- 4) Keep the audit viewer working even before the table exists.
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
as $cas$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and coalesce(role, 'user') = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  if to_regclass('public.admin_audit_logs') is null then
    return;
  end if;

  return query
    select
      l.id, l.admin_id, l.admin_email, l.action, l.target_type, l.target_id,
      l.member_id, l.ip_address, l.user_agent, l.metadata, l.created_at
    from public.admin_audit_logs l
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$cas$;

revoke all on function public.get_admin_audit_logs(integer) from public;
grant execute on function public.get_admin_audit_logs(integer) to authenticated;

notify pgrst, 'reload schema';
