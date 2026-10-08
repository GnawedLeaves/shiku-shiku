-- Shiku Shiku -- feature migration 6
--
-- Tracks time actually spent studying. The study screen counts only while it's
-- open and visible, and saves the running total to study_sessions.active_seconds
-- (with each answer, periodically, and on pause/exit). A paused session that's
-- resumed days later no longer counts the days in between.
--
-- When record_swipe writes the finished session's result row, a trigger swaps
-- the wall-clock duration for that active time -- so record_swipe itself is
-- unchanged. Sessions with no tracked time (e.g. finished before this
-- migration) keep the wall-clock duration.
--
-- Safe to run after 0005_flashcards_mode.sql.

alter table public.study_sessions
  add column if not exists active_seconds integer not null default 0;

alter table public.study_sessions
  drop constraint if exists study_sessions_active_seconds_check;

alter table public.study_sessions
  add constraint study_sessions_active_seconds_check check (active_seconds >= 0);

create or replace function public.session_results_use_active_time()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active integer;
begin
  if new.session_id is not null then
    select active_seconds into v_active
    from public.study_sessions
    where id = new.session_id;

    if coalesce(v_active, 0) > 0 then
      new.duration_seconds := v_active;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_results_active_time on public.session_results;

create trigger session_results_active_time
  before insert on public.session_results
  for each row execute function public.session_results_use_active_time();
