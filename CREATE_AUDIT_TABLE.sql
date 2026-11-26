-- Create the admin audit log table (minimal fix)
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- This fixes: "Could not approve withdrawal — relation public.admin_audit_logs does not exist"
--
-- No functions or dollar-quoted strings are included here, so the Supabase SQL
-- editor cannot mangle the script. Once this table exists, the existing
-- approval RPC can write its audit row successfully.

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text,
  action text not null,
  target_table text,
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

notify pgrst, 'reload schema';
