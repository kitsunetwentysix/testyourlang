-- Legal English: схема базы данных Supabase.
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить всё → Run.

-- Прогресс пользователя: одна строка на аккаунт
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  stats      jsonb not null default '{}'::jsonb,  -- по каждому слову: сколько верно/неверно и последний ответ
  best       jsonb not null default '{}'::jsonb,  -- лучший процент по теме и направлению
  prefs      jsonb not null default '{}'::jsonb,  -- последние выбранные настройки теста
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "progress: read own" on public.progress;
create policy "progress: read own" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "progress: insert own" on public.progress;
create policy "progress: insert own" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "progress: update own" on public.progress;
create policy "progress: update own" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- История пройденных тестов: одна строка на каждый завершённый тест
create table if not exists public.attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id   text not null,
  direction  text not null check (direction in ('en-ru', 'ru-en')),
  total      int  not null check (total > 0),
  correct    int  not null check (correct between 0 and total),
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);

alter table public.attempts enable row level security;

drop policy if exists "attempts: read own" on public.attempts;
create policy "attempts: read own" on public.attempts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "attempts: insert own" on public.attempts;
create policy "attempts: insert own" on public.attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);
