-- Shiku Shiku -- feature migration 13
--
-- Number listening: a Japanese number is read out and the player types it.
--
-- 1. Battle rooms get a mode: 'cards' (the flashcard race) or 'numbers'.
--    A numbers room has a range (number_min..number_max), how many correct
--    answers win (rounds) and how many hints each player may use
--    (hints_allowed). No set or deck: start_battle picks a random seed and
--    every player's numbers are generated from it on the client
--    (NumberPool in src/lib/numbers/japanese.ts): the same set in the same
--    order for everyone, and skips swap in spares from outside that set (the
--    same spare for everyone's first skip, second skip, ...). Skips don't
--    score, so the first to `rounds` correct answers is 1st. For numbers
--    rooms, battle_room_members.current_index holds skips this round.
-- 2. Per-player number stats on battle_room_members: hints used, wrong
--    attempts and the numbers they skipped (for "most skipped" at the end).
-- 3. number_practice_results: single-player runs, shown in History.
--
-- Safe to run after 0012_battle_rematch_and_leaving.sql.

-- ===========================================================================
-- 1. Rooms
-- ===========================================================================
alter table public.battle_rooms
  add column if not exists mode text not null default 'cards',
  add column if not exists number_min integer not null default 1,
  add column if not exists number_max integer not null default 100,
  add column if not exists rounds integer not null default 10,
  add column if not exists hints_allowed integer not null default 3,
  add column if not exists number_seed bigint;

alter table public.battle_rooms drop constraint if exists battle_rooms_mode_check;
alter table public.battle_rooms
  add constraint battle_rooms_mode_check check (mode in ('cards', 'numbers'));

alter table public.battle_rooms drop constraint if exists battle_rooms_numbers_check;
alter table public.battle_rooms
  add constraint battle_rooms_numbers_check check (
    number_min >= 0 and number_max <= 999999999 and number_min <= number_max
    and rounds between 1 and 500
    and hints_allowed between 0 and 500
  );

-- ===========================================================================
-- 2. Players
-- ===========================================================================
alter table public.battle_room_members
  add column if not exists hints_used integer not null default 0,
  add column if not exists wrong_attempts integer not null default 0,
  add column if not exists skipped_numbers integer[] not null default '{}';

-- ===========================================================================
-- Starting: cards rooms draw the deck as before; numbers rooms just need a
-- seed. Both reset everyone's progress.
-- ===========================================================================
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
    raise exception 'Wait for at least one more player to join';
  end if;
  if exists (
    select 1 from public.battle_room_members
    where room_id = p_room and user_id <> v_room.host_id and not is_ready
  ) then
    raise exception 'Not everyone is ready yet';
  end if;

  if v_room.mode = 'numbers' then
    update public.battle_rooms
    set deck = null, number_seed = floor(random() * 2147483647)::bigint,
        status = 'in_progress', started_at = now(), finished_at = null, winner_id = null
    where id = p_room;
  else
    select * into v_set from public.sets where id = v_room.set_id;
    if not found then
      raise exception 'Pick a set first';
    end if;
    if v_set.is_private or v_set.owner_id not in (
      select user_id from public.battle_room_members where room_id = p_room
    ) then
      raise exception 'That set can''t be used for this battle';
    end if;

    -- Draw the cards (a random sample when there's a limit), then order them:
    -- shuffled, or in the set's own order. Everyone plays this one deck.
    with drawn as (
      select c.*
      from public.cards c
      where c.set_id = v_set.id
      order by random()
      limit v_room.card_limit -- null = no limit
    ),
    ordered as (
      select d.*,
             case when v_room.shuffle then random() else 0 end as shuffle_key
      from drawn d
    )
    select
      jsonb_agg(jsonb_build_object(
        'id', o.id, 'question', o.question, 'answer_hiragana', o.answer_hiragana,
        'answer_romaji', o.answer_romaji, 'answer_kanji', o.answer_kanji, 'notes', o.notes
      ) order by o.shuffle_key, o.created_at, o.id),
      jsonb_agg(jsonb_build_object('type', 'card', 'cardId', o.id, 'status', 'pending')
        order by o.shuffle_key, o.created_at, o.id)
    into v_deck, v_queue
    from ordered o;

    if v_deck is null then
      raise exception 'That set has no cards';
    end if;

    update public.battle_rooms
    set deck = v_deck, status = 'in_progress', started_at = now(),
        finished_at = null, winner_id = null
    where id = p_room;
  end if;

  update public.battle_room_members
  set queue = v_queue, current_index = 0, cleared = 0, dont_know = 0, first_try = 0,
      finished_at = null, placement = null, forfeited_at = null,
      hints_used = 0, wrong_attempts = 0, skipped_numbers = '{}'
  where room_id = p_room;
end;
$$;

grant execute on function public.start_battle(uuid) to authenticated;

-- ===========================================================================
-- Finishing: a cards player has cleared their queue; a numbers player has
-- `rounds` correct answers. Otherwise unchanged from 0011.
-- ===========================================================================
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
  -- The room row lock serialises finishes, so placements never collide.
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
  if v_me.forfeited_at is not null then
    raise exception 'You gave up this battle';
  end if;
  if v_room.mode = 'numbers' then
    if v_me.cleared < v_room.rounds then
      raise exception 'You haven''t answered enough numbers yet';
    end if;
  elsif v_me.queue is null or v_me.current_index < jsonb_array_length(v_me.queue) then
    raise exception 'You haven''t cleared the deck yet';
  end if;

  if v_me.finished_at is null then
    update public.battle_room_members
    set finished_at = now(),
        placement = 1 + (
          select count(*) from public.battle_room_members
          where room_id = p_room and finished_at is not null
        )
    where room_id = p_room and user_id = auth.uid();

    update public.battle_rooms set winner_id = coalesce(winner_id, auth.uid())
    where id = p_room;
  end if;

  perform public.settle_battle(p_room);
  return (select winner_id from public.battle_rooms where id = p_room);
end;
$$;

grant execute on function public.finish_battle(uuid) to authenticated;

-- History: a numbers battle has no set; its size is the rounds to win.
create or replace function public.battle_rooms_record_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    if new.mode = 'numbers' then
      new.set_name := null;
      new.card_count := new.rounds;
    else
      select s.name into new.set_name from public.sets s where s.id = new.set_id;
      new.card_count := coalesce(jsonb_array_length(new.deck), 0);
    end if;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- Rematch: as in 0012, now carrying the mode and number options over too.
-- ===========================================================================
create or replace function public.rematch_battle(p_room uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
  v_next public.battle_rooms%rowtype;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select * into v_room from public.battle_rooms where id = p_room for update;
  if not found or not public.is_battle_member(p_room) then
    raise exception 'Room not found';
  end if;
  if v_room.status <> 'finished' then
    raise exception 'This battle isn''t over yet';
  end if;

  if v_room.rematch_room_id is not null then
    select * into v_next from public.battle_rooms where id = v_room.rematch_room_id for update;
    if found then
      if not exists (
        select 1 from public.battle_room_members
        where room_id = v_next.id and user_id = auth.uid()
      ) then
        if v_next.status <> 'lobby' then
          raise exception 'The rematch has already started';
        end if;
        if (select count(*) from public.battle_room_members where room_id = v_next.id) >= v_next.max_players then
          raise exception 'The rematch is full';
        end if;
        insert into public.battle_room_members (room_id, user_id) values (v_next.id, auth.uid());
      end if;
      update public.battle_room_members set left_at = null
      where room_id = p_room and user_id = auth.uid();
      return v_next.id;
    end if;
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
    into v_code
    from generate_series(1, 6);
    exit when not exists (select 1 from public.battle_rooms where code = v_code);
  end loop;

  insert into public.battle_rooms (
    code, host_id, set_id, name, status, max_players, shuffle, card_limit,
    mode, number_min, number_max, rounds, hints_allowed
  )
  values (
    v_code, auth.uid(), v_room.set_id, v_room.name, 'lobby', v_room.max_players,
    v_room.shuffle, v_room.card_limit,
    v_room.mode, v_room.number_min, v_room.number_max, v_room.rounds, v_room.hints_allowed
  )
  returning * into v_next;

  insert into public.battle_room_members (room_id, user_id, joined_at)
  select v_next.id, m.user_id,
         now() + (row_number() over (order by m.joined_at)) * interval '1 millisecond'
  from public.battle_room_members m
  where m.room_id = p_room and (m.left_at is null or m.user_id = auth.uid())
  order by m.joined_at
  limit v_next.max_players;

  update public.battle_rooms set rematch_room_id = v_next.id where id = p_room;
  return v_next.id;
end;
$$;

grant execute on function public.rematch_battle(uuid) to authenticated;

-- ===========================================================================
-- 3. Single-player practice history
-- ===========================================================================
create table if not exists public.number_practice_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  number_min integer not null,
  number_max integer not null,
  rounds integer not null,
  correct_count integer not null,
  skip_count integer not null default 0,
  hints_used integer not null default 0,
  wrong_attempts integer not null default 0,
  skipped_numbers integer[] not null default '{}',
  duration_seconds integer,
  completed_at timestamptz not null default now()
);

create index if not exists number_practice_results_user_idx
  on public.number_practice_results (user_id, completed_at desc);

alter table public.number_practice_results enable row level security;

drop policy if exists "number_practice_results: read own" on public.number_practice_results;
create policy "number_practice_results: read own" on public.number_practice_results
  for select using (auth.uid() = user_id);

drop policy if exists "number_practice_results: insert own" on public.number_practice_results;
create policy "number_practice_results: insert own" on public.number_practice_results
  for insert with check (auth.uid() = user_id);

drop policy if exists "number_practice_results: delete own" on public.number_practice_results;
create policy "number_practice_results: delete own" on public.number_practice_results
  for delete using (auth.uid() = user_id);
