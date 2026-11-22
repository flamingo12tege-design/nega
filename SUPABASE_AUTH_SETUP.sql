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
    300,
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

notify pgrst, 'reload schema';
