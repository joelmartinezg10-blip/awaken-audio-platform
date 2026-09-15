-- Reflections become a journal — 15 Sep 2026
--
-- Until now reflections held ONE row per person per topic, and
-- save_reflection did `on conflict (profile_id, topic_id) do update`.
-- Reflecting on EQ after this Sunday silently overwrote what the same
-- person wrote about EQ last month. There was no history, which is why
-- there was no date to show.
--
-- After this: one reflection per person, per topic, per SERVED DATE.
-- Same-day edits still upsert, so the form keeps behaving as it does now;
-- a different date is a new entry. service_label is free text for now
-- ("9:00 Sunday", "Midweek") and is the natural seam for a Planning
-- Center Services integration later — a PCO plan id and title drop
-- straight into these two columns.
--
-- Idempotent. Safe to run twice.

begin;

-- 1. Columns -----------------------------------------------------------
alter table public.reflections
  add column if not exists served_on     date,
  add column if not exists service_label text;

-- Backfill before the NOT NULL: an existing reflection is dated to the
-- last time its author touched it, which is the only honest guess.
update public.reflections
   set served_on = coalesce(served_on, updated_at::date, current_date)
 where served_on is null;

alter table public.reflections
  alter column served_on set default current_date,
  alter column served_on set not null;

alter table public.reflections
  drop constraint if exists reflections_service_label_len;
alter table public.reflections
  add constraint reflections_service_label_len
  check (service_label is null or char_length(service_label) <= 80);

-- 2. Swap the uniqueness rule -----------------------------------------
-- The old rule is what made a second reflection an overwrite. Find it by
-- shape rather than by name, because the name was never written down
-- anywhere this repo still has.
do $$
declare n text;
begin
  for n in
    select conname from pg_constraint
     where conrelid = 'public.reflections'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) like '%(profile_id, topic_id)'
  loop
    execute format('alter table public.reflections drop constraint %I', n);
  end loop;

  for n in
    select indexname from pg_indexes
     where schemaname = 'public' and tablename = 'reflections'
       and indexdef like '%UNIQUE%(profile_id, topic_id)'
  loop
    execute format('drop index public.%I', n);
  end loop;
end $$;

alter table public.reflections
  drop constraint if exists reflections_one_per_service;
alter table public.reflections
  add constraint reflections_one_per_service
  unique (profile_id, topic_id, served_on);

-- 3. A journal entry can be deleted by its author ----------------------
-- No table had a DELETE policy, so nothing could ever be removed from a
-- browser. That was right for append-only arcade history. It is wrong for
-- a journal: a reflection filed against the wrong date, or written in the
-- wrong box, should be the author's to withdraw. Theirs only — a trainer
-- cannot delete somebody's words.
drop policy if exists reflections_self_delete on public.reflections;
create policy reflections_self_delete on public.reflections
  for delete to authenticated
  using (profile_id = auth.uid());

-- 4. save_reflection --------------------------------------------------
drop function if exists public.save_reflection(text, text, text, text, text);

create function public.save_reflection(
  p_topic_slug    text,
  p_went_well     text,
  p_needs_work    text,
  p_next_rep      text,
  p_served_on     date    default current_date,
  p_service_label text    default null,
  p_course_slug   text    default 'awaken-audio'
) returns public.reflections
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
declare t_id uuid; row public.reflections; d date;
begin
  select t.id into t_id
    from public.topics t
    join public.courses c on c.id = t.course_id
   where c.slug = p_course_slug and t.slug = p_topic_slug and t.is_active;
  if t_id is null then
    raise exception 'unknown topic %', p_topic_slug using errcode='22023';
  end if;

  -- A reflection is about a service that has happened. A future date is
  -- a typo, not a plan.
  d := least(coalesce(p_served_on, current_date), current_date);

  insert into public.reflections
    (profile_id, topic_id, served_on, service_label, went_well, needs_work, next_rep)
  values (auth.uid(), t_id, d,
          nullif(trim(left(coalesce(p_service_label,''), 80)), ''),
          left(coalesce(p_went_well,''),2000),
          left(coalesce(p_needs_work,''),2000),
          left(coalesce(p_next_rep,''),2000))
  on conflict (profile_id, topic_id, served_on) do update set
    service_label = excluded.service_label,
    went_well     = excluded.went_well,
    needs_work    = excluded.needs_work,
    next_rep      = excluded.next_rep
  returning * into row;
  return row;
end $function$;

-- 5. Readers ----------------------------------------------------------
drop function if exists public.get_member_reflections(uuid, text);

create function public.get_member_reflections(
  p_member uuid, p_course_slug text default 'awaken-audio'
) returns table(
  reflection_id uuid, topic_slug text, topic_title text, topic_order int,
  served_on date, service_label text,
  went_well text, needs_work text, next_rep text, updated_at timestamptz)
  language sql stable
  set search_path to 'public', 'pg_temp'
as $function$
  select r.id, t.slug, t.title, t.sort_order,
         r.served_on, r.service_label,
         r.went_well, r.needs_work, r.next_rep, r.updated_at
  from public.reflections r
  join public.topics t  on t.id = r.topic_id
  join public.courses c on c.id = t.course_id
  where r.profile_id = p_member and c.slug = p_course_slug
  order by r.served_on desc, t.sort_order;
$function$;

drop function if exists public.get_campus_reflections(text, integer, text);

create function public.get_campus_reflections(
  p_campus text default null, p_limit int default 40,
  p_course_slug text default 'awaken-audio'
) returns table(
  profile_id uuid, full_name text, campus text, topic_title text,
  served_on date, service_label text,
  went_well text, needs_work text, next_rep text, updated_at timestamptz)
  language sql stable
  set search_path to 'public', 'pg_temp'
as $function$
  select r.profile_id, pr.full_name, pr.campus, t.title,
         r.served_on, r.service_label,
         r.went_well, r.needs_work, r.next_rep, r.updated_at
  from public.reflections r
  join public.profiles pr on pr.id = r.profile_id
  join public.topics t on t.id = r.topic_id
  where (p_campus is null or pr.campus = p_campus)
  order by r.served_on desc, r.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$function$;

commit;

-- Both readers stay SECURITY INVOKER. RLS does the scoping, and
-- reflections_read still routes through can_read_reflection(), so a
-- campus peer gains nothing from a longer journal.
select 'reflection journal applied' as result,
       count(*) as reflections, count(distinct served_on) as distinct_dates
from public.reflections;
