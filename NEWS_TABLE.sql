-- News / announcements
-- Run this once in the Supabase SQL Editor. Safe to re-run.

reset role;

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  tag text not null default 'Announcement',
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists news_created_at_idx on public.news(created_at desc);

alter table public.news enable row level security;

drop policy if exists "News is public" on public.news;
create policy "News is public"
  on public.news
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage news" on public.news;
create policy "Admins manage news"
  on public.news
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
