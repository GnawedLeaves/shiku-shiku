-- Shiku Shiku -- feature migration 12
--
-- 1. Leaving the post-match lobby. A finished room keeps every player's row
--    (for the results), so leaving it is recorded as left_at instead of a
--    delete. Other players see who has left, and a rematch leaves them out.
-- 2. Rematch. rematch_battle() opens a new lobby with the same set and
--    options and puts every player who hasn't left straight into it (in the
--    same join order, so everyone keeps their colour). The finished room
--    points at it through rematch_room_id, which Realtime pushes to the
--    players still on the results screen so they follow automatically.
--    Calling it again once a rematch exists just joins that room.
--
-- Safe to run after 0011_multiplayer_battles_and_rewards.sql.

alter table public.battle_room_members
  add column if not exists left_at timestamptz;

alter table public.battle_rooms
  add column if not exists rematch_room_id uuid references public.battle_rooms(id) on delete set null;

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
  -- The lock means two players pressing Rematch together get one room.
  select * into v_room from public.battle_rooms where id = p_room for update;
  if not found or not public.is_battle_member(p_room) then
    raise exception 'Room not found';
  end if;
  if v_room.status <> 'finished' then
    raise exception 'This battle isn''t over yet';
  end if;

  -- Someone already started the rematch: join it.
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

  insert into public.battle_rooms (code, host_id, set_id, name, status, max_players, shuffle, card_limit)
  values (v_code, auth.uid(), v_room.set_id, v_room.name, 'lobby', v_room.max_players,
          v_room.shuffle, v_room.card_limit)
  returning * into v_next;

  -- Everyone still here (and the caller), in their original join order.
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
