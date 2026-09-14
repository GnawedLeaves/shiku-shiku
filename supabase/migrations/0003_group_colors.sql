-- Shiku Shiku -- feature migration 3
--
-- Adds a colour to groups (tags), so they can be shown visually distinct from
-- one another. Safe to run after 0001_init.sql and 0002_social_history_tagging.sql.

alter table public.groups
  add column if not exists color text;

alter table public.groups
  drop constraint if exists groups_color_format;

alter table public.groups
  add constraint groups_color_format check (color is null or color ~* '^#[0-9a-f]{6}$');
