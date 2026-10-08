-- Shiku Shiku -- feature migration 7
--
-- Friend profiles and live 1v1 battles:
--   * sets.is_private -- hides a set from friend profiles and battles.
--   * friend_profile_sets / friend_profile_history -- what a friend may see,
--     read through functions so the sets/cards/results RLS stays owner-only.
--   * battle rooms: fixes the recursive membership policy from 0002, caps rooms
--     at two players, adds invites, a shared deck snapshot, per-player
--     progress, a race-safe winner, and Realtime for the live lobby/game.
--
-- Safe to run after 0006_active_study_time.sql.

-- ---------------------------------------------------------------------------
-- Private sets
-- ---------------------------------------------------------------------------
alter table public.sets
  add column if not exists is_private boolean not null default false;

-- ---------------------------------------------------------------------------
-- Helpers (security definer, so policies can use them without recursing)
-- ---------------------------------------------------------------------------
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = p_a and f.addressee_id = p_b)
        or (f.requester_id = p_b and f.addressee_id = p_a))
  );
$$;

create or replace function public.is_battle_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.battle_room_members m
    where m.room_id = p_room and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_battle_host(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.battle_rooms r where r.id = p_room and r.host_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Friend profiles
-- ---------------------------------------------------------------------------
create or replace function public.friend_profile_sets(p_user uuid)
returns table (
  id uuid,
  name text,
  description text,
  color text,
  card_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.are_friends(auth.uid(), p_user) then
    return;
  end if;

  return query
  select s.id, s.name, s.description, s.color,
         (select count(*) from public.cards c where c.set_id = s.id),
         s.created_at
  from public.sets s
  where s.owner_id = p_user and not s.is_private
  order by s.created_at desc;
end;
$$;

grant execute on function public.friend_profile_sets(uuid) to authenticated;

-- A friend's finished sessions, minus any from sets they've made private.
create or replace function public.friend_profile_history(p_user uuid, p_limit integer default 30)
returns table (
  id uuid,
  session_name text,
  set_name text,
  study_mode text,
  score_percentage numeric,
  correct_count integer,
  total_count integer,
  dont_know_count integer,
  duration_seconds integer,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.are_friends(auth.uid(), p_user) then
    return;
  end if;

  return query
  select r.id, ss.name, r.set_name, r.study_mode, r.score_percentage, r.correct_count,
         r.total_count, r.dont_know_count, r.duration_seconds, r.completed_at
  from public.session_results r
  left join public.sets s on s.id = r.set_id
  left join public.study_sessions ss on ss.id = r.session_id
  where r.user_id = p_user and not coalesce(s.is_private, false)
  order by r.completed_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

grant execute on function public.friend_profile_history(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Battle rooms: game state
-- ---------------------------------------------------------------------------
alter table public.battle_rooms
  -- Snapshot of the set's cards in one shuffled order, taken at start so both
  -- players get the same deck without needing read access to the set.
  add column if not exists deck jsonb,
  add column if not exists winner_id uuid references auth.users(id) on delete set null;

alter table public.battle_room_members
  add column if not exists queue jsonb,
  add column if not exists current_index integer not null default 0,
  add column if not exists cleared integer not null default 0,
  add column if not exists dont_know integer not null default 0,
  add column if not exists first_try integer not null default 0,
  add column if not exists finished_at timestamptz;

-- ---------------------------------------------------------------------------
-- Battle rooms: policies. 0002's member policy queried its own table (Postgres
-- rejects that as infinite recursion) and compared room_id to itself; both
-- tables now go through the definer helpers above.
-- ---------------------------------------------------------------------------
drop policy if exists "battle_rooms: select as member or host" on public.battle_rooms;
create policy "battle_rooms: select as member or host" on public.battle_rooms
  for select using (auth.uid() = host_id or public.is_battle_member(id));

drop policy if exists "battle_room_members: select in own rooms" on public.battle_room_members;
create policy "battle_room_members: select in own rooms" on public.battle_room_members
  for select using (public.is_battle_member(room_id) or public.is_battle_host(room_id));

-- Joining happens through join_battle_room / accept_battle_invite only, so the
-- two-player cap can't be bypassed with a direct insert (the host's own row
-- is added the same way when the room is created).
drop policy if exists "battle_room_members: join as self" on public.battle_room_members;
create policy "battle_room_members: join as self" on public.battle_room_members
  for insert with check (auth.uid() = user_id and public.is_battle_host(room_id));

-- ---------------------------------------------------------------------------
-- Battle invites
-- ---------------------------------------------------------------------------
create table if not exists public.battle_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.battle_rooms(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists battle_invites_to_user_idx on public.battle_invites(to_user, status);

alter table public.battle_invites enable row level security;

drop policy if exists "battle_invites: select own" on public.battle_invites;
create policy "battle_invites: select own" on public.battle_invites
  for select using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "battle_invites: host invites friends" on public.battle_invites;
create policy "battle_invites: host invites friends" on public.battle_invites
  for insert with check (
    auth.uid() = from_user
    and public.is_battle_host(room_id)
    and public.are_friends(from_user, to_user)
  );

drop policy if exists "battle_invites: invitee responds" on public.battle_invites;
create policy "battle_invites: invitee responds" on public.battle_invites
  for update using (auth.uid() = to_user);

drop policy if exists "battle_invites: sender cancels" on public.battle_invites;
create policy "battle_invites: sender cancels" on public.battle_invites
  for delete using (auth.uid() = from_user);

-- ---------------------------------------------------------------------------
-- Joining: by code/link, or by accepting an invite. Rooms hold two players.
-- ---------------------------------------------------------------------------
create or replace function public.add_battle_member(p_room public.battle_rooms)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.battle_room_members where room_id = p_room.id and user_id = auth.uid()
  ) then
    return; -- already in: rejoining is fine whatever the room's state
  end if;
  if p_room.status <> 'lobby' then
    raise exception 'That battle has already started';
  end if;
  if (select count(*) from public.battle_room_members where room_id = p_room.id) >= 2 then
    raise exception 'That room is full';
  end if;

  insert into public.battle_room_members (room_id, user_id) values (p_room.id, auth.uid());
end;
$$;

revoke execute on function public.add_battle_member(public.battle_rooms) from public, anon, authenticated;

create or replace function public.join_battle_room(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
begin
  select * into v_room from public.battle_rooms where upper(code) = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Room not found';
  end if;
  perform public.add_battle_member(v_room);
  return v_room.id;
end;
$$;

grant execute on function public.join_battle_room(text) to authenticated;

create or replace function public.accept_battle_invite(p_invite uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.battle_invites%rowtype;
  v_room public.battle_rooms%rowtype;
begin
  select * into v_invite from public.battle_invites
  where id = p_invite and to_user = auth.uid();
  if not found then
    raise exception 'Invite not found';
  end if;

  select * into v_room from public.battle_rooms where id = v_invite.room_id for update;
  if not found then
    raise exception 'That room has been closed';
  end if;

  perform public.add_battle_member(v_room);
  update public.battle_invites set status = 'accepted' where id = p_invite;
  return v_room.id;
end;
$$;

grant execute on function public.accept_battle_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Set picker: the host's and the opponent's sets, private ones excluded.
-- ---------------------------------------------------------------------------
create or replace function public.battle_set_options(p_room uuid)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  card_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_battle_member(p_room) then
    return;
  end if;

  return query
  select s.id, s.name, s.owner_id,
         (select count(*) from public.cards c where c.set_id = s.id)
  from public.sets s
  where not s.is_private
    and s.owner_id in (select m.user_id from public.battle_room_members m where m.room_id = p_room)
  order by s.name;
end;
$$;

grant execute on function public.battle_set_options(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Starting: the host, with the opponent ready and a set picked. Snapshots the
-- deck in one shuffled order and resets both players' progress.
-- ---------------------------------------------------------------------------
create or replace function public.start_battle(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
  v_set public.sets%rowtype;
  v_deck jsonb;
  v_queue jsonb;
begin
  select * into v_room from public.battle_rooms where id = p_room for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start the battle';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'This battle has already started';
  end if;
  if (select count(*) from public.battle_room_members where room_id = p_room) < 2 then
    raise exception 'Wait for your opponent to join';
  end if;
  if exists (
    select 1 from public.battle_room_members
    where room_id = p_room and user_id <> v_room.host_id and not is_ready
  ) then
    raise exception 'Your opponent isn''t ready yet';
  end if;

  select * into v_set from public.sets where id = v_room.set_id;
  if not found then
    raise exception 'Pick a set first';
  end if;
  if v_set.is_private or v_set.owner_id not in (
    select user_id from public.battle_room_members where room_id = p_room
  ) then
    raise exception 'That set can''t be used for this battle';
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'id', c.id, 'question', c.question, 'answer_hiragana', c.answer_hiragana,
      'answer_romaji', c.answer_romaji, 'answer_kanji', c.answer_kanji, 'notes', c.notes
    ) order by c.shuffle_key),
    jsonb_agg(jsonb_build_object('type', 'card', 'cardId', c.id, 'status', 'pending')
      order by c.shuffle_key)
  into v_deck, v_queue
  from (select *, random() as shuffle_key from public.cards where set_id = v_set.id) c;

  if v_deck is null then
    raise exception 'That set has no cards';
  end if;

  update public.battle_rooms
  set deck = v_deck, status = 'in_progress', started_at = now(),
      finished_at = null, winner_id = null
  where id = p_room;

  update public.battle_room_members
  set queue = v_queue, current_index = 0, cleared = 0, dont_know = 0, first_try = 0,
      finished_at = null
  where room_id = p_room;
end;
$$;

grant execute on function public.start_battle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Finishing: the first player to clear their whole deck wins. The room row
-- lock makes a near-simultaneous finish resolve to exactly one winner.
-- ---------------------------------------------------------------------------
create or replace function public.finish_battle(p_room uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
  v_me public.battle_room_members%rowtype;
begin
  select * into v_room from public.battle_rooms where id = p_room for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.status = 'finished' then
    return v_room.winner_id;
  end if;
  if v_room.status <> 'in_progress' then
    raise exception 'This battle hasn''t started';
  end if;

  select * into v_me from public.battle_room_members
  where room_id = p_room and user_id = auth.uid();
  if not found then
    raise exception 'You''re not in this battle';
  end if;
  if v_me.queue is null or v_me.current_index < jsonb_array_length(v_me.queue) then
    raise exception 'You haven''t cleared the deck yet';
  end if;

  update public.battle_room_members set finished_at = now()
  where room_id = p_room and user_id = auth.uid();
  update public.battle_rooms
  set status = 'finished', finished_at = now(), winner_id = auth.uid()
  where id = p_room;
  return auth.uid();
end;
$$;

grant execute on function public.finish_battle(uuid) to authenticated;

-- Leaving mid-battle hands the win to the other player.
create or replace function public.forfeit_battle(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
begin
  select * into v_room from public.battle_rooms where id = p_room for update;
  if not found or v_room.status <> 'in_progress' or not public.is_battle_member(p_room) then
    return;
  end if;

  update public.battle_rooms
  set status = 'finished', finished_at = now(),
      winner_id = (
        select user_id from public.battle_room_members
        where room_id = p_room and user_id <> auth.uid()
        limit 1
      )
  where id = p_room;
end;
$$;

grant execute on function public.forfeit_battle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the lobby, live progress and invites are pushed to the clients.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array['battle_rooms', 'battle_room_members', 'battle_invites'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
