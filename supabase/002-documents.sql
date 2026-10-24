-- Legal English: личные документы и темы.
-- Выполнить один раз после schema.sql: Supabase → SQL Editor → New query → вставить всё → Run.
-- Пока пользователи только читают: документы добавляются из SQL Editor или скриптом с service role.

-- Документ — учебник или файл; у каждого свой владелец
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists documents_owner_idx on public.documents (owner_id);

-- Тема (урок) внутри документа. id — текст: по нему хранится прогресс (topicId|термин), менять нельзя.
-- owner_id повторяет владельца документа, чтобы политика доступа не делала join.
create table if not exists public.topics (
  id          text primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  position    int  not null default 0,
  title       text not null,
  description text not null default '',
  words       jsonb not null check (jsonb_typeof(words) = 'array'),  -- [{ en: [...], ru: [...], note }]
  created_at  timestamptz not null default now()
);
create index if not exists topics_document_idx on public.topics (document_id, position);
create index if not exists topics_owner_idx on public.topics (owner_id);

-- Доступ к чужой теме: получатель видит тему, но не владеет копией —
-- если тему удалят (например, по жалобе), она пропадёт у всех.
create table if not exists public.topic_access (
  topic_id   text not null references public.topics (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);
create index if not exists topic_access_user_idx on public.topic_access (user_id);

alter table public.documents    enable row level security;
alter table public.topics       enable row level security;
alter table public.topic_access enable row level security;

-- Клиентам — только чтение; anon не видит ничего
revoke all on public.documents, public.topics, public.topic_access from anon, authenticated;
grant select on public.documents, public.topics, public.topic_access to authenticated;

drop policy if exists "topic_access: read own" on public.topic_access;
create policy "topic_access: read own" on public.topic_access
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "topics: read own or granted" on public.topics;
create policy "topics: read own or granted" on public.topics
  for select to authenticated using (
    (select auth.uid()) = owner_id
    or exists (select 1 from public.topic_access a where a.topic_id = topics.id and a.user_id = (select auth.uid()))
  );

-- Документ виден владельцу и тем, кому открыта хотя бы одна его тема
drop policy if exists "documents: read own or granted" on public.documents;
create policy "documents: read own or granted" on public.documents
  for select to authenticated using (
    (select auth.uid()) = owner_id
    or exists (
      select 1 from public.topics t
      join public.topic_access a on a.topic_id = t.id
      where t.document_id = documents.id and a.user_id = (select auth.uid())
    )
  );
