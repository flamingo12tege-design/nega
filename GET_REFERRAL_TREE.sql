-- Team tree RPC: returns the caller's A / B / C downline as JSON.
-- Run this once in the Supabase SQL Editor. It only creates a read-only
-- function (no schema changes) and is safe to re-run.

reset role;

create or replace function public.get_referral_tree()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with recursive
  me as (
    select
      p.id,
      upper(regexp_replace(coalesce(p.member_id, ''), '[^a-zA-Z0-9]', '', 'g')) as my_code
    from public.profiles p
    where p.id = auth.uid()
  ),
  downline as (
    -- Level A: direct recruits (their referral_code is my shareable code)
    select p.id, p.member_id, p.created_at, 1 as level
    from public.profiles p
    join me on true
    where me.my_code <> ''
      and p.id <> me.id
      and upper(btrim(coalesce(p.referral_code, ''))) = me.my_code

    union all

    -- Levels B and C: recruits of recruits
    select p.id, p.member_id, p.created_at, d.level + 1
    from public.profiles p
    join downline d
      on upper(btrim(coalesce(p.referral_code, ''))) =
         upper(regexp_replace(coalesce(d.member_id, ''), '[^a-zA-Z0-9]', '', 'g'))
    where d.level < 3
      and p.id <> d.id
  ),
  downline_unique as (
    -- A member could be reachable by more than one path; keep the closest level.
    select distinct on (id) id, member_id, created_at, level
    from downline
    order by id, level
  ),
  members as (
    select
      d.id,
      d.member_id,
      d.created_at as joined,
      d.level,
      best.tier,
      best.price,
      best.daily_payout,
      first_purchase.first_active
    from downline_unique d
    -- Best (highest-tier) approved package owned by the member.
    left join lateral (
      select pk.tier, pk.price, pk.daily_payout
      from public.purchases pu
      join public.packages pk on pk.id = pu.package_id
      where pu.user_id = d.id
        and lower(pu.status) = 'approved'
      order by pk.tier desc, pu.created_at asc
      limit 1
    ) best on true
    -- First approved purchase, used for the 45-day payout window.
    left join lateral (
      select min(pu.created_at) as first_active
      from public.purchases pu
      where pu.user_id = d.id
        and lower(pu.status) = 'approved'
    ) first_purchase on true
  )
  select jsonb_build_object(
    'inviter_vip', coalesce((
      select max(pk.tier)
      from public.purchases pu
      join public.packages pk on pk.id = pu.package_id
      where pu.user_id = auth.uid()
        and lower(pu.status) = 'approved'
    ), 0),
    'members', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'member_id', m.member_id,
            'level', m.level,
            'vip', coalesce(m.tier, 0),
            'package_price', coalesce(m.price, 0),
            'daily_income', coalesce(m.daily_payout, 0),
            'days_active',
              case
                when m.first_active is null then 0
                else greatest(0, floor(extract(epoch from (now() - m.first_active)) / 86400))::int
              end,
            'status',
              case when m.first_active is null then 'Pending' else 'Active' end,
            'joined', m.joined
          )
          order by m.level, m.joined
        )
        from members m
      ),
      '[]'::jsonb
    )
  );
$$;

-- Only signed-in users may call it; it never exposes anyone outside the caller's chain.
revoke all on function public.get_referral_tree() from public;
grant execute on function public.get_referral_tree() to authenticated;

notify pgrst, 'reload schema';
