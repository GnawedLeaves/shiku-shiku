-- Shiku Shiku -- feature migration 2
--
-- Adds: profile pictures + PDF template preference, card<->group tagging via a
-- junction table, richer study history, a friend system, shared-set
-- scoreboards, battle room skeletons, and a single-roundtrip grading function
-- that replaces the chatty per-swipe writes.
--
-- Safe to run on a database created by 0001_init.sql. Run it in the Supabase
-- SQL editor (or `supabase db push`).

-- ---------------------------------------------------------------------------
-- profiles: avatar, public handle, PDF import preference
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists username text,
  add column if not exists pdf_template_id text not null default 'sasa-japanese';

create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

-- Friend search, scoreboards and battle lobbies all need to show who someone
-- is, so signed-in users can read profile rows. Only display name, avatar,
-- username and the display preference live here -- no email or auth data.
drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select for authenticated" on public.profiles
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- avatars storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Each user may only write inside a folder named after their own user id.
drop policy if exists "avatars: insert own folder" on storage.objects;
create policy "avatars: insert own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: update own folder" on storage.objects;
create policy "avatars: update own folder" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: delete own folder" on storage.objects;
create policy "avatars: delete own folder" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- card_groups: a card can now belong to several groups (tags)
-- ---------------------------------------------------------------------------
create table if not exists public.card_groups (
  card_id uuid not null references public.cards(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, group_id)
);

create index if not exists card_groups_group_id_idx on public.card_groups(group_id);

alter table public.card_groups enable row level security;

create policy "card_groups: select via owned set" on public.card_groups
  for select using (
    exists (
      select 1 from public.cards c
      join public.sets s on s.id = c.set_id
      where c.id = card_groups.card_id and s.owner_id = auth.uid()
    )
  );

-- The card and the group must live in the same set, and the caller must own
-- it. Without the same-set check a card could be tagged with a group from
-- another set, which would break group-scoped study sessions.
--
-- group_id is qualified as card_groups.group_id below because the subquery
-- also joins cards (aliased c) -- which still has its own group_id column at
-- this point in the migration, before it's dropped further down. An
-- unqualified `group_id` resolves to that inner cards.group_id instead of the
-- new card_groups row, which silently wires this policy to cards.group_id and
-- then blocks `ALTER TABLE cards DROP COLUMN group_id` with a dependency
-- error. Qualifying it avoids the ambiguity entirely.
create policy "card_groups: insert via owned set" on public.card_groups
  for insert with check (
    exists (
      select 1
      from public.cards c
      join public.groups g on g.set_id = c.set_id
      join public.sets s on s.id = c.set_id
      where c.id = card_groups.card_id
        and g.id = card_groups.group_id
        and s.owner_id = auth.uid()
    )
  );

create policy "card_groups: delete via owned set" on public.card_groups
  for delete using (
    exists (
      select 1 from public.cards c
      join public.sets s on s.id = c.set_id
      where c.id = card_groups.card_id and s.owner_id = auth.uid()
    )
  );

-- Carry the old single-group assignment over, then retire the column.
insert into public.card_groups (card_id, group_id)
select id, group_id from public.cards where group_id is not null
on conflict do nothing;

alter table public.cards drop column if exists group_id;

-- ---------------------------------------------------------------------------
-- sets: sharing lineage + public flag, so scores from imported copies can be
-- pooled into one scoreboard
-- ---------------------------------------------------------------------------
alter table public.sets
  add column if not exists origin_set_id uuid references public.sets(id) on delete set null,
  add column if not exists is_public boolean not null default false;

create index if not exists sets_origin_set_id_idx on public.sets(origin_set_id);

-- ---------------------------------------------------------------------------
-- study_sessions / session_results: history detail
-- ---------------------------------------------------------------------------
alter table public.study_sessions
  add column if not exists started_at timestamptz not null default now();

alter table public.session_results
  add column if not exists correct_count integer not null default 0,
  add column if not exists total_count integer not null default 0,
  add column if not exists duration_seconds integer,
  add column if not exists set_name text,
  -- [{ card_id, question, answer_hiragana, answer_romaji, result }, ...]
  add column if not exists details jsonb not null default '[]'::jsonb;

create index if not exists session_results_completed_at_idx
  on public.session_results(user_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- One relationship per pair, in whichever direction it was created.
create unique index if not exists friendships_pair_key on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships(addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships(requester_id, status);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

alter table public.friendships enable row level security;

create policy "friendships: select own" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships: insert as requester" on public.friendships
  for insert with check (auth.uid() = requester_id);

-- The addressee accepts or declines; either side can re-send after a decline.
create policy "friendships: update own" on public.friendships
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships: delete own" on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------------------
-- battle rooms (skeleton -- lobby + membership only, no gameplay yet)
-- ---------------------------------------------------------------------------
create table if not exists public.battle_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid references public.sets(id) on delete set null,
  name text,
  status text not null default 'lobby'
    check (status in ('lobby', 'in_progress', 'finished')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists battle_rooms_host_idx on public.battle_rooms(host_id);

create table if not exists public.battle_room_members (
  room_id uuid not null references public.battle_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists battle_room_members_user_idx on public.battle_room_members(user_id);

alter table public.battle_rooms enable row level security;
alter table public.battle_room_members enable row level security;

create policy "battle_rooms: select as member or host" on public.battle_rooms
  for select using (
    auth.uid() = host_id
    or exists (
      select 1 from public.battle_room_members m
      where m.room_id = id and m.user_id = auth.uid()
    )
  );

create policy "battle_rooms: insert as host" on public.battle_rooms
  for insert with check (auth.uid() = host_id);

create policy "battle_rooms: host updates" on public.battle_rooms
  for update using (auth.uid() = host_id);

create policy "battle_rooms: host deletes" on public.battle_rooms
  for delete using (auth.uid() = host_id);

create policy "battle_room_members: select in own rooms" on public.battle_room_members
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.battle_rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
    or exists (
      select 1 from public.battle_room_members m
      where m.room_id = room_id and m.user_id = auth.uid()
    )
  );

create policy "battle_room_members: join as self" on public.battle_room_members
  for insert with check (auth.uid() = user_id);

create policy "battle_room_members: update own row" on public.battle_room_members
  for update using (auth.uid() = user_id);

create policy "battle_room_members: leave" on public.battle_room_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.battle_rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
  );

-- Joining by code needs to read a room the caller isn't a member of yet.
create or replace function public.join_battle_room(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
begin
  select * into v_room from public.battle_rooms where upper(code) = upper(p_code);
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.status = 'finished' then
    raise exception 'That battle has already finished';
  end if;

  insert into public.battle_room_members (room_id, user_id)
  values (v_room.id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return v_room.id;
end;
$$;

grant execute on function public.join_battle_room(text) to authenticated;

-- ---------------------------------------------------------------------------
-- record_swipe: grade a card, advance the queue, update progress and (on the
-- last card) write the result row -- all in one roundtrip.
-- ---------------------------------------------------------------------------
create or replace function public.record_swipe(
  p_session_id uuid,
  p_card_id uuid,
  p_result text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.study_sessions%rowtype;
  v_queue jsonb;
  v_index integer;
  v_entry jsonb;
  v_resolved boolean;
  v_complete boolean;
  v_correct integer;
  v_total integer;
  v_details jsonb;
  v_set_id uuid;
  v_set_name text;
begin
  if p_result not in ('correct', 'incorrect') then
    raise exception 'Invalid result %', p_result;
  end if;

  select * into v_session
  from public.study_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Session not found';
  end if;

  v_queue := v_session.queue;
  v_index := v_session.current_index;
  v_entry := v_queue -> v_index;

  if v_entry is null then
    raise exception 'This session is already complete';
  end if;

  if v_entry ->> 'type' = 'card' then
    if (v_entry ->> 'cardId')::uuid <> p_card_id then
      raise exception 'Card does not match the current queue entry';
    end if;
    v_entry := jsonb_set(v_entry, '{status}', to_jsonb(p_result));
    v_resolved := true;
  else
    if not (v_entry -> 'statuses' ? p_card_id::text) then
      raise exception 'Card does not belong to the current group';
    end if;
    v_entry := jsonb_set(v_entry, array['statuses', p_card_id::text], to_jsonb(p_result));
    v_resolved := not exists (
      select 1 from jsonb_each_text(v_entry -> 'statuses') kv where kv.value = 'pending'
    );
  end if;

  v_queue := jsonb_set(v_queue, array[v_index::text], v_entry);
  if v_resolved then
    v_index := v_index + 1;
  end if;
  v_complete := v_index >= jsonb_array_length(v_queue);

  insert into public.card_progress (user_id, card_id, times_correct, times_incorrect, last_reviewed_at)
  values (
    auth.uid(),
    p_card_id,
    case when p_result = 'correct' then 1 else 0 end,
    case when p_result = 'incorrect' then 1 else 0 end,
    now()
  )
  on conflict (user_id, card_id) do update set
    times_correct = card_progress.times_correct + excluded.times_correct,
    times_incorrect = card_progress.times_incorrect + excluded.times_incorrect,
    last_reviewed_at = excluded.last_reviewed_at;

  update public.study_sessions
  set queue = v_queue,
      current_index = v_index,
      status = case when v_complete then 'completed' else status end
  where id = p_session_id;

  if not v_complete then
    return jsonb_build_object(
      'queue', v_queue,
      'currentIndex', v_index,
      'isComplete', false
    );
  end if;

  -- Flatten the finished queue into one row per graded card.
  with entries as (
    select ord, entry
    from jsonb_array_elements(v_queue) with ordinality as t(entry, ord)
  ),
  flat as (
    select ord, 0 as sub, (entry ->> 'cardId')::uuid as card_id, entry ->> 'status' as result
    from entries
    where entry ->> 'type' = 'card'
    union all
    select e.ord, row_number() over (partition by e.ord order by kv.key) as sub,
           (kv.key)::uuid, kv.value
    from entries e
    cross join jsonb_each_text(e.entry -> 'statuses') kv
    where e.entry ->> 'type' = 'group'
  )
  select
    count(*) filter (where f.result = 'correct'),
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'card_id', f.card_id,
          'question', c.question,
          'answer_hiragana', c.answer_hiragana,
          'answer_romaji', c.answer_romaji,
          'result', f.result
        )
        order by f.ord, f.sub
      ),
      '[]'::jsonb
    )
  into v_correct, v_total, v_details
  from flat f
  left join public.cards c on c.id = f.card_id;

  v_set_id := (v_session.scope ->> 'setId')::uuid;
  select name into v_set_name from public.sets where id = v_set_id;

  insert into public.session_results (
    session_id, user_id, set_id, set_name, score_percentage,
    correct_count, total_count, duration_seconds, details
  )
  values (
    p_session_id,
    auth.uid(),
    v_set_id,
    v_set_name,
    case when v_total > 0 then round((v_correct::numeric / v_total) * 100, 2) else 0 end,
    v_correct,
    v_total,
    greatest(0, extract(epoch from (now() - v_session.started_at))::integer),
    v_details
  );

  return jsonb_build_object(
    'queue', v_queue,
    'currentIndex', v_index,
    'isComplete', true,
    'correct', v_correct,
    'total', v_total
  );
end;
$$;

grant execute on function public.record_swipe(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_scoreboard: best score per player across a shared set and every copy
-- imported from it. Security definer so players can see each other's scores,
-- limited to sets that were actually shared.
-- ---------------------------------------------------------------------------
create or replace function public.set_scoreboard(p_set_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  best_score numeric,
  sessions_played bigint,
  last_played timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root uuid;
  v_shared boolean;
begin
  select coalesce(s.origin_set_id, s.id) into v_root from public.sets s where s.id = p_set_id;
  if v_root is null then
    return;
  end if;

  select (r.share_code is not null or r.is_public) into v_shared
  from public.sets r where r.id = v_root;

  if not coalesce(v_shared, false) then
    -- Not a shared set: only the owner sees their own board.
    if not exists (select 1 from public.sets s where s.id = p_set_id and s.owner_id = auth.uid()) then
      return;
    end if;
  end if;

  return query
  select
    sr.user_id,
    p.display_name,
    p.avatar_url,
    max(sr.score_percentage) as best_score,
    count(*) as sessions_played,
    max(sr.completed_at) as last_played
  from public.session_results sr
  join public.sets s on s.id = sr.set_id
  left join public.profiles p on p.id = sr.user_id
  where coalesce(s.origin_set_id, s.id) = v_root
  group by sr.user_id, p.display_name, p.avatar_url
  order by max(sr.score_percentage) desc, max(sr.completed_at) asc;
end;
$$;

grant execute on function public.set_scoreboard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sharing / copying helpers rebuilt for the card_groups junction
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
  v_new_card_id uuid;
begin
  if p_share_code is null or p_share_code = '' then
    raise exception 'Share code is required';
  end if;

  select * into v_source_set from public.sets where share_code = p_share_code;
  if not found then
    raise exception 'Invalid share code';
  end if;

  insert into public.sets (owner_id, name, description, origin_set_id)
  values (
    auth.uid(),
    v_source_set.name,
    v_source_set.description,
    coalesce(v_source_set.origin_set_id, v_source_set.id)
  )
  returning id into v_new_set_id;

  for r in select * from public.groups where set_id = v_source_set.id loop
    insert into public.groups (set_id, name)
    values (v_new_set_id, r.name)
    returning id into v_new_group_id;
    v_group_map := v_group_map || jsonb_build_object(r.id::text, v_new_group_id::text);
  end loop;

  for r in select * from public.cards where set_id = v_source_set.id loop
    insert into public.cards (
      set_id, question, answer_hiragana, answer_romaji, answer_kanji, notes
    )
    values (
      v_new_set_id, r.question, r.answer_hiragana, r.answer_romaji, r.answer_kanji, r.notes
    )
    returning id into v_new_card_id;

    insert into public.card_groups (card_id, group_id)
    select v_new_card_id, (v_group_map ->> cg.group_id::text)::uuid
    from public.card_groups cg
    where cg.card_id = r.id and v_group_map ? cg.group_id::text;
  end loop;

  return v_new_set_id;
end;
$$;

grant execute on function public.import_shared_set(text) to authenticated;

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
  v_new_card_id uuid;
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.sets where id = p_target_set_id and owner_id = auth.uid()
  ) then
    raise exception 'Target set not found or not owned by caller';
  end if;

  -- Recreate (or reuse) each source group by name in the target set.
  for r in
    select distinct g.id, g.name
    from public.card_groups cg
    join public.groups g on g.id = cg.group_id
    join public.cards c on c.id = cg.card_id
    join public.sets s on s.id = c.set_id
    where cg.card_id = any(p_card_ids) and s.owner_id = auth.uid()
  loop
    select id into v_new_group_id
    from public.groups
    where set_id = p_target_set_id and name = r.name
    limit 1;

    if v_new_group_id is null then
      insert into public.groups (set_id, name)
      values (p_target_set_id, r.name)
      returning id into v_new_group_id;
    end if;

    v_group_map := v_group_map || jsonb_build_object(r.id::text, v_new_group_id::text);
    v_new_group_id := null;
  end loop;

  for r in
    select c.*
    from public.cards c
    join public.sets s on s.id = c.set_id
    where c.id = any(p_card_ids) and s.owner_id = auth.uid()
  loop
    insert into public.cards (
      set_id, question, answer_hiragana, answer_romaji, answer_kanji, notes
    )
    values (
      p_target_set_id, r.question, r.answer_hiragana, r.answer_romaji, r.answer_kanji, r.notes
    )
    returning id into v_new_card_id;

    insert into public.card_groups (card_id, group_id)
    select v_new_card_id, (v_group_map ->> cg.group_id::text)::uuid
    from public.card_groups cg
    where cg.card_id = r.id and v_group_map ? cg.group_id::text;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.copy_cards_into_set(uuid[], uuid) to authenticated;
