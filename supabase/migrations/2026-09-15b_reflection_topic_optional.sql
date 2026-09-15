-- A reflection no longer needs a topic — 15 Sep 2026
--
-- Follows 2026-09-15_reflection_journal.sql. That made reflections a
-- journal; this lets an entry be about a SERVICE rather than a module.
-- "Sunday 9:00 went sideways on the pastor mic" is the most valuable
-- thing a volunteer can write down, and it belongs to no topic.
--
-- topic_id becomes nullable. A null-topic entry earns no Reflect step on
-- any topic — apply_reflection already returns early when it finds no
-- reflect module, which is the correct behaviour rather than an accident:
-- a service note is not evidence you have reflected on compression.
--
-- Idempotent. Safe to run twice.

begin;

alter table public.reflections alter column topic_id drop not null;

-- Uniqueness in two halves. A single constraint cannot express this,
-- because NULLs are distinct in a unique index — without the second
-- index a volunteer could file unlimited service entries on one date by
-- pressing Save twice.
alter table public.reflections
  drop constraint if exists reflections_one_per_service;

drop index if exists public.reflections_one_per_topic_service;
create unique index reflections_one_per_topic_service
  on public.reflections (profile_id, topic_id, served_on)
  where topic_id is not null;

drop index if exists public.reflections_one_service_per_day;
create unique index reflections_one_service_per_day
  on public.reflections (profile_id, served_on)
  where topic_id is null;

-- The insert policy proved enrolment by way of the topic. With no topic
-- there is nothing to join through, so prove it directly instead.
drop policy if exists reflections_self_write on public.reflections;
create policy reflections_self_write on public.reflections
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (
      topic_id is null
        and exists (select 1 from public.enrollments e where e.profile_id = auth.uid())
      or exists (
        select 1 from public.topics t
        join public.enrollments e
          on e.course_id = t.course_id and e.profile_id = auth.uid()
        where t.id = reflections.topic_id)
    )
  );

-- save_reflection: p_topic_slug may now be null ----------------------
create or replace function public.save_reflection(
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
declare t_id uuid; row public.reflections; d date; slug text;
begin
  slug := nullif(trim(coalesce(p_topic_slug, '')), '');

  if slug is not null then
    select t.id into t_id
      from public.topics t
      join public.courses c on c.id = t.course_id
     where c.slug = p_course_slug and t.slug = slug and t.is_active;
    if t_id is null then
      raise exception 'unknown topic %', slug using errcode='22023';
    end if;
  end if;

  d := least(coalesce(p_served_on, current_date), current_date);

  -- Two uniqueness rules means two upsert targets; ON CONFLICT cannot
  -- name a partial index by column list, so the null-topic case is an
  -- explicit update-then-insert.
  if t_id is null then
    update public.reflections set
      service_label = nullif(trim(left(coalesce(p_service_label,''), 80)), ''),
      went_well     = left(coalesce(p_went_well,''),2000),
      needs_work    = left(coalesce(p_needs_work,''),2000),
      next_rep      = left(coalesce(p_next_rep,''),2000)
     where profile_id = auth.uid() and topic_id is null and served_on = d
    returning * into row;
    if found then return row; end if;

    insert into public.reflections
      (profile_id, topic_id, served_on, service_label, went_well, needs_work, next_rep)
    values (auth.uid(), null, d,
            nullif(trim(left(coalesce(p_service_label,''), 80)), ''),
            left(coalesce(p_went_well,''),2000),
            left(coalesce(p_needs_work,''),2000),
            left(coalesce(p_next_rep,''),2000))
    returning * into row;
    return row;
  end if;

  insert into public.reflections
    (profile_id, topic_id, served_on, service_label, went_well, needs_work, next_rep)
  values (auth.uid(), t_id, d,
          nullif(trim(left(coalesce(p_service_label,''), 80)), ''),
          left(coalesce(p_went_well,''),2000),
          left(coalesce(p_needs_work,''),2000),
          left(coalesce(p_next_rep,''),2000))
  on conflict (profile_id, topic_id, served_on) where topic_id is not null
  do update set
    service_label = excluded.service_label,
    went_well     = excluded.went_well,
    needs_work    = excluded.needs_work,
    next_rep      = excluded.next_rep
  returning * into row;
  return row;
end $function$;

-- Readers: LEFT join the topic ---------------------------------------
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
  select r.id, t.slug, t.title, coalesce(t.sort_order, 0),
         r.served_on, r.service_label,
         r.went_well, r.needs_work, r.next_rep, r.updated_at
  from public.reflections r
  left join public.topics t  on t.id = r.topic_id
  left join public.courses c on c.id = t.course_id
  where r.profile_id = p_member
    and (r.topic_id is null or c.slug = p_course_slug)
  order by r.served_on desc, coalesce(t.sort_order, 0);
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
  left join public.topics t on t.id = r.topic_id
  where (p_campus is null or pr.campus = p_campus)
  order by r.served_on desc, r.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$function$;

commit;

select 'topic now optional' as result,
       count(*) filter (where topic_id is null) as service_entries,
       count(*) as total
from public.reflections;
