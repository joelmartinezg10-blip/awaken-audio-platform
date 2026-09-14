-- ============================================================
-- Awaken Audio — 0003 progress rollups
--
-- Every view is security_invoker, so the RLS policies in 0002 are
-- what decide which rows come back. A view is not a back door.
-- ============================================================

-- ------------------------------------------------------------
-- One row per (learner, module) for every module of every course
-- the learner is enrolled in — including modules never touched,
-- which is what makes "Not Started" a real state rather than a
-- missing row the front-end has to guess at.
-- ------------------------------------------------------------
create or replace view public.v_module_progress
with (security_invoker = on) as
select
  e.profile_id,
  c.id    as course_id,
  c.slug  as course_slug,
  c.title as course_title,
  t.id    as topic_id,
  t.slug  as topic_slug,
  t.title as topic_title,
  t.sort_order as topic_order,
  m.id    as module_id,
  m.kind  as module_kind,
  m.ui_key,
  m.title as module_title,
  m.is_scored,
  m.pass_accuracy,
  m.sort_order as module_order,
  coalesce(p.status, 'not_started'::progress_status) as status,
  coalesce(p.percent, 0) as percent,
  p.best_score,
  p.last_score,
  p.best_accuracy,
  p.last_accuracy,
  coalesce(p.attempts, 0) as attempts,
  p.last_activity_at,
  p.completed_at
from public.enrollments e
join public.courses c on c.id = e.course_id
join public.topics  t on t.course_id = c.id and t.is_active
join public.modules m on m.topic_id = t.id and m.is_active
left join public.module_progress p
       on p.module_id = m.id and p.profile_id = e.profile_id;

-- ------------------------------------------------------------
-- Topic rollup — the shape the dashboards actually render.
-- ------------------------------------------------------------
create or replace view public.v_topic_progress
with (security_invoker = on) as
select
  v.profile_id,
  v.course_id,
  v.course_slug,
  v.topic_id,
  v.topic_slug,
  v.topic_title,
  v.topic_order,
  count(*)::int                                              as modules_total,
  count(*) filter (where v.status = 'complete')::int         as modules_complete,
  max(v.status) filter (where v.module_kind = 'learn')       as learn_status,
  max(v.status) filter (where v.module_kind = 'listen')      as listen_status,
  max(v.status) filter (where v.module_kind = 'arcade')      as arcade_status,
  max(v.percent) filter (where v.module_kind = 'arcade')     as arcade_percent,
  max(v.best_score) filter (where v.module_kind = 'arcade')  as arcade_best_score,
  max(v.last_score) filter (where v.module_kind = 'arcade')  as arcade_last_score,
  max(v.best_accuracy) filter (where v.module_kind = 'arcade') as arcade_best_accuracy,
  coalesce(sum(v.attempts) filter (where v.module_kind = 'arcade'), 0)::int as arcade_attempts,
  -- a topic's percent is the mean of its modules' percents, where a
  -- completed non-scored module counts as 100
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

-- ------------------------------------------------------------
-- Course rollup.
-- ------------------------------------------------------------
create or replace view public.v_course_progress
with (security_invoker = on) as
select
  tp.profile_id,
  tp.course_id,
  tp.course_slug,
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

grant select on public.v_module_progress, public.v_topic_progress,
                public.v_course_progress to authenticated;

-- ------------------------------------------------------------
-- The learner's next thing to do: lowest-ordered topic in the
-- course that is not yet complete.
-- ------------------------------------------------------------
create or replace function public.get_next_topic(p_course_slug text)
returns table (topic_slug text, topic_title text, percent int, status progress_status)
language sql stable security invoker set search_path = public, pg_temp as $$
  select tp.topic_slug, tp.topic_title, tp.percent, tp.status
  from public.v_topic_progress tp
  where tp.profile_id = auth.uid()
    and tp.course_slug = p_course_slug
    and tp.status <> 'complete'
  order by (tp.status = 'in_progress') desc, tp.topic_order
  limit 1;
$$;

-- ------------------------------------------------------------
-- Admin roster. Runs as the caller, so an admin who is not
-- assigned a learner simply gets no row for them — the scoping
-- is the RLS policy, not this function's WHERE clause.
-- ------------------------------------------------------------
create or replace function public.get_assigned_users(p_course_slug text default 'awaken-audio')
returns table (
  profile_id     uuid,
  full_name      text,
  email          text,
  campus         text,
  percent        int,
  status         progress_status,
  topics_total   int,
  topics_complete int,
  current_topic  text,
  last_active_at timestamptz
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    pr.id,
    pr.full_name,
    pr.email,
    pr.campus,
    coalesce(cp.percent, 0),
    coalesce(cp.status, 'not_started'::progress_status),
    coalesce(cp.topics_total, 0),
    coalesce(cp.topics_complete, 0),
    (select tp.topic_title
       from public.v_topic_progress tp
      where tp.profile_id = pr.id and tp.course_slug = p_course_slug
        and tp.status <> 'complete'
      order by (tp.status = 'in_progress') desc, tp.topic_order
      limit 1),
    greatest(pr.last_active_at, cp.last_activity_at)
  from public.admin_user_assignments a
  join public.profiles pr on pr.id = a.member_id
  left join public.v_course_progress cp
    on cp.profile_id = pr.id and cp.course_slug = p_course_slug
  where a.admin_id = auth.uid()
  order by pr.full_name;
$$;

-- ------------------------------------------------------------
-- Per-learner detail for the admin drill-down. Same story: the
-- view's RLS decides whether any rows come back.
-- ------------------------------------------------------------
create or replace function public.get_member_topic_progress(
  p_member uuid, p_course_slug text default 'awaken-audio')
returns table (
  topic_slug        text,
  topic_title       text,
  topic_order       int,
  learn_status      progress_status,
  listen_status     progress_status,
  arcade_status     progress_status,
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
         tp.learn_status, tp.listen_status, tp.arcade_status,
         tp.arcade_best_score, tp.arcade_last_score, tp.arcade_best_accuracy,
         tp.arcade_attempts,
         tp.percent, tp.status, tp.last_activity_at
  from public.v_topic_progress tp
  where tp.profile_id = p_member and tp.course_slug = p_course_slug
  order by tp.topic_order;
$$;

revoke all on function public.get_next_topic(text) from public, anon;
revoke all on function public.get_assigned_users(text) from public, anon;
revoke all on function public.get_member_topic_progress(uuid, text) from public, anon;
grant execute on function public.get_next_topic(text) to authenticated;
grant execute on function public.get_assigned_users(text) to authenticated;
grant execute on function public.get_member_topic_progress(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- The one write the client makes for learn/listen modules.
-- Resolves the front-end's ui_key to a module id so the training
-- code never handles a UUID, and is idempotent — replaying it
-- cannot walk a completed module backwards.
-- ------------------------------------------------------------
create or replace function public.record_module_progress(
  p_ui_key text,
  p_status progress_status default 'in_progress',
  p_percent int default null)
returns public.module_progress
language plpgsql security invoker set search_path = public, pg_temp as $$
declare m_id uuid; row public.module_progress;
begin
  select id into m_id from public.modules where ui_key = p_ui_key and is_active;
  if m_id is null then raise exception 'unknown module %', p_ui_key using errcode='22023'; end if;

  insert into public.module_progress (profile_id, module_id, status, percent)
  values (auth.uid(), m_id, p_status, coalesce(p_percent, case when p_status='complete' then 100 else 0 end))
  on conflict (profile_id, module_id) do update set
    status  = case when public.module_progress.status = 'complete'
                   then 'complete'::progress_status else excluded.status end,
    percent = greatest(public.module_progress.percent, excluded.percent)
  returning * into row;
  return row;
end $$;

create or replace function public.record_arcade_attempt(
  p_ui_key text, p_score int, p_accuracy numeric default null,
  p_max_streak int default null, p_wave int default null,
  p_duration_ms int default null, p_completed boolean default false,
  p_detail jsonb default '{}'::jsonb)
returns public.arcade_attempts
language plpgsql security invoker set search_path = public, pg_temp as $$
declare m_id uuid; row public.arcade_attempts;
begin
  select id into m_id from public.modules
   where ui_key = p_ui_key and is_active and kind = 'arcade';
  if m_id is null then raise exception 'unknown arcade module %', p_ui_key using errcode='22023'; end if;

  insert into public.arcade_attempts
    (profile_id, module_id, score, accuracy, max_streak, wave, duration_ms,
     completed, detail)
  values (auth.uid(), m_id, greatest(0, p_score), p_accuracy, p_max_streak,
          p_wave, p_duration_ms, coalesce(p_completed,false),
          coalesce(p_detail,'{}'::jsonb))
  returning * into row;
  return row;
end $$;

revoke all on function public.record_module_progress(text, progress_status, int) from public, anon;
revoke all on function public.record_arcade_attempt(text,int,numeric,int,int,int,boolean,jsonb) from public, anon;
grant execute on function public.record_module_progress(text, progress_status, int) to authenticated;
grant execute on function public.record_arcade_attempt(text,int,numeric,int,int,int,boolean,jsonb) to authenticated;
