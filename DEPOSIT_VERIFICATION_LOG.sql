-- Deposit verification failure log
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- When a CBE deposit reference is definitively rejected by the verifier the
-- member sees the error and no pending deposit is created. This table records
-- that failed attempt so admins can audit it. When the verifier is simply
-- unreachable (transient failure) the deposit still goes to manual review and
-- is logged here with outcome = 'manual_review'.
--
-- Deposit-only by design: nothing here is used for withdrawals.

create table if not exists public.deposit_verification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null default 0,
  transaction_ref text,
  proof_url text,
  reason text,
  outcome text not null default 'rejected'
    check (outcome in ('rejected', 'manual_review')),
  created_at timestamptz not null default now()
);

alter table public.deposit_verification_logs enable row level security;

drop policy if exists "Admins read deposit verification logs" on public.deposit_verification_logs;
create policy "Admins read deposit verification logs"
  on public.deposit_verification_logs
  for select
  to authenticated
  using (public.is_admin());

-- Members cannot insert directly; the RPC stamps user_id = auth.uid().
create or replace function public.log_deposit_verification_failure(
  p_amount numeric,
  p_transaction_ref text,
  p_reason text,
  p_proof_url text default null,
  p_outcome text default 'rejected'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.deposit_verification_logs (
    user_id, amount, transaction_ref, proof_url, reason, outcome
  ) values (
    v_user_id,
    coalesce(p_amount, 0),
    nullif(btrim(coalesce(p_transaction_ref, '')), ''),
    nullif(btrim(coalesce(p_proof_url, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), ''),
    case when p_outcome = 'manual_review' then 'manual_review' else 'rejected' end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_deposit_verification_failure(numeric, text, text, text, text) from public;
grant execute on function public.log_deposit_verification_failure(numeric, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
