-- Shiku Shiku -- feature migration 5
--
-- Adds a "flashcards" study mode alongside the scored quiz mode. In flashcards
-- mode "don't know" doesn't fail a card: it goes back into the deck at a later
-- position and comes round again until the user knows it. There's no score;
-- the result records how many times "don't know" was pressed instead.
--
-- The mode lives on study_sessions.scope ->> 'studyMode' (absent = 'quiz').
-- Safe to run after 0004_set_colors.sql.

alter table public.session_results
  add column if not exists study_mode text not null default 'quiz',
  add column if not exists dont_know_count integer not null default 0;

alter table public.session_results
  drop constraint if exists session_results_study_mode_check;

alter table public.session_results
  add constraint session_results_study_mode_check check (study_mode in ('quiz', 'flashcards'));

-- ---------------------------------------------------------------------------
-- record_swipe: gains p_requeue_position for flashcards mode. The client picks
-- where a missed card goes back in (so its optimistic update matches exactly)
-- and the server clamps it to the remaining range:
--   card entry  -> once removed, the entry is re-inserted `position` entries
--                  after the current index, i.e. that many cards come first;
--   group entry -> the card moves behind `position` of the group's other
--                  pending cards.
-- Mirrored in src/lib/study/applyGrade.ts -- keep the two in step.
--
-- The old 3-argument version is dropped so named-argument RPC calls can't be
-- ambiguous between the two.
-- ---------------------------------------------------------------------------
drop function if exists public.record_swipe(uuid, uuid, text);

create or replace function public.record_swipe(
  p_session_id uuid,
  p_card_id uuid,
  p_result text,
  p_requeue_position integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.study_sessions%rowtype;
  v_flashcards boolean;
  v_queue jsonb;
  v_index integer;
  v_entry jsonb;
  v_resolved boolean;
  v_complete boolean;
  v_remaining integer;
  v_offset integer;
  v_pending_others text[];
  v_done text[];
  v_correct integer;
  v_total integer;
  v_misses integer;
  v_details jsonb;
  v_set_id uuid;
  v_set_name text;
begin
  if p_result not in ('correct', 'incorrect') then
    raise exception 'Invalid result %', p_result;
  end if;

  select * into v_session
  from public.study_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Session not found';
  end if;

  v_flashcards := coalesce(v_session.scope ->> 'studyMode', 'quiz') = 'flashcards';
  v_queue := v_session.queue;
  v_index := v_session.current_index;
  v_entry := v_queue -> v_index;

  if v_entry is null then
    raise exception 'This session is already complete';
  end if;

  if v_entry ->> 'type' = 'card' then
    if (v_entry ->> 'cardId')::uuid <> p_card_id then
      raise exception 'Card does not match the current queue entry';
    end if;

    if v_flashcards and p_result = 'incorrect' then
      v_entry := jsonb_set(
        v_entry, '{misses}', to_jsonb(coalesce((v_entry ->> 'misses')::integer, 0) + 1)
      );
      v_resolved := false;
    else
      v_entry := jsonb_set(v_entry, '{status}', to_jsonb(p_result));
      v_resolved := true;
    end if;
    v_queue := jsonb_set(v_queue, array[v_index::text], v_entry);

    -- Flashcards: send the missed card further back into the deck. If it's the
    -- last card left it simply comes straight back.
    v_remaining := jsonb_array_length(v_queue) - v_index - 1;
    if v_flashcards and p_result = 'incorrect' and v_remaining > 0 then
      v_offset := least(greatest(coalesce(p_requeue_position, v_remaining), 1), v_remaining);
      select jsonb_agg(t.entry order by
        case when t.ord - 1 = v_index then v_index + v_offset + 0.5 else t.ord - 1 end)
      into v_queue
      from jsonb_array_elements(v_queue) with ordinality as t(entry, ord);
    end if;
  else
    if not (v_entry -> 'statuses' ? p_card_id::text) then
      raise exception 'Card does not belong to the current group';
    end if;

    if v_flashcards and p_result = 'incorrect' then
      v_entry := jsonb_set(
        v_entry,
        '{misses}',
        coalesce(v_entry -> 'misses', '{}'::jsonb) || jsonb_build_object(
          p_card_id::text,
          coalesce((v_entry -> 'misses' ->> p_card_id::text)::integer, 0) + 1
        )
      );

      -- Graded cards first, then the pending ones in study order with the
      -- missed card moved behind `offset` of the others.
      select coalesce(array_agg(t.id order by t.ord), '{}')
      into v_pending_others
      from jsonb_array_elements_text(v_entry -> 'cardIds') with ordinality as t(id, ord)
      where v_entry -> 'statuses' ->> t.id = 'pending' and t.id <> p_card_id::text;

      select coalesce(array_agg(t.id order by t.ord), '{}')
      into v_done
      from jsonb_array_elements_text(v_entry -> 'cardIds') with ordinality as t(id, ord)
      where v_entry -> 'statuses' ->> t.id <> 'pending';

      v_remaining := coalesce(array_length(v_pending_others, 1), 0);
      if v_remaining > 0 then
        v_offset := least(greatest(coalesce(p_requeue_position, v_remaining), 1), v_remaining);
        v_entry := jsonb_set(
          v_entry,
          '{cardIds}',
          to_jsonb(
            v_done
            || v_pending_others[1:v_offset]
            || array[p_card_id::text]
            || v_pending_others[v_offset + 1:v_remaining]
          )
        );
      end if;
    else
      v_entry := jsonb_set(v_entry, array['statuses', p_card_id::text], to_jsonb(p_result));
    end if;

    v_resolved := not exists (
      select 1 from jsonb_each_text(v_entry -> 'statuses') kv where kv.value = 'pending'
    );
    v_queue := jsonb_set(v_queue, array[v_index::text], v_entry);
  end if;

  if v_resolved then
    v_index := v_index + 1;
  end if;
  v_complete := v_index >= jsonb_array_length(v_queue);

  insert into public.card_progress (user_id, card_id, times_correct, times_incorrect, last_reviewed_at)
  values (
    auth.uid(),
    p_card_id,
    case when p_result = 'correct' then 1 else 0 end,
    case when p_result = 'incorrect' then 1 else 0 end,
    now()
  )
  on conflict (user_id, card_id) do update set
    times_correct = card_progress.times_correct + excluded.times_correct,
    times_incorrect = card_progress.times_incorrect + excluded.times_incorrect,
    last_reviewed_at = excluded.last_reviewed_at;

  update public.study_sessions
  set queue = v_queue,
      current_index = v_index,
      status = case when v_complete then 'completed' else status end
  where id = p_session_id;

  if not v_complete then
    return jsonb_build_object(
      'queue', v_queue,
      'currentIndex', v_index,
      'isComplete', false
    );
  end if;

  -- Flatten the finished queue into one row per graded card.
  with entries as (
    select ord, entry
    from jsonb_array_elements(v_queue) with ordinality as t(entry, ord)
  ),
  flat as (
    select ord, 0 as sub, (entry ->> 'cardId')::uuid as card_id, entry ->> 'status' as result,
           coalesce((entry ->> 'misses')::integer, 0) as misses
    from entries
    where entry ->> 'type' = 'card'
    union all
    select e.ord, row_number() over (partition by e.ord order by kv.key) as sub,
           (kv.key)::uuid, kv.value,
           coalesce((e.entry -> 'misses' ->> kv.key)::integer, 0)
    from entries e
    cross join jsonb_each_text(e.entry -> 'statuses') kv
    where e.entry ->> 'type' = 'group'
  )
  select
    -- Flashcards has no right/wrong: "correct" there means known first time.
    count(*) filter (where f.result = 'correct' and f.misses = 0),
    count(*),
    coalesce(sum(f.misses), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'card_id', f.card_id,
          'question', c.question,
          'answer_hiragana', c.answer_hiragana,
          'answer_romaji', c.answer_romaji,
          'result', f.result,
          'misses', f.misses
        )
        order by f.ord, f.sub
      ),
      '[]'::jsonb
    )
  into v_correct, v_total, v_misses, v_details
  from flat f
  left join public.cards c on c.id = f.card_id;

  v_set_id := (v_session.scope ->> 'setId')::uuid;
  select name into v_set_name from public.sets where id = v_set_id;

  insert into public.session_results (
    session_id, user_id, set_id, set_name, score_percentage,
    correct_count, total_count, duration_seconds, details,
    study_mode, dont_know_count
  )
  values (
    p_session_id,
    auth.uid(),
    v_set_id,
    v_set_name,
    case when v_total > 0 then round((v_correct::numeric / v_total) * 100, 2) else 0 end,
    v_correct,
    v_total,
    greatest(0, extract(epoch from (now() - v_session.started_at))::integer),
    v_details,
    case when v_flashcards then 'flashcards' else 'quiz' end,
    v_misses
  );

  return jsonb_build_object(
    'queue', v_queue,
    'currentIndex', v_index,
    'isComplete', true,
    'correct', v_correct,
    'total', v_total
  );
end;
$$;
grant execute on function public.record_swipe(uuid, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- set_scoreboard: flashcards sessions have no score, so only quiz results
-- count. Otherwise unchanged from 0002.
-- ---------------------------------------------------------------------------
create or replace function public.set_scoreboard(p_set_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  best_score numeric,
  sessions_played bigint,
  last_played timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root uuid;
  v_shared boolean;
begin
  select coalesce(s.origin_set_id, s.id) into v_root from public.sets s where s.id = p_set_id;
  if v_root is null then
    return;
  end if;

  select (r.share_code is not null or r.is_public) into v_shared
  from public.sets r where r.id = v_root;

  if not coalesce(v_shared, false) then
    -- Not a shared set: only the owner sees their own board.
    if not exists (select 1 from public.sets s where s.id = p_set_id and s.owner_id = auth.uid()) then
      return;
    end if;
  end if;

  return query
  select
    sr.user_id,
    p.display_name,
    p.avatar_url,
    max(sr.score_percentage) as best_score,
    count(*) as sessions_played,
    max(sr.completed_at) as last_played
  from public.session_results sr
  join public.sets s on s.id = sr.set_id
  left join public.profiles p on p.id = sr.user_id
  where coalesce(s.origin_set_id, s.id) = v_root
    and sr.study_mode = 'quiz'
  group by sr.user_id, p.display_name, p.avatar_url
  order by max(sr.score_percentage) desc, max(sr.completed_at) asc;
end;
$$;

grant execute on function public.set_scoreboard(uuid) to authenticated;
