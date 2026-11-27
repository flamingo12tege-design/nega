-- Admin member list RPC
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes the HTTP 400 caused by a stale function returning a different shape:
-- the function is dropped before it is recreated, DDL runs as the session owner,
-- and PostgREST is asked to reload its schema cache at the end.

reset role;

drop function if exists public.get_admin_members();

create or replace function public.get_admin_members()
returns jsonb
language plpgsql
security definer
set search_path = public
as $admin$
declare
  v_role text;
begin
  select lower(coalesce(role, '')) into v_role
  from public.profiles
  where id = auth.uid();

  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Admin access required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'member_id', p.member_id,
        'phone', p.phone,
        'role', p.role,
        'wallet_balance', p.wallet_balance,
        'created_at', p.created_at
      )
      order by p.created_at desc
    )
    from public.profiles p
    where lower(coalesce(p.role, '')) = 'user'
  ), '[]'::jsonb);
end;
$admin$;

revoke all on function public.get_admin_members() from public;
grant execute on function public.get_admin_members() to authenticated;

notify pgrst, 'reload schema';
