-- Admin-only: return the member list (profiles with the member role) for the admin dashboard.
create or replace function public.get_admin_members()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles%rowtype;
begin
  select * into v_admin from public.profiles where id = auth.uid();

  if v_admin.role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  return (
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'member_id', p.member_id,
        'phone', p.phone,
        'role', p.role,
        'wallet_balance', p.wallet_balance,
        'created_at', p.created_at
      )
    )
    from public.profiles p
    where p.role = 'user'
  );
end;
$$;

revoke all on function public.get_admin_members() from public;
grant execute on function public.get_admin_members() to authenticated;
