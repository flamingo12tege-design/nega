-- Add missing columns to an existing admin_audit_logs table
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes: "column target_table of relation admin_audit_logs does not exist"
--
-- Your audit table already exists but was created with a different schema.
-- This adds every column the audit RPCs may use, without recreating the table.

alter table public.admin_audit_logs add column if not exists admin_id uuid references auth.users (id) on delete set null;
alter table public.admin_audit_logs add column if not exists admin_email text;
alter table public.admin_audit_logs add column if not exists action text not null default 'unknown';
alter table public.admin_audit_logs add column if not exists target_table text;
alter table public.admin_audit_logs add column if not exists target_type text;
alter table public.admin_audit_logs add column if not exists target_id text;
alter table public.admin_audit_logs add column if not exists member_id text;
alter table public.admin_audit_logs add column if not exists ip_address text;
alter table public.admin_audit_logs add column if not exists user_agent text;
alter table public.admin_audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.admin_audit_logs add column if not exists created_at timestamptz not null default now();

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

notify pgrst, 'reload schema';
