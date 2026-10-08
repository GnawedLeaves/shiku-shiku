-- Shiku Shiku -- feature migration 9
--
-- Chat inside a battle room: in the lobby while getting ready, and in the
-- post-match lobby (same room, so the history carries over). Only the room's
-- two players can read or post, and new messages are pushed by Realtime.
--
-- Safe to run after 0008_battle_history.sql.

create table if not exists public.battle_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.battle_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists battle_messages_room_idx on public.battle_messages(room_id, created_at);

alter table public.battle_messages enable row level security;

drop policy if exists "battle_messages: members read" on public.battle_messages;
create policy "battle_messages: members read" on public.battle_messages
  for select using (public.is_battle_member(room_id));

drop policy if exists "battle_messages: members post as self" on public.battle_messages;
create policy "battle_messages: members post as self" on public.battle_messages
  for insert with check (auth.uid() = user_id and public.is_battle_member(room_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'battle_messages'
  ) then
    alter publication supabase_realtime add table public.battle_messages;
  end if;
end;
$$;
