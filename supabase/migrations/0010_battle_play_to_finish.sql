-- Shiku Shiku -- feature migration 10
--
-- Battles now play to the finish. The first player to clear the deck is the
-- winner, but the battle carries on until the other player also clears it or
-- gives up -- only then does the room move to 'finished' (and both screens to
-- the results).
--
--   finish_battle  -- records the caller's finish time; the first finisher
--                     becomes the winner; the room finishes once every player
--                     has finished.
--   forfeit_battle -- giving up before anyone has finished hands the win to
--                     the other player; giving up after the winner finished
--                     just ends the battle (the winner stands). A player who
--                     has already finished can leave without affecting it.
--
-- Safe to run after 0009_battle_chat.sql.

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
  -- The room row lock serialises finishes: two players clearing the deck at
  -- the same moment still produce exactly one winner.
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

  if v_me.finished_at is null then
    update public.battle_room_members set finished_at = now()
    where room_id = p_room and user_id = auth.uid();
  end if;

  update public.battle_rooms
  set winner_id = coalesce(winner_id, auth.uid()),
      status = case
        when not exists (
          select 1 from public.battle_room_members
          where room_id = p_room and finished_at is null
        ) then 'finished'
        else status
      end,
      finished_at = case
        when not exists (
          select 1 from public.battle_room_members
          where room_id = p_room and finished_at is null
        ) then now()
        else finished_at
      end
  where id = p_room
  returning winner_id into v_room.winner_id;

  return v_room.winner_id;
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
  if not found or v_me.finished_at is not null then
    return; -- not playing, or already finished: leaving changes nothing
  end if;

  update public.battle_rooms
  set status = 'finished',
      finished_at = now(),
      -- Nobody finished yet: the player who stayed wins. Otherwise the
      -- first finisher already holds the win.
      winner_id = coalesce(
        winner_id,
        (select user_id from public.battle_room_members
         where room_id = p_room and user_id <> auth.uid()
         limit 1)
      )
  where id = p_room;
end;
$$;

grant execute on function public.forfeit_battle(uuid) to authenticated;
