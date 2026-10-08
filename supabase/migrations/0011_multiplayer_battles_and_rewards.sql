-- Shiku Shiku -- feature migration 11
--
-- 1. Battles for up to 5 players.
--      * battle_rooms.max_players (2-5, default 5) caps joining.
--      * The host can start once there are 2+ players and everyone else is
--        ready.
--      * Finishers get a placement in finish order (1st, 2nd, ...). The first
--        finisher is the winner. A player can give up (forfeited_at). The
--        battle ends when every player has finished or given up; if everyone
--        else gives up before anyone finishes, the last player standing wins.
-- 2. Battle options, set by the host in the lobby: shuffle on/off and how many
--    cards (null = the whole set). The deck is drawn once, at start, for all.
-- 3. Rewards (skeleton). Points are an append-only ledger, awarded by a
--    trigger when a battle finishes, using tunable rules. Medals are
--    thresholds on the running balance (read via my_reward_summary()). Nothing spends points yet -- the
--    ledger shape (signed points, a source and a reason) is ready for that.
--
-- Safe to run after 0010_battle_play_to_finish.sql.

-- ===========================================================================
-- 1. Multiplayer
-- ===========================================================================
alter table public.battle_rooms
  add column if not exists max_players integer not null default 5,
  add column if not exists shuffle boolean not null default true,
  add column if not exists card_limit integer;

alter table public.battle_rooms drop constraint if exists battle_rooms_max_players_check;
alter table public.battle_rooms
  add constraint battle_rooms_max_players_check check (max_players between 2 and 5);

alter table public.battle_rooms drop constraint if exists battle_rooms_card_limit_check;
alter table public.battle_rooms
  add constraint battle_rooms_card_limit_check check (card_limit is null or card_limit >= 1);

alter table public.battle_room_members
  add column if not exists placement integer,
  add column if not exists forfeited_at timestamptz;

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
  if (select count(*) from public.battle_room_members where room_id = p_room.id) >= p_room.max_players then
    raise exception 'That room is full';
  end if;

  insert into public.battle_room_members (room_id, user_id) values (p_room.id, auth.uid());
end;
$$;

revoke execute on function public.add_battle_member(public.battle_rooms) from public, anon, authenticated;

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

  update public.battle_room_members
  set queue = v_queue, current_index = 0, cleared = 0, dont_know = 0, first_try = 0,
      finished_at = null, placement = null, forfeited_at = null
  where room_id = p_room;
end;
$$;

grant execute on function public.start_battle(uuid) to authenticated;

-- Ends the battle once nobody is still playing. Call with the room row locked.
create or replace function public.settle_battle(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_last uuid;
begin
  select count(*), min(user_id::text)::uuid
  into v_active, v_last
  from public.battle_room_members
  where room_id = p_room and finished_at is null and forfeited_at is null;

  if v_active = 0 then
    update public.battle_rooms
    set status = 'finished', finished_at = now()
    where id = p_room;
  elsif v_active = 1 and (select winner_id from public.battle_rooms where id = p_room) is null then
    -- Everyone else gave up before anyone finished: last one standing wins.
    update public.battle_room_members set placement = 1
    where room_id = p_room and user_id = v_last;
    update public.battle_rooms
    set status = 'finished', finished_at = now(), winner_id = v_last
    where id = p_room;
  end if;
end;
$$;

revoke execute on function public.settle_battle(uuid) from public, anon, authenticated;

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
  if v_me.queue is null or v_me.current_index < jsonb_array_length(v_me.queue) then
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

create or replace function public.forfeit_battle(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.battle_rooms%rowtype;
  v_me public.battle_room_members%rowtype;
begin
  select * into v_room from public.battle_rooms where id = p_room for update;
  if not found or v_room.status <> 'in_progress' then
    return;
  end if;

  select * into v_me from public.battle_room_members
  where room_id = p_room and user_id = auth.uid();
  if not found or v_me.finished_at is not null or v_me.forfeited_at is not null then
    return; -- not playing, already finished, or already gave up
  end if;

  update public.battle_room_members set forfeited_at = now()
  where room_id = p_room and user_id = auth.uid();

  perform public.settle_battle(p_room);
end;
$$;

grant execute on function public.forfeit_battle(uuid) to authenticated;

-- ===========================================================================
-- 3. Rewards (skeleton)
-- ===========================================================================

-- Tunable point values, so balancing doesn't need a deploy.
create table if not exists public.reward_rules (
  key text primary key,
  points integer not null,
  description text
);

insert into public.reward_rules (key, points, description) values
  ('battle_place_1', 100, 'First to clear the deck'),
  ('battle_place_2', 60, 'Second place'),
  ('battle_place_3', 40, 'Third place'),
  ('battle_place_4', 25, 'Fourth place'),
  ('battle_place_5', 15, 'Fifth place')
on conflict (key) do nothing;

-- Append-only: every change to a balance is a row. Points are signed, so
-- spending/converting later is just a negative entry with its own reason.
create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null,
  source text not null,          -- e.g. 'battle'
  source_id uuid,                -- e.g. the battle room
  reason text not null,          -- e.g. 'battle_place_1'
  created_at timestamptz not null default now()
);

-- One award per user per source per reason: re-running never double-pays.
create unique index if not exists reward_ledger_once
  on public.reward_ledger (user_id, source, source_id, reason);
create index if not exists reward_ledger_user_idx on public.reward_ledger (user_id, created_at desc);

alter table public.reward_ledger enable row level security;
drop policy if exists "reward_ledger: read own" on public.reward_ledger;
create policy "reward_ledger: read own" on public.reward_ledger
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only definer functions write the ledger.

create table if not exists public.medal_definitions (
  id text primary key,
  name text not null,
  threshold_points integer not null,
  sort_order integer not null
);

insert into public.medal_definitions (id, name, threshold_points, sort_order) values
  ('bronze', 'Bronze', 500, 1),
  ('silver', 'Silver', 1500, 2),
  ('gold', 'Gold', 5000, 3)
on conflict (id) do nothing;

alter table public.reward_rules enable row level security;
alter table public.medal_definitions enable row level security;
drop policy if exists "reward_rules: readable" on public.reward_rules;
create policy "reward_rules: readable" on public.reward_rules
  for select to authenticated using (true);
drop policy if exists "medal_definitions: readable" on public.medal_definitions;
create policy "medal_definitions: readable" on public.medal_definitions
  for select to authenticated using (true);

-- Pays out a finished battle's placements. Players who gave up get nothing.
create or replace function public.award_battle_rewards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    insert into public.reward_ledger (user_id, points, source, source_id, reason)
    select m.user_id, r.points, 'battle', new.id, r.key
    from public.battle_room_members m
    join public.reward_rules r on r.key = 'battle_place_' || m.placement
    where m.room_id = new.id and m.placement is not null
    on conflict (user_id, source, source_id, reason) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists battle_rooms_award_rewards on public.battle_rooms;
create trigger battle_rooms_award_rewards
  after update on public.battle_rooms
  for each row execute function public.award_battle_rewards();

-- The caller's balance, medals earned and the next one to aim for.
create or replace function public.my_reward_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with balance as (
    select coalesce(sum(points), 0)::integer as points
    from public.reward_ledger where user_id = auth.uid()
  )
  select jsonb_build_object(
    'points', b.points,
    'medals', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.sort_order)
      from public.medal_definitions m where m.threshold_points <= b.points
    ), '[]'::jsonb),
    'next_medal', (
      select jsonb_build_object('id', m.id, 'name', m.name, 'threshold', m.threshold_points)
      from public.medal_definitions m where m.threshold_points > b.points
      order by m.threshold_points limit 1
    )
  )
  from balance b;
$$;

grant execute on function public.my_reward_summary() to authenticated;
