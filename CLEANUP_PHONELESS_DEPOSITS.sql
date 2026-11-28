-- Cleanup: reverse auto-approved deposits from members without a phone number
-- Run this in the Supabase SQL Editor after PHONE_GUARD.sql. Safe to re-run.
--
-- What it does:
--   1. Finds completed recharge/deposit rows with approval_source = 'api'
--      whose profile phone is missing or not a valid Ethiopian number.
--   2. Marks those ledger rows rejected and subtracts the credited amount from
--      the member's wallet balance, floored at zero.
--   3. Rejects any remaining pending recharge/deposit rows from phone-less
--      accounts. No wallet change is made for those because they were never
--      credited.
--   4. Freezes active packages for the affected accounts so no further daily
--      income can be earned from the fake deposit.
--   5. Writes an admin audit row for every change when admin_audit_logs exists.
--
-- It does not delete ledger rows, so the attack trail is preserved.
-- It does not reverse daily income, referral bonuses or withdrawals already
-- paid out; inspect those separately with the query at the bottom.
--
-- PREVIEW BEFORE RUNNING:
--   select l.id, l.user_id, p.member_id, p.phone, l.amount, l.status,
--          l.approval_source, l.transaction_ref, l.created_at
--   from public.wallet_ledger l
--   join public.profiles p on p.id = l.user_id
--   where l.type in ('recharge', 'deposit')
--     and public.normalized_ethiopian_phone(p.phone) is null
--     and (
--       (l.status = 'completed' and lower(coalesce(l.approval_source, '')) = 'api')
--       or l.status = 'pending'
--     )
--   order by l.created_at desc;

-- Supabase SQL Editor may be impersonating "authenticated".
-- Reset to the session owner (session_user = postgres) so DDL is allowed.
reset role;

alter table public.wallet_ledger
  add column if not exists approval_source text;

-- Standalone helpers so this file works even if PHONE_GUARD.sql was not rerun.
create or replace function public.normalized_ethiopian_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $cleanup$
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
$cleanup$;

create or replace function public.has_valid_deposit_phone(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $cleanup$
  select coalesce((
    select public.normalized_ethiopian_phone(p.phone) is not null
    from public.profiles p
    where p.id = p_user_id
  ), false);
$cleanup$;

create or replace function public.cleanup_phoneless_api_deposits()
returns jsonb
language plpgsql
security definer
set search_path = public
as $cleanup$
declare
  v_row record;
  v_balance_before numeric;
  v_balance_after numeric;
  v_count int;
  v_reversed int := 0;
  v_reversed_amount numeric := 0;
  v_pending_rejected int := 0;
  v_packages_frozen int := 0;
begin
  -- 1) Completed API-approved deposits from phone-less accounts.
  for v_row in
    select l.id, l.user_id, l.amount, p.member_id, p.phone
    from public.wallet_ledger l
    join public.profiles p on p.id = l.user_id
    where l.type in ('recharge', 'deposit')
      and l.status = 'completed'
      and lower(coalesce(l.approval_source, '')) = 'api'
      and public.normalized_ethiopian_phone(p.phone) is null
    order by l.created_at
    for update of l
  loop
    select wallet_balance into v_balance_before
    from public.profiles
    where id = v_row.user_id
    for update;

    v_balance_after := greatest(
      0,
      coalesce(v_balance_before, 0) - coalesce(v_row.amount, 0)
    );

    update public.profiles
    set wallet_balance = v_balance_after
    where id = v_row.user_id;

    update public.wallet_ledger
    set status = 'rejected',
        description = btrim(
          coalesce(description, '') || ' | reversed: member has no valid phone'
        )
    where id = v_row.id
      and status = 'completed';

    if found then
      v_reversed := v_reversed + 1;
      v_reversed_amount := v_reversed_amount + coalesce(v_row.amount, 0);

      if to_regclass('public.admin_audit_logs') is not null then
        insert into public.admin_audit_logs (
          admin_id, action, target_table, target_type, target_id,
          member_id, metadata
        ) values (
          auth.uid(),
          'deposit.cleanup.reversed',
          'wallet_ledger',
          'deposit',
          v_row.id::text,
          v_row.member_id,
          jsonb_build_object(
            'amount', v_row.amount,
            'phone', v_row.phone,
            'approval_source', 'api',
            'balance_before', v_balance_before,
            'balance_after', v_balance_after
          )
        );
      end if;
    end if;
  end loop;

  -- 2) Pending phone-less deposits are rejected. They were never credited.
  for v_row in
    select l.id, l.user_id, l.amount, p.member_id, p.phone
    from public.wallet_ledger l
    join public.profiles p on p.id = l.user_id
    where l.type in ('recharge', 'deposit')
      and l.status = 'pending'
      and public.normalized_ethiopian_phone(p.phone) is null
    order by l.created_at
    for update of l
  loop
    update public.wallet_ledger
    set status = 'rejected',
        description = btrim(
          coalesce(description, '') || ' | rejected: member has no valid phone'
        )
    where id = v_row.id
      and status = 'pending';

    if found then
      v_pending_rejected := v_pending_rejected + 1;

      if to_regclass('public.admin_audit_logs') is not null then
        insert into public.admin_audit_logs (
          admin_id, action, target_table, target_type, target_id,
          member_id, metadata
        ) values (
          auth.uid(),
          'deposit.cleanup.rejected',
          'wallet_ledger',
          'deposit',
          v_row.id::text,
          v_row.member_id,
          jsonb_build_object(
            'amount', v_row.amount,
            'phone', v_row.phone,
            'status_before', 'pending'
          )
        );
      end if;
    end if;
  end loop;

  -- 3) Freeze packages on those accounts so the fake money cannot keep earning.
  for v_row in
    select distinct l.user_id, p.member_id
    from public.wallet_ledger l
    join public.profiles p on p.id = l.user_id
    where l.type in ('recharge', 'deposit')
      and lower(coalesce(l.approval_source, '')) = 'api'
      and public.normalized_ethiopian_phone(p.phone) is null
  loop
    update public.purchases
    set status = 'rejected'
    where user_id = v_row.user_id
      and lower(coalesce(status, '')) in ('approved', 'completed');

    get diagnostics v_count = row_count;

    if v_count > 0 then
      v_packages_frozen := v_packages_frozen + v_count;

      if to_regclass('public.admin_audit_logs') is not null then
        insert into public.admin_audit_logs (
          admin_id, action, target_table, target_type, member_id, metadata
        ) values (
          auth.uid(),
          'package.cleanup.frozen',
          'purchases',
          'package',
          v_row.member_id,
          jsonb_build_object('packages_frozen', v_count)
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'deposits_reversed', v_reversed,
    'amount_reversed', v_reversed_amount,
    'pending_deposits_rejected', v_pending_rejected,
    'packages_frozen', v_packages_frozen
  );
end;
$cleanup$;

-- Manual cleanup only. Do not expose this to the browser.
revoke all on function public.cleanup_phoneless_api_deposits() from public;
revoke all on function public.cleanup_phoneless_api_deposits() from authenticated;

notify pgrst, 'reload schema';

-- Run the cleanup:
select public.cleanup_phoneless_api_deposits();

-- Inspect any payouts that were already earned before cleanup:
--   select l.type, l.amount, l.status, l.description, l.created_at,
--          p.member_id, p.phone
--   from public.wallet_ledger l
--   join public.profiles p on p.id = l.user_id
--   where public.normalized_ethiopian_phone(p.phone) is null
--     and l.type in ('daily_income', 'withdrawal', 'recruitment_bonus',
--                    'team_commission', 'lucky_wheel')
--   order by l.created_at desc;
