-- Delete attack accounts created without a valid phone number
-- Run this in the Supabase SQL Editor. DESTRUCTIVE AND IRREVERSIBLE.
--
-- Only non-admin accounts whose public.profiles.phone is missing or is not a
-- valid Ethiopian number are deleted. Admin accounts are always protected.
--
-- This deletes the auth user and all related app rows:
--   wallet_ledger, purchases, gift_code_redemptions, lucky_wheel_spins,
--   deposit_verification_logs, withdrawal_security, and profiles.
--
-- Supabase does not allow direct DELETE from storage.objects. Recharge proof
-- files are therefore left in storage (they become orphaned and are not linked
-- to any account). Delete those separately through the Storage API if needed.
--
-- An audit summary is written to public.admin_audit_logs before deletion.
--
-- PREVIEW BEFORE RUNNING:
--   select p.id, p.member_id, p.phone, p.role, p.wallet_balance,
--          u.email, u.created_at
--   from public.profiles p
--   left join auth.users u on u.id = p.id
--   where public.normalized_ethiopian_phone(p.phone) is null
--     and lower(coalesce(p.role, '')) <> 'admin'
--   order by u.created_at desc;
--
-- To limit the cleanup to a time window, replace the final call with e.g.:
--   select public.delete_phoneless_users(now() - interval '2 days');

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

-- Standalone helper so this file works even if PHONE_GUARD.sql was not rerun.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $delete$
declare
  v_phone text := regexp_replace(btrim(coalesce(p_phone, '')), '[^0-9+]', '', 'g');
begin
  if v_phone ~ '^\+251[79][0-9]{8}$' then
    return v_phone;
  elsif v_phone ~ '^251[79][0-9]{8}$' then
    return '+' || v_phone;
  elsif v_phone ~ '^0[79][0-9]{8}$' then
    return '+251' || substring(v_phone from 2);
  end if;
  return null;
end;
$delete$;

create or replace function public.delete_phoneless_users(
  p_created_after timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $delete$
declare
  v_target uuid[];
  v_deleted_ledger int := 0;
  v_deleted_purchases int := 0;
  v_deleted_redemptions int := 0;
  v_deleted_spins int := 0;
  v_deleted_logs int := 0;
  v_deleted_security int := 0;
  v_deleted_proofs int := 0;
  v_count int;
begin
  select coalesce(array_agg(p.id), '{}'::uuid[])
  into v_target
  from public.profiles p
  where public.normalized_ethiopian_phone(p.phone) is null
    and lower(coalesce(p.role, '')) <> 'admin'
    and (p_created_after is null or p.created_at >= p_created_after);

  if cardinality(v_target) = 0 then
    return jsonb_build_object('deleted_users', 0, 'message', 'No phone-less non-admin accounts found');
  end if;

  -- Keep a summary before the rows disappear.
  if to_regclass('public.admin_audit_logs') is not null then
    insert into public.admin_audit_logs (
      admin_id, action, target_table, target_type, target_id, metadata
    ) values (
      auth.uid(),
      'member.cleanup.deleted',
      'auth.users',
      'user',
      array_to_string(v_target, ','),
      jsonb_build_object(
        'deleted_users', cardinality(v_target),
        'created_after', p_created_after,
        'reason', 'No valid Ethiopian phone number'
      )
    );
  end if;

  -- Direct deletes from storage.objects are blocked by Supabase.
  -- Count the proof paths before the ledger rows disappear, then leave the
  -- files in storage for a separate Storage API cleanup.
  select count(distinct proof_url)
  into v_deleted_proofs
  from public.wallet_ledger
  where user_id = any (v_target)
    and proof_url is not null;

  delete from public.wallet_ledger where user_id = any (v_target);
  get diagnostics v_deleted_ledger = row_count;

  delete from public.purchases where user_id = any (v_target);
  get diagnostics v_deleted_purchases = row_count;

  if to_regclass('public.gift_code_redemptions') is not null then
    execute 'delete from public.gift_code_redemptions where user_id = any ($1)' using v_target;
    get diagnostics v_deleted_redemptions = row_count;
  end if;

  if to_regclass('public.lucky_wheel_spins') is not null then
    execute 'delete from public.lucky_wheel_spins where user_id = any ($1)' using v_target;
    get diagnostics v_deleted_spins = row_count;
  end if;

  if to_regclass('public.deposit_verification_logs') is not null then
    execute 'delete from public.deposit_verification_logs where user_id = any ($1)' using v_target;
    get diagnostics v_deleted_logs = row_count;
  end if;

  if to_regclass('public.withdrawal_security') is not null then
    execute 'delete from public.withdrawal_security where user_id = any ($1)' using v_target;
    get diagnostics v_deleted_security = row_count;
  end if;

  delete from public.profiles where id = any (v_target);
  get diagnostics v_count = row_count;

  delete from auth.users where id = any (v_target);

  return jsonb_build_object(
    'deleted_users', cardinality(v_target),
    'wallet_ledger_rows', v_deleted_ledger,
    'purchases', v_deleted_purchases,
    'gift_redemptions', v_deleted_redemptions,
    'lucky_wheel_spins', v_deleted_spins,
    'verification_logs', v_deleted_logs,
    'withdrawal_security_rows', v_deleted_security,
    'profiles', v_count,
    'proof_files_skipped', v_deleted_proofs
  );
end;
$delete$;

-- Manual cleanup only. Never expose this to the browser.
revoke all on function public.delete_phoneless_users(timestamptz) from public;
revoke all on function public.delete_phoneless_users(timestamptz) from authenticated;

notify pgrst, 'reload schema';

-- Delete all phone-less non-admin accounts:
select public.delete_phoneless_users();
