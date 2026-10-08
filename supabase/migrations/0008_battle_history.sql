-- Shiku Shiku -- feature migration 8
--
-- Battle history. A battle's set may belong to the other player (and be made
-- private or deleted later), so its name and size are recorded on the room
-- the moment the battle starts -- the history list never has to read the set.
--
-- Filled by a trigger when start_battle moves the room to in_progress, so
-- start_battle itself is unchanged. Existing battles are backfilled.
--
-- Safe to run after 0007_friends_and_battles.sql.

alter table public.battle_rooms
  add column if not exists set_name text,
  add column if not exists card_count integer;

create or replace function public.battle_rooms_record_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    select s.name into new.set_name from public.sets s where s.id = new.set_id;
    new.card_count := coalesce(jsonb_array_length(new.deck), 0);
  end if;
  return new;
end;
$$;

drop trigger if exists battle_rooms_record_set on public.battle_rooms;

create trigger battle_rooms_record_set
  before update on public.battle_rooms
  for each row execute function public.battle_rooms_record_set();

update public.battle_rooms r
set set_name = coalesce(r.set_name, s.name),
    card_count = coalesce(r.card_count, jsonb_array_length(r.deck))
from public.sets s
where s.id = r.set_id and r.deck is not null;
