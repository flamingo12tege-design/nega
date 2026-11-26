-- Run this in Supabase SQL Editor

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_member_id text;
begin
  generated_member_id := coalesce(
    new.raw_user_meta_data->>'member_id',
    'CAS-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0')
  );

  insert into public.profiles (
    id,
    member_id,
    phone,
    role,
    wallet_balance,
    referral_code
  )
  values (
    new.id,
    generated_member_id,
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    'user',
    0,
    new.raw_user_meta_data->>'referral_code'
  )
  on conflict (id) do update set
    member_id = excluded.member_id,
    phone = coalesce(excluded.phone, public.profiles.phone);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Recharge proof fields
alter table public.wallet_ledger
  add column if not exists transaction_ref text,
  add column if not exists proof_url text,
  add column if not exists description text;

-- Recharge requests use wallet_ledger with status='pending' and type='recharge'.
-- Purchase users can only create pending recharge entries.
drop policy if exists "Users create recharge requests" on public.wallet_ledger;
create policy "Users create recharge requests"
on public.wallet_ledger
for insert
to authenticated
with check (
  user_id = auth.uid()
  and type = 'recharge'
  and status = 'pending'
);

-- Users can read their own ledger. Admin policy may require an admin role.
drop policy if exists "Users read own ledger" on public.wallet_ledger;
create policy "Users read own ledger"
on public.wallet_ledger
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Secure purchase: checks wallet balance, debits once, and creates an approved purchase.
create or replace function public.purchase_package(p_package_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_price numeric;
  v_purchase_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select price into v_price
  from public.packages
  where id = p_package_id
    and locked = false;

  if v_price is null then
    raise exception 'Package unavailable';
  end if;

  select wallet_balance into v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile not found';
  end if;

  if v_balance < v_price then
    raise exception 'Insufficient balance';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance - v_price
  where id = v_user_id;

  insert into public.purchases(
    user_id, package_id, amount, payment_method, status
  ) values (
    v_user_id, p_package_id, v_price, 'Wallet balance', 'approved'
  ) returning id into v_purchase_id;

  insert into public.wallet_ledger(
    user_id, amount, type, reference_id, status, description
  ) values (
    v_user_id, -v_price, 'purchase', v_purchase_id, 'completed', 'Package purchase'
  );

  return v_purchase_id;
end;
$$;

revoke all on function public.purchase_package(text) from public;
grant execute on function public.purchase_package(text) to authenticated;

-- Admin approves a pending recharge exactly once.
create or replace function public.approve_recharge(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_ledger%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_row
  from public.wallet_ledger
  where id = p_ledger_id
    and type = 'recharge'
    and status = 'pending'
  for update;

  if v_row.id is null then
    raise exception 'Recharge already processed or not found';
  end if;

  update public.wallet_ledger
  set status = 'completed'
  where id = p_ledger_id;

  update public.profiles
  set wallet_balance = wallet_balance + v_row.amount
  where id = v_row.user_id;

  values (auth.uid(), 'approve_recharge', 'wallet_ledger', p_ledger_id::text,
          jsonb_build_object('amount', v_row.amount, 'user_id', v_row.user_id));

  return v_row.amount;
end;
$$;

create or replace function public.reject_recharge(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.wallet_ledger
  set status = 'rejected'
  where id = p_ledger_id
    and type = 'recharge'
    and status = 'pending';

  if not found then
    raise exception 'Recharge already processed or not found';
  end if;

  values (auth.uid(), 'reject_recharge', 'wallet_ledger', p_ledger_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.approve_recharge(uuid) from public;
revoke all on function public.reject_recharge(uuid) from public;
grant execute on function public.approve_recharge(uuid) to authenticated;
grant execute on function public.reject_recharge(uuid) to authenticated;

-- Private recharge proof storage
insert into storage.buckets(id, name, public)
values ('recharge-proofs', 'recharge-proofs', false)
 on conflict (id) do nothing;

drop policy if exists "Users upload recharge proofs" on storage.objects;
create policy "Users upload recharge proofs"
 on storage.objects for insert to authenticated
 with check (
   bucket_id = 'recharge-proofs'
   and (storage.foldername(name))[1] = auth.uid()::text
 );

drop policy if exists "Users and admins read recharge proofs" on storage.objects;
create policy "Users and admins read recharge proofs"
 on storage.objects for select to authenticated
 using (
   bucket_id = 'recharge-proofs'
   and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
 );

-- Admin approves a pending withdrawal exactly once.
create or replace function public.approve_withdrawal(p_ledger_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_ledger%rowtype;
  v_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_row
  from public.wallet_ledger
  where id = p_ledger_id
    and type = 'withdrawal'
    and status = 'pending'
  for update;

  if v_row.id is null then
    raise exception 'Withdrawal already processed or not found';
  end if;

  select wallet_balance into v_balance
  from public.profiles
  where id = v_row.user_id
  for update;

  if v_balance is null or v_balance < abs(v_row.amount) then
    raise exception 'Insufficient balance';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance - abs(v_row.amount)
  where id = v_row.user_id;

  update public.wallet_ledger
  set status = 'completed', amount = -abs(v_row.amount)
  where id = p_ledger_id;

  -- Best-effort audit. A missing audit table/RPC must never block approval.
  begin
    if exists (
      select 1
      from pg_proc pr
      join pg_namespace ns on ns.oid = pr.pronamespace
      where ns.nspname = 'public' and pr.proname = 'log_admin_action'
    ) then
      perform public.log_admin_action(
        'withdrawal.approved',
        'wallet_ledger',
        p_ledger_id::text,
        null,
        jsonb_build_object('amount', abs(v_row.amount), 'user_id', v_row.user_id)
      );
    end if;
  exception when others then
    null;
  end;

  return abs(v_row.amount);
end;
$$;

create or replace function public.reject_withdrawal(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    if exists (
      select 1
      from pg_proc pr
      join pg_namespace ns on ns.oid = pr.pronamespace
      where ns.nspname = 'public' and pr.proname = 'log_admin_action'
    ) then
      perform public.log_admin_action(
        'withdrawal.rejected',
        'wallet_ledger',
        p_ledger_id::text,
        null,
        '{}'::jsonb
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.approve_withdrawal(uuid) from public;
revoke all on function public.reject_withdrawal(uuid) from public;
grant execute on function public.approve_withdrawal(uuid) to authenticated;
grant execute on function public.reject_withdrawal(uuid) to authenticated;

-- Users may submit pending withdrawals.
drop policy if exists "Users create withdrawal requests" on public.wallet_ledger;
create policy "Users create withdrawal requests"
 on public.wallet_ledger
 for insert to authenticated
 with check (
   user_id = auth.uid()
   and type = 'withdrawal'
   and status = 'pending'
 );

-- Set the production admin account after creating it in Authentication > Users.
update public.profiles
set role = 'admin'
where id in (
  select id
  from auth.users
  where email = 'tegene@tegene.com'
);

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists "Platform settings are public" on public.platform_settings;
create policy "Platform settings are public"
 on public.platform_settings for select
 to anon, authenticated
 using (true);

drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings"
 on public.platform_settings for all
 to authenticated
 using (public.is_admin())
 with check (public.is_admin());

notify pgrst, 'reload schema';