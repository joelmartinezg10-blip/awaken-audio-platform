-- Adds the Academy Framework and signal-chain topic order to a live database.
-- Safe to re-run.

-- ─────────── 0004_reflect.sql ───────────

-- ============================================================
-- Awaken Audio — 0004  The Academy Framework
--
--   01 Learn  →  02 Listen  →  03 Practice  →  04 Apply  →  05 Reflect
--
-- Learn, Listen and Practice already existed as module kinds
-- (Practice is what the schema calls 'arcade' — the cabinets ARE
-- the practice step; renaming the enum value would break every
-- existing progress row for no gain, so the UI shows "Practice"
-- and the data keeps its original name).
--
-- Apply happens in a real service and is deliberately NOT tracked
-- here: there is no honest way for a browser to know somebody ran
-- a Sunday. It appears in the framework as a prompt, not a
-- checkbox.
--
-- Reflect IS tracked, because it produces something worth keeping.
-- ============================================================

do $$ begin
  alter type module_kind add value if not exists 'reflect';
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- What somebody wrote when they reflected on a topic.
-- One reflection per learner per topic, editable — a reflection
-- that cannot be revised is a form, not a reflection.
-- ------------------------------------------------------------
create table if not exists public.reflections (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  topic_id    uuid not null references public.topics(id)   on delete cascade,
  went_well   text not null default '',
  needs_work  text not null default '',
  next_rep    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, topic_id),
  constraint reflections_len check (
    char_length(went_well)  <= 2000 and
    char_length(needs_work) <= 2000 and
    char_length(next_rep)   <= 2000)
);
create index if not exists reflections_profile_idx on public.reflections(profile_id, updated_at desc);
create index if not exists reflections_topic_idx   on public.reflections(topic_id);

drop trigger if exists reflections_touch on public.reflections;
create trigger reflections_touch before update on public.reflections
  for each row execute function public.touch_updated_at();

-- A reflection counts as done once there is real substance in it.
-- The bar is deliberately low but not zero: three words is not a
-- reflection, and silently accepting one would make the step
-- meaningless.
create or replace function public.apply_reflection()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare m_id uuid; enough boolean;
begin
  select m.id into m_id
    from public.modules m
   where m.topic_id = new.topic_id and m.kind = 'reflect' and m.is_active
   limit 1;
  if m_id is null then return new; end if;

  enough := char_length(trim(new.went_well))  >= 40
        and char_length(trim(new.needs_work)) >= 40
        and char_length(trim(new.next_rep))   >= 20;

  insert into public.module_progress as p
    (profile_id, module_id, status, percent, last_activity_at, completed_at)
  values (new.profile_id, m_id,
          case when enough then 'complete' else 'in_progress' end::progress_status,
          case when enough then 100 else 40 end,
          now(),
          case when enough then now() end)
  on conflict (profile_id, module_id) do update set
    status = case when enough then 'complete'::progress_status
                  when p.status = 'complete' then 'complete'::progress_status
                  else 'in_progress'::progress_status end,
    percent = greatest(p.percent, case when enough then 100 else 40 end),
    last_activity_at = now(),
    completed_at = coalesce(p.completed_at, case when enough then now() end);

  update public.profiles set last_active_at = now() where id = new.profile_id;
  return new;
end $$;

drop trigger if exists reflection_applied on public.reflections;
create trigger reflection_applied after insert or update on public.reflections
  for each row execute function public.apply_reflection();

-- ------------------------------------------------------------
-- RLS — same scoping as every other piece of progress: yours, and
-- readable by an admin you are assigned to. A reflection is a
-- development conversation, not a diary, but it is still only
-- visible to the person developing you.
-- ------------------------------------------------------------
alter table public.reflections enable row level security;

drop policy if exists reflections_read on public.reflections;
create policy reflections_read on public.reflections
  for select to authenticated
  using (public.can_view_member(profile_id));

drop policy if exists reflections_self_write on public.reflections;
create policy reflections_self_write on public.reflections
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.topics t
      join public.enrollments e
        on e.course_id = t.course_id and e.profile_id = auth.uid()
      where t.id = topic_id));

drop policy if exists reflections_self_update on public.reflections;
create policy reflections_self_update on public.reflections
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- no delete policy: reflections are part of someone's development record

grant select, insert, update on public.reflections to authenticated;

-- ------------------------------------------------------------
-- Save a reflection without the client touching a UUID.
-- ------------------------------------------------------------
create or replace function public.save_reflection(
  p_topic_slug text,
  p_went_well text,
  p_needs_work text,
  p_next_rep text,
  p_course_slug text default 'awaken-audio')
returns public.reflections
language plpgsql security invoker set search_path = public, pg_temp as $$
declare t_id uuid; row public.reflections;
begin
  select t.id into t_id
    from public.topics t
    join public.courses c on c.id = t.course_id
   where c.slug = p_course_slug and t.slug = p_topic_slug and t.is_active;
  if t_id is null then
    raise exception 'unknown topic %', p_topic_slug using errcode='22023';
  end if;

  insert into public.reflections (profile_id, topic_id, went_well, needs_work, next_rep)
  values (auth.uid(), t_id,
          left(coalesce(p_went_well,''),2000),
          left(coalesce(p_needs_work,''),2000),
          left(coalesce(p_next_rep,''),2000))
  on conflict (profile_id, topic_id) do update set
    went_well  = excluded.went_well,
    needs_work = excluded.needs_work,
    next_rep   = excluded.next_rep
  returning * into row;
  return row;
end $$;

revoke all on function public.save_reflection(text,text,text,text,text) from public, anon;
grant execute on function public.save_reflection(text,text,text,text,text) to authenticated;

-- Reflections for one learner, for the admin drill-down.
create or replace function public.get_member_reflections(
  p_member uuid, p_course_slug text default 'awaken-audio')
returns table (
  topic_slug text, topic_title text, topic_order int,
  went_well text, needs_work text, next_rep text, updated_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  select t.slug, t.title, t.sort_order,
         r.went_well, r.needs_work, r.next_rep, r.updated_at
  from public.reflections r
  join public.topics t  on t.id = r.topic_id
  join public.courses c on c.id = t.course_id
  where r.profile_id = p_member and c.slug = p_course_slug
  order by t.sort_order;
$$;
revoke all on function public.get_member_reflections(uuid,text) from public, anon;
grant execute on function public.get_member_reflections(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- The rollups need a Reflect column. A view's column list cannot be
-- reordered by CREATE OR REPLACE, so both rollups are dropped and
-- rebuilt. v_course_progress reads from v_topic_progress, hence the
-- cascade and the rebuild of both.
-- ------------------------------------------------------------
drop view if exists public.v_course_progress;
drop view if exists public.v_topic_progress cascade;

create view public.v_topic_progress
with (security_invoker = on) as
select
  v.profile_id, v.course_id, v.course_slug,
  v.topic_id, v.topic_slug, v.topic_title, v.topic_order,
  count(*)::int                                              as modules_total,
  count(*) filter (where v.status = 'complete')::int         as modules_complete,
  max(v.status) filter (where v.module_kind = 'learn')       as learn_status,
  max(v.status) filter (where v.module_kind = 'listen')      as listen_status,
  max(v.status) filter (where v.module_kind = 'arcade')      as arcade_status,
  max(v.status) filter (where v.module_kind = 'reflect')     as reflect_status,
  max(v.percent) filter (where v.module_kind = 'arcade')     as arcade_percent,
  max(v.best_score) filter (where v.module_kind = 'arcade')  as arcade_best_score,
  max(v.last_score) filter (where v.module_kind = 'arcade')  as arcade_last_score,
  max(v.best_accuracy) filter (where v.module_kind = 'arcade') as arcade_best_accuracy,
  coalesce(sum(v.attempts) filter (where v.module_kind = 'arcade'), 0)::int as arcade_attempts,
  floor(avg(case when v.status = 'complete' then 100 else v.percent end))::int as percent,
  case
    when count(*) filter (where v.status = 'complete') = count(*) then 'complete'::progress_status
    when count(*) filter (where v.status <> 'not_started') > 0    then 'in_progress'::progress_status
    else 'not_started'::progress_status
  end as status,
  max(v.last_activity_at) as last_activity_at
from public.v_module_progress v
group by v.profile_id, v.course_id, v.course_slug,
         v.topic_id, v.topic_slug, v.topic_title, v.topic_order;

create view public.v_course_progress
with (security_invoker = on) as
select
  tp.profile_id, tp.course_id, tp.course_slug,
  count(*)::int                                       as topics_total,
  count(*) filter (where tp.status = 'complete')::int as topics_complete,
  floor(avg(tp.percent))::int                         as percent,
  case
    when count(*) filter (where tp.status = 'complete') = count(*) then 'complete'::progress_status
    when count(*) filter (where tp.status <> 'not_started') > 0    then 'in_progress'::progress_status
    else 'not_started'::progress_status
  end as status,
  max(tp.last_activity_at) as last_activity_at
from public.v_topic_progress tp
group by tp.profile_id, tp.course_id, tp.course_slug;

grant select on public.v_topic_progress, public.v_course_progress to authenticated;

drop function if exists public.get_member_topic_progress(uuid, text);
create or replace function public.get_member_topic_progress(
  p_member uuid, p_course_slug text default 'awaken-audio')
returns table (
  topic_slug        text,
  topic_title       text,
  topic_order       int,
  learn_status      progress_status,
  listen_status     progress_status,
  arcade_status     progress_status,
  reflect_status    progress_status,
  arcade_best_score int,
  arcade_last_score int,
  arcade_best_accuracy numeric,
  arcade_attempts   int,
  percent           int,
  status            progress_status,
  last_activity_at  timestamptz
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select tp.topic_slug, tp.topic_title, tp.topic_order,
         tp.learn_status, tp.listen_status, tp.arcade_status, tp.reflect_status,
         tp.arcade_best_score, tp.arcade_last_score, tp.arcade_best_accuracy,
         tp.arcade_attempts, tp.percent, tp.status, tp.last_activity_at
  from public.v_topic_progress tp
  where tp.profile_id = p_member and tp.course_slug = p_course_slug
  order by tp.topic_order;
$$;
revoke all on function public.get_member_topic_progress(uuid, text) from public, anon;
grant execute on function public.get_member_topic_progress(uuid, text) to authenticated;


-- ─────────── 0003_iem_module.sql ───────────

-- ============================================================
-- The IEM Mix Room becomes a real module.
-- Idempotent — safe to re-run.
-- ============================================================

-- A monitors topic to hang it on. Ordered after the FOH fundamentals.
with c as (select id from public.courses where slug='awaken-audio')
insert into public.topics (course_id, slug, title, summary, sort_order)
select c.id, 'monitors', 'MONITORS & IEMS',
       'Build a mix somebody else has to live inside for an hour.', 7
from c
on conflict (course_id, slug) do update set
  title=excluded.title, summary=excluded.summary, sort_order=excluded.sort_order;

with c as (select id from public.courses where slug='awaken-audio')
insert into public.modules (topic_id, kind, ui_key, title, is_scored, pass_accuracy, sort_order)
select t.id, 'listen'::module_kind, 'listen-iem', 'IEM Mix Room', false, null, 1
from c join public.topics t on t.course_id = c.id and t.slug = 'monitors'
on conflict (ui_key) do update set
  topic_id=excluded.topic_id, kind=excluded.kind, title=excluded.title,
  sort_order=excluded.sort_order, is_active=true;

select t.title as topic, m.kind, m.ui_key, m.title
from public.modules m
join public.topics t on t.id = m.topic_id
order by t.sort_order, m.sort_order;


-- ─────────── 0004_framework.sql ───────────

-- ============================================================
-- START HERE, and a Reflect step on every technical topic.
-- Idempotent — safe to re-run.
-- ============================================================

-- START HERE sits before everything. sort_order 0 keeps it first
-- without renumbering the topics that already exist.
with c as (select id from public.courses where slug='awaken-audio')
insert into public.topics (course_id, slug, title, summary, sort_order)
select c.id, 'start-here', 'START HERE',
       'Turning knowledge into skill — how the Academy develops engineers.', 0
from c
on conflict (course_id, slug) do update set
  title=excluded.title, summary=excluded.summary, sort_order=excluded.sort_order;

with c as (select id from public.courses where slug='awaken-audio')
insert into public.modules (topic_id, kind, ui_key, title, is_scored, pass_accuracy, sort_order)
select t.id, 'learn'::module_kind, 'learn-start', 'Turning Knowledge Into Skill', false, null, 1
from c join public.topics t on t.course_id = c.id and t.slug = 'start-here'
on conflict (ui_key) do update set
  topic_id=excluded.topic_id, kind=excluded.kind, title=excluded.title, is_active=true;

-- A Reflect module on every topic except START HERE itself —
-- there is nothing yet to reflect on when you have only just arrived.
with c as (select id from public.courses where slug='awaken-audio')
insert into public.modules (topic_id, kind, ui_key, title, is_scored, pass_accuracy, sort_order)
select t.id, 'reflect'::module_kind, 'reflect-'||t.slug, 'Reflect', false, null, 90
from c join public.topics t on t.course_id = c.id
where t.slug <> 'start-here' and t.is_active
on conflict (ui_key) do update set
  topic_id=excluded.topic_id, kind=excluded.kind, title=excluded.title,
  sort_order=excluded.sort_order, is_active=true;

select t.sort_order, t.title as topic,
       string_agg(m.kind::text, ' → ' order by m.sort_order) as steps
from public.topics t
left join public.modules m on m.topic_id = t.id and m.is_active
join public.courses c on c.id = t.course_id and c.slug='awaken-audio'
group by t.sort_order, t.title
order by t.sort_order;


-- ─────────── 0005_signal_chain_order.sql ───────────

-- ============================================================
-- Topic order follows the signal chain, so the dashboards list
-- topics in the same order as the Learn and Listen tabs — and
-- in the same order as a dLive channel strip:
--
--   Gain  →  HPF  →  EQ  →  Compressor  →  FX sends
--
-- Feedback comes after the strip because it is not a processor
-- on it; it is what the whole system does when a loop closes.
-- Idempotent.
-- ============================================================
update public.topics t
   set sort_order = v.n
  from (values
    ('start-here',     0),
    ('gain-structure', 1),
    ('high-pass',      2),
    ('eq',             3),
    ('compression',    4),
    ('time-space',     5),
    ('feedback',       6),
    ('monitors',       7)
  ) as v(slug, n)
 where t.slug = v.slug
   and t.course_id = (select id from public.courses where slug='awaken-audio')
   and t.sort_order is distinct from v.n;

select sort_order, slug, title from public.topics
 where course_id = (select id from public.courses where slug='awaken-audio')
 order by sort_order;

