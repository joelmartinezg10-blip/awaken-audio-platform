-- Recovered live schema: functions, public schema
-- Exported from the Awaken Audio production database, 14 Sep 2026.
--
-- This is a RECOVERY artifact, not a migration. The 7 Sep campus and roles
-- work exists in no other file; this is the database's own account of itself.
-- Do not run it blind against production - it is already what production has.
--
-- 27 functions: 13 SECURITY INVOKER, 14 SECURITY DEFINER.
--
-- The invariant from roles-campuses-and-assignment.md: the five roster
-- functions must be SECURITY INVOKER, so RLS does the scoping. Verified
-- at export time - all five are INVOKER:
--   get_roster               INVOKER
--   get_campus_topic_stats   INVOKER
--   get_campus_arcade        INVOKER
--   get_campus_reflections   INVOKER
--   get_campus_directors     INVOKER

-- ---------------------------------------------------------------- apply_arcade_attempt (DEFINER)
CREATE OR REPLACE FUNCTION public.apply_arcade_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  bar  int;
  acc  numeric(5,2) := coalesce(new.accuracy, 0);
  won  boolean;
begin
  select pass_accuracy into bar from public.modules where id = new.module_id;
  won := new.completed or (bar is not null and acc >= bar);

  insert into public.module_progress as p
    (profile_id, module_id, status, percent, best_score, last_score,
     best_accuracy, last_accuracy, attempts, last_activity_at, completed_at)
  values (
    new.profile_id, new.module_id,
    case when won then 'complete'::progress_status else 'in_progress'::progress_status end,
    floor(acc)::int,
    new.score, new.score, acc, acc, 1, now(),
    case when won then now() end
  )
  on conflict (profile_id, module_id) do update set
    best_score       = greatest(coalesce(p.best_score, 0), new.score),
    last_score       = new.score,
    best_accuracy    = greatest(coalesce(p.best_accuracy, 0), acc),
    last_accuracy    = acc,
    attempts         = p.attempts + 1,
    last_activity_at = now(),
    percent = greatest(p.percent, floor(greatest(coalesce(p.best_accuracy,0), acc))::int),
    status  = case
      when p.status = 'complete' then 'complete'::progress_status
      when won or (bar is not null and greatest(coalesce(p.best_accuracy,0), acc) >= bar)
        then 'complete'::progress_status
      else 'in_progress'::progress_status end,
    completed_at = coalesce(
      p.completed_at,
      case when won or (bar is not null
                        and greatest(coalesce(p.best_accuracy,0), acc) >= bar)
           then now() end);

  update public.profiles set last_active_at = now() where id = new.profile_id;
  return new;
end $function$
;

-- ---------------------------------------------------------------- apply_reflection (DEFINER)
CREATE OR REPLACE FUNCTION public.apply_reflection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

-- ---------------------------------------------------------------- can_assign (DEFINER)
CREATE OR REPLACE FUNCTION public.can_assign(p_admin uuid, p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    public.is_super_admin()
    or (
      public.director_campus() is not null
      and public.member_campus(p_admin)  = public.director_campus()
      and public.member_campus(p_member) = public.director_campus()
      and p_admin <> p_member
    );
$function$
;

-- ---------------------------------------------------------------- can_read_reflection (DEFINER)
CREATE OR REPLACE FUNCTION public.can_read_reflection(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    auth.uid() = target
    or public.current_app_role() = 'super_admin'
    or exists (
      select 1 from public.admin_user_assignments a
      where a.admin_id = auth.uid() and a.member_id = target
    )
    or (
      public.director_campus() is not null
      and public.director_campus() = public.member_campus(target)
    );
$function$
;

-- ---------------------------------------------------------------- can_view_member (DEFINER)
CREATE OR REPLACE FUNCTION public.can_view_member(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    auth.uid() = target
    or public.current_app_role() = 'super_admin'
    or (
      public.current_app_role() = 'admin'
      and exists (
        select 1 from public.admin_user_assignments a
        where a.admin_id = auth.uid() and a.member_id = target
      )
    )
    or (
      public.current_app_role() = 'admin'
      and public.viewer_campus() is not null
      and public.viewer_campus() = public.member_campus(target)
    )
    or (
      public.director_campus() is not null
      and public.director_campus() = public.member_campus(target)
    );
$function$
;

-- ---------------------------------------------------------------- current_app_role (DEFINER)
CREATE OR REPLACE FUNCTION public.current_app_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user'::app_role);
$function$
;

-- ---------------------------------------------------------------- director_campus (DEFINER)
CREATE OR REPLACE FUNCTION public.director_campus()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select campus_slug from public.campus_directors where profile_id = auth.uid();
$function$
;

-- ---------------------------------------------------------------- get_assigned_users (INVOKER)
CREATE OR REPLACE FUNCTION public.get_assigned_users(p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(profile_id uuid, full_name text, email text, campus text, percent integer, status progress_status, topics_total integer, topics_complete integer, current_topic text, last_active_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- ---------------------------------------------------------------- get_campus_arcade (INVOKER)
CREATE OR REPLACE FUNCTION public.get_campus_arcade(p_campus text DEFAULT NULL::text, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(ui_key text, title text, players integer, attempts integer, best_score integer, avg_accuracy integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    m.ui_key,
    m.title,
    count(distinct at.profile_id)::int,
    count(*)::int,
    coalesce(max(at.score), 0),
    coalesce(floor(avg(at.accuracy))::int, 0)
  from public.arcade_attempts at
  join public.modules m on m.id = at.module_id
  join public.profiles pr on pr.id = at.profile_id
  where (p_campus is null or pr.campus = p_campus)
  group by m.ui_key, m.title, m.sort_order
  order by m.sort_order;
$function$
;

-- ---------------------------------------------------------------- get_campus_directors (INVOKER)
CREATE OR REPLACE FUNCTION public.get_campus_directors()
 RETURNS TABLE(campus_slug text, campus_name text, slot smallint, profile_id uuid, full_name text, email text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select d.campus_slug, c.name, d.slot, d.profile_id, pr.full_name, pr.email
  from public.campus_directors d
  join public.campuses c on c.slug = d.campus_slug
  left join public.profiles pr on pr.id = d.profile_id
  order by c.sort_order, d.slot;
$function$
;

-- ---------------------------------------------------------------- get_campus_reflections (INVOKER)
CREATE OR REPLACE FUNCTION public.get_campus_reflections(p_campus text DEFAULT NULL::text, p_limit integer DEFAULT 40, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(profile_id uuid, full_name text, campus text, topic_title text, went_well text, needs_work text, next_rep text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select r.profile_id, pr.full_name, pr.campus, t.title,
         r.went_well, r.needs_work, r.next_rep, r.updated_at
  from public.reflections r
  join public.profiles pr on pr.id = r.profile_id
  join public.topics t on t.id = r.topic_id
  where (p_campus is null or pr.campus = p_campus)
  order by r.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$function$
;

-- ---------------------------------------------------------------- get_campus_topic_stats (INVOKER)
CREATE OR REPLACE FUNCTION public.get_campus_topic_stats(p_campus text DEFAULT NULL::text, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(topic_slug text, topic_title text, topic_order integer, engineers integer, complete integer, in_progress integer, not_started integer, avg_percent integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    tp.topic_slug,
    tp.topic_title,
    tp.topic_order,
    count(*)::int,
    count(*) filter (where tp.status = 'complete')::int,
    count(*) filter (where tp.status = 'in_progress')::int,
    count(*) filter (where tp.status = 'not_started')::int,
    coalesce(floor(avg(tp.percent))::int, 0)
  from public.v_topic_progress tp
  join public.profiles pr on pr.id = tp.profile_id
  where tp.course_slug = p_course_slug
    and (p_campus is null or pr.campus = p_campus)
    and pr.role = 'user'                 -- the engineers, not their leaders
  group by tp.topic_slug, tp.topic_title, tp.topic_order
  order by tp.topic_order;
$function$
;

-- ---------------------------------------------------------------- get_member_reflections (INVOKER)
CREATE OR REPLACE FUNCTION public.get_member_reflections(p_member uuid, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(topic_slug text, topic_title text, topic_order integer, went_well text, needs_work text, next_rep text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.slug, t.title, t.sort_order,
         r.went_well, r.needs_work, r.next_rep, r.updated_at
  from public.reflections r
  join public.topics t  on t.id = r.topic_id
  join public.courses c on c.id = t.course_id
  where r.profile_id = p_member and c.slug = p_course_slug
  order by t.sort_order;
$function$
;

-- ---------------------------------------------------------------- get_member_topic_progress (INVOKER)
CREATE OR REPLACE FUNCTION public.get_member_topic_progress(p_member uuid, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(topic_slug text, topic_title text, topic_order integer, learn_status progress_status, listen_status progress_status, arcade_status progress_status, reflect_status progress_status, arcade_best_score integer, arcade_last_score integer, arcade_best_accuracy numeric, arcade_attempts integer, percent integer, status progress_status, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select tp.topic_slug, tp.topic_title, tp.topic_order,
         tp.learn_status, tp.listen_status, tp.arcade_status, tp.reflect_status,
         tp.arcade_best_score, tp.arcade_last_score, tp.arcade_best_accuracy,
         tp.arcade_attempts, tp.percent, tp.status, tp.last_activity_at
  from public.v_topic_progress tp
  where tp.profile_id = p_member and tp.course_slug = p_course_slug
  order by tp.topic_order;
$function$
;

-- ---------------------------------------------------------------- get_next_topic (INVOKER)
CREATE OR REPLACE FUNCTION public.get_next_topic(p_course_slug text)
 RETURNS TABLE(topic_slug text, topic_title text, percent integer, status progress_status)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select tp.topic_slug, tp.topic_title, tp.percent, tp.status
  from public.v_topic_progress tp
  where tp.profile_id = auth.uid()
    and tp.course_slug = p_course_slug
    and tp.status <> 'complete'
  order by (tp.status = 'in_progress') desc, tp.topic_order
  limit 1;
$function$
;

-- ---------------------------------------------------------------- get_roster (INVOKER)
CREATE OR REPLACE FUNCTION public.get_roster(p_campus text DEFAULT NULL::text, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS TABLE(profile_id uuid, full_name text, email text, avatar_url text, experience text, campus text, campus_name text, role app_role, is_director boolean, trainer_id uuid, trainer_name text, percent integer, status progress_status, topics_total integer, topics_complete integer, reflections integer, current_topic text, last_active_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    pr.id, pr.full_name, pr.email, pr.avatar_url, pr.experience,
    pr.campus, c.name, pr.role,
    exists (select 1 from public.campus_directors d where d.profile_id = pr.id),
    a.admin_id, tr.full_name,
    coalesce(cp.percent, 0),
    coalesce(cp.status, 'not_started'::progress_status),
    coalesce(cp.topics_total, 0),
    coalesce(cp.topics_complete, 0),
    case when public.can_read_reflection(pr.id)
         then (select count(*)::int from public.reflections r where r.profile_id = pr.id)
         end,
    (select tp.topic_title
       from public.v_topic_progress tp
      where tp.profile_id = pr.id and tp.course_slug = p_course_slug
        and tp.status <> 'complete'
      order by (tp.status = 'in_progress') desc, tp.topic_order
      limit 1),
    greatest(pr.last_active_at, cp.last_activity_at)
  from public.profiles pr
  left join public.campuses c on c.slug = pr.campus
  left join public.admin_user_assignments a on a.member_id = pr.id
  left join public.profiles tr on tr.id = a.admin_id
  left join public.v_course_progress cp
         on cp.profile_id = pr.id and cp.course_slug = p_course_slug
  where (p_campus is null or pr.campus = p_campus)
  order by pr.full_name, pr.email;
$function$
;

-- ---------------------------------------------------------------- guard_module_progress (DEFINER)
CREATE OR REPLACE FUNCTION public.guard_module_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare scored boolean;
begin
  select is_scored into scored from public.modules where id = new.module_id;

  new.last_activity_at := now();
  new.percent := greatest(0, least(100, coalesce(new.percent, 0)));

  if new.status = 'complete' then
    new.percent := 100;
    new.completed_at := coalesce(
      case when tg_op = 'UPDATE' then old.completed_at end, now());
  else
    new.completed_at := case when tg_op = 'UPDATE' then old.completed_at else null end;
    if new.completed_at is not null then new.status := 'complete'; new.percent := 100; end if;
  end if;

  -- scores are set by the arcade trigger only
  if tg_op = 'UPDATE' then
    new.best_score    := old.best_score;
    new.last_score    := old.last_score;
    new.best_accuracy := old.best_accuracy;
    new.last_accuracy := old.last_accuracy;
    new.attempts      := old.attempts;
    new.profile_id := old.profile_id;
    new.module_id  := old.module_id;
  elsif not scored then
    new.best_score := null; new.last_score := null;
    new.best_accuracy := null; new.last_accuracy := null; new.attempts := 0;
  end if;

  update public.profiles set last_active_at = now() where id = new.profile_id;
  return new;
end $function$
;

-- ---------------------------------------------------------------- guard_profile_update (DEFINER)
CREATE OR REPLACE FUNCTION public.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- No JWT means the service role or the SQL editor: the trusted
  -- out-of-band path that already bypasses RLS, and the only way the
  -- first privileged account can ever exist. Everything below
  -- constrains browser sessions.
  if auth.uid() is null then return new; end if;

  if new.role is distinct from old.role then
    if auth.uid() = old.id then
      raise exception 'insufficient privilege: cannot change your own role'
        using errcode = '42501';
    end if;

    if public.is_super_admin() then
      null;                                    -- the master admin may do anything here
    elsif public.director_campus() is not null
      and old.campus = public.director_campus()
      and old.role in ('user','admin')
      and new.role in ('user','admin') then
      null;                                    -- a director promotes within their campus
    else
      raise exception 'insufficient privilege: role is not self-assignable'
        using errcode = '42501';
    end if;
  end if;

  -- Campus is the boundary every other rule is drawn against. If a
  -- director could edit it they could pull anybody on the platform
  -- into their own scope, so this is master-admin only — including
  -- for the person's own row.
  if new.campus is distinct from old.campus and not public.is_super_admin() then
    raise exception 'insufficient privilege: campus is set by the master admin'
      using errcode = '42501';
  end if;

  new.id := old.id;
  new.created_at := old.created_at;
  if not public.is_super_admin() then
    new.email := old.email;
  end if;
  return new;
end $function$
;

-- ---------------------------------------------------------------- handle_new_user (DEFINER)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  default_course uuid;
  want_campus    text;
begin
  want_campus := nullif(trim(new.raw_user_meta_data->>'campus'), '');
  if want_campus is not null
     and not exists (select 1 from public.campuses c
                      where c.slug = want_campus and c.is_active) then
    want_campus := null;                    -- unknown campus: recorded as unset
  end if;

  insert into public.profiles (id, email, full_name, campus, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email,'@',1)),
    want_campus,
    'user'                                  -- never taken from client metadata
  )
  on conflict (id) do nothing;

  for default_course in select id from public.courses where status = 'available' loop
    insert into public.enrollments (profile_id, course_id)
    values (new.id, default_course)
    on conflict (profile_id, course_id) do nothing;
  end loop;

  return new;
end $function$
;

-- ---------------------------------------------------------------- is_campus_director (DEFINER)
CREATE OR REPLACE FUNCTION public.is_campus_director()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.director_campus() is not null;
$function$
;

-- ---------------------------------------------------------------- is_super_admin (DEFINER)
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.current_app_role() = 'super_admin';
$function$
;

-- ---------------------------------------------------------------- member_campus (DEFINER)
CREATE OR REPLACE FUNCTION public.member_campus(target uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select campus from public.profiles where id = target;
$function$
;

-- ---------------------------------------------------------------- record_arcade_attempt (INVOKER)
CREATE OR REPLACE FUNCTION public.record_arcade_attempt(p_ui_key text, p_score integer, p_accuracy numeric DEFAULT NULL::numeric, p_max_streak integer DEFAULT NULL::integer, p_wave integer DEFAULT NULL::integer, p_duration_ms integer DEFAULT NULL::integer, p_completed boolean DEFAULT false, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS arcade_attempts
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

-- ---------------------------------------------------------------- record_module_progress (INVOKER)
CREATE OR REPLACE FUNCTION public.record_module_progress(p_ui_key text, p_status progress_status DEFAULT 'in_progress'::progress_status, p_percent integer DEFAULT NULL::integer)
 RETURNS module_progress
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

-- ---------------------------------------------------------------- save_reflection (INVOKER)
CREATE OR REPLACE FUNCTION public.save_reflection(p_topic_slug text, p_went_well text, p_needs_work text, p_next_rep text, p_course_slug text DEFAULT 'awaken-audio'::text)
 RETURNS reflections
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

-- ---------------------------------------------------------------- touch_updated_at (INVOKER)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end $function$
;

-- ---------------------------------------------------------------- viewer_campus (DEFINER)
CREATE OR REPLACE FUNCTION public.viewer_campus()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select campus from public.profiles where id = auth.uid();
$function$
;
