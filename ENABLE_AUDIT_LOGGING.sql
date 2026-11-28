-- Lock the admin audit log
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Audit rows must only be written through log_admin_action(), which stamps
-- identity, IP, user agent and time server-side. Direct client inserts are
-- removed, and existing rows cannot be edited or deleted.

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

-- No direct INSERT policy: clients must call log_admin_action().
drop policy if exists "Admins insert audit logs" on public.admin_audit_logs;

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $audit$
begin
  raise exception 'Audit rows are immutable';
end;
$audit$;

drop trigger if exists admin_audit_immutable on public.admin_audit_logs;
create trigger admin_audit_immutable
before update or delete on public.admin_audit_logs
for each row execute function public.reject_audit_mutation();

notify pgrst, 'reload schema';
