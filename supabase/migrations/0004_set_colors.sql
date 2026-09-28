-- Shiku Shiku -- feature migration 4
--
-- Adds an optional colour to sets, used for the set's block on the home page.
-- Null means "automatic": the app picks one of the four paint colours from the
-- set's id. Safe to run after 0003_group_colors.sql.

alter table public.sets
  add column if not exists color text;

alter table public.sets
  drop constraint if exists sets_color_format;

alter table public.sets
  add constraint sets_color_format check (color is null or color ~* '^#[0-9a-f]{6}$');
