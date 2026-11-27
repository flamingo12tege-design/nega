-- Shared admin check used by the other SQL scripts
-- Run this FIRST in the Supabase SQL Editor. Safe to re-run.
--
-- Several RPCs and RLS policies call public.is_admin(). Without this function,
-- those scripts fail or every admin action returns HTTP 400.

reset role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $admin$
  select coalesce((
    select lower(coalesce(role, '')) = 'admin'
    from public.profiles
    where id = auth.uid()
  ), false);
$admin$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

notify pgrst, 'reload schema';
