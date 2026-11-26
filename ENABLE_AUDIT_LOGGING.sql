-- Enable direct audit logging from the admin console
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- This lets the admin console write audit rows straight into the table
-- without needing a PL/pgSQL function. It also keeps the existing admin read
-- policy so only admins can see the log.

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

drop policy if exists "Admins insert audit logs" on public.admin_audit_logs;
create policy "Admins insert audit logs"
  on public.admin_audit_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, 'user') = 'admin'
    )
  );

notify pgrst, 'reload schema';
