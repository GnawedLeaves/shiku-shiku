-- Shiku Shiku initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  answer_display_mode text not null default 'both'
    check (answer_display_mode in ('romaji', 'hiragana', 'both')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- generic updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- sets
-- ---------------------------------------------------------------------------
create table public.sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  share_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sets_owner_id_idx on public.sets(owner_id);

create trigger sets_set_updated_at
  before update on public.sets
  for each row execute function public.set_updated_at();

alter table public.sets enable row level security;

create policy "sets: select own" on public.sets
  for select using (auth.uid() = owner_id);
create policy "sets: insert own" on public.sets
  for insert with check (auth.uid() = owner_id);
create policy "sets: update own" on public.sets
  for update using (auth.uid() = owner_id);
create policy "sets: delete own" on public.sets
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- groups (groups of cards within a set)
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index groups_set_id_idx on public.groups(set_id);

alter table public.groups enable row level security;

create policy "groups: select via owned set" on public.groups
  for select using (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );
create policy "groups: insert via owned set" on public.groups
  for insert with check (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );
create policy "groups: update via owned set" on public.groups
  for update using (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );
create policy "groups: delete via owned set" on public.groups
  for delete using (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  question text not null,
  answer_hiragana text,
  answer_romaji text,
  answer_kanji text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_has_answer check (
    coalesce(answer_hiragana, '') <> '' or coalesce(answer_romaji, '') <> ''
  )
);

create index cards_set_id_idx on public.cards(set_id);
create index cards_group_id_idx on public.cards(group_id);

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

alter table public.cards enable row level security;

create policy "cards: select via owned set" on public.cards
  for select using (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );
create policy "cards: insert via owned set" on public.cards
  for insert with check (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );
create policy "cards: update via owned set" on public.cards
  for update using (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );
create policy "cards: delete via owned set" on public.cards
  for delete using (
    exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- study_sessions (resumable test-mode sessions, capped at 5 active/paused
-- per user -- enforced in the application layer)
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  scope jsonb not null default '{}'::jsonb,
  queue jsonb not null default '[]'::jsonb,
  current_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index study_sessions_user_id_idx on public.study_sessions(user_id);

create trigger study_sessions_set_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();

alter table public.study_sessions enable row level security;

create policy "study_sessions: select own" on public.study_sessions
  for select using (auth.uid() = user_id);
create policy "study_sessions: insert own" on public.study_sessions
  for insert with check (auth.uid() = user_id);
create policy "study_sessions: update own" on public.study_sessions
  for update using (auth.uid() = user_id);
create policy "study_sessions: delete own" on public.study_sessions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- card_progress (per-user aggregate stats per card)
-- ---------------------------------------------------------------------------
create table public.card_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  times_correct integer not null default 0,
  times_incorrect integer not null default 0,
  last_reviewed_at timestamptz,
  primary key (user_id, card_id)
);

alter table public.card_progress enable row level security;

create policy "card_progress: select own" on public.card_progress
  for select using (auth.uid() = user_id);
create policy "card_progress: insert own" on public.card_progress
  for insert with check (auth.uid() = user_id);
create policy "card_progress: update own" on public.card_progress
  for update using (auth.uid() = user_id);
create policy "card_progress: delete own" on public.card_progress
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- session_results (completed-session scores; feeds the future scoreboard)
-- ---------------------------------------------------------------------------
create table public.session_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.study_sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid references public.sets(id) on delete set null,
  score_percentage numeric(5, 2) not null,
  completed_at timestamptz not null default now()
);

create index session_results_user_id_idx on public.session_results(user_id);
create index session_results_set_id_idx on public.session_results(set_id);

alter table public.session_results enable row level security;

create policy "session_results: select own" on public.session_results
  for select using (auth.uid() = user_id);
create policy "session_results: insert own" on public.session_results
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- import_shared_set: copies a shared set (+ its groups & cards) into the
-- caller's own library. SECURITY DEFINER so the importer can read a set they
-- don't own, scoped strictly to sets that have a matching share_code.
-- ---------------------------------------------------------------------------
create or replace function public.import_shared_set(p_share_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_set public.sets%rowtype;
  v_new_set_id uuid;
  v_group_map jsonb := '{}'::jsonb;
  r record;
  v_new_group_id uuid;
begin
  if p_share_code is null or p_share_code = '' then
    raise exception 'Share code is required';
  end if;

  select * into v_source_set from public.sets where share_code = p_share_code;
  if not found then
    raise exception 'Invalid share code';
  end if;

  insert into public.sets (owner_id, name, description)
  values (auth.uid(), v_source_set.name, v_source_set.description)
  returning id into v_new_set_id;

  for r in select * from public.groups where set_id = v_source_set.id loop
    insert into public.groups (set_id, name)
    values (v_new_set_id, r.name)
    returning id into v_new_group_id;
    v_group_map := v_group_map || jsonb_build_object(r.id::text, v_new_group_id::text);
  end loop;

  insert into public.cards (
    set_id, group_id, question, answer_hiragana, answer_romaji, answer_kanji, notes
  )
  select
    v_new_set_id,
    case when c.group_id is not null
      then (v_group_map ->> c.group_id::text)::uuid
      else null
    end,
    c.question, c.answer_hiragana, c.answer_romaji, c.answer_kanji, c.notes
  from public.cards c
  where c.set_id = v_source_set.id;

  return v_new_set_id;
end;
$$;

grant execute on function public.import_shared_set(text) to authenticated;

-- ---------------------------------------------------------------------------
-- copy_cards_into_set: copies selected cards (and, optionally, the groups
-- they belong to) from one of the caller's sets into another of their sets.
-- ---------------------------------------------------------------------------
create or replace function public.copy_cards_into_set(p_card_ids uuid[], p_target_set_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_map jsonb := '{}'::jsonb;
  r record;
  v_new_group_id uuid;
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.sets where id = p_target_set_id and owner_id = auth.uid()
  ) then
    raise exception 'Target set not found or not owned by caller';
  end if;

  for r in
    select distinct g.id, g.name
    from public.cards c
    join public.groups g on g.id = c.group_id
    join public.sets s on s.id = c.set_id
    where c.id = any(p_card_ids) and s.owner_id = auth.uid()
  loop
    insert into public.groups (set_id, name)
    values (p_target_set_id, r.name)
    returning id into v_new_group_id;
    v_group_map := v_group_map || jsonb_build_object(r.id::text, v_new_group_id::text);
  end loop;

  insert into public.cards (
    set_id, group_id, question, answer_hiragana, answer_romaji, answer_kanji, notes
  )
  select
    p_target_set_id,
    case when c.group_id is not null
      then (v_group_map ->> c.group_id::text)::uuid
      else null
    end,
    c.question, c.answer_hiragana, c.answer_romaji, c.answer_kanji, c.notes
  from public.cards c
  join public.sets s on s.id = c.set_id
  where c.id = any(p_card_ids) and s.owner_id = auth.uid();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.copy_cards_into_set(uuid[], uuid) to authenticated;
