-- AWAKEN AUDIO — full setup. Paste into the Supabase SQL editor. Idempotent.

-- ─────────── 0001_schema.sql ───────────

-- ============================================================
-- Awaken Audio — 0001 schema
-- Course > Topic > Module, profiles, enrolment, progress,
-- arcade attempts, groups and admin assignments.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type app_role        as enum ('user','admin','super_admin');
  create type course_status   as enum ('available','coming_soon','archived');
  create type module_kind     as enum ('learn','listen','arcade');
  create type progress_status as enum ('not_started','in_progress','complete');
  create type group_kind      as enum ('campus','team','cohort');
exception when duplicate_object then null; end $$;

-- ---------- helper: updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ============================================================
-- profiles — one row per auth user
-- role lives here but is NOT user-writable (see 0002)
-- ============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  campus       text,
  role         app_role not null default 'user',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_active_at timestamptz,
  constraint profiles_full_name_len check (char_length(full_name) <= 120),
  constraint profiles_campus_len    check (campus is null or char_length(campus) <= 80)
);
create index if not exists profiles_role_idx        on public.profiles(role);
create index if not exists profiles_last_active_idx on public.profiles(last_active_at desc nulls last);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- curriculum: course > topic > module
-- ============================================================
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  subtitle    text,
  description text,
  status      course_status not null default 'coming_soon',
  accent      text,                       -- brand accent for the card
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists courses_status_idx on public.courses(status, sort_order);
drop trigger if exists courses_touch on public.courses;
create trigger courses_touch before update on public.courses
  for each row execute function public.touch_updated_at();

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  slug        text not null,
  title       text not null,
  summary     text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, slug)
);
create index if not exists topics_course_idx on public.topics(course_id, sort_order);
drop trigger if exists topics_touch on public.topics;
create trigger topics_touch before update on public.topics
  for each row execute function public.touch_updated_at();

-- A module is one Learn / Listen / Arcade experience inside a topic.
-- `ui_key` is the identifier the existing front-end already uses
-- (e.g. 'learn-gain', 'listen-hp', 'cab-raid') so the training code
-- can report progress without knowing any UUIDs.
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics(id) on delete cascade,
  kind        module_kind not null,
  ui_key      text not null unique,
  title       text not null,
  is_scored   boolean not null default false,
  -- Completion bar for a scored module, as a percentage. Every arcade
  -- game already computes an accuracy (ear %, hit rate, rank basis), so
  -- the bar is set on that rather than on a raw score whose magnitude
  -- differs wildly between games. Raw high scores are still recorded and
  -- displayed; they just are not what decides "complete".
  pass_accuracy int,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- deliberately NOT unique on (topic_id, kind): EQ has two arcade
  -- cabinets, and a topic may gain a second listening lab later
  unique (topic_id, kind, ui_key),
  constraint modules_pass_only_when_scored
    check (pass_accuracy is null or is_scored),
  constraint modules_pass_range
    check (pass_accuracy is null or pass_accuracy between 1 and 100)
);
create index if not exists modules_topic_idx on public.modules(topic_id, sort_order);
create index if not exists modules_kind_idx  on public.modules(kind);
drop trigger if exists modules_touch on public.modules;
create trigger modules_touch before update on public.modules
  for each row execute function public.touch_updated_at();

-- ============================================================
-- groups — campuses, teams, cohorts. Not used by the UI yet,
-- but present so those features do not require a migration
-- that rewrites the assignment model.
-- ============================================================
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.groups(id) on delete set null,
  kind       group_kind not null,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists groups_parent_idx on public.groups(parent_id);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id)   on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index if not exists group_members_profile_idx on public.group_members(profile_id);

-- ============================================================
-- admin_user_assignments — relational, so a learner can have
-- several admins (campus lead + team lead) and an admin can be
-- reassigned without touching the learner's profile row.
-- ============================================================
create table if not exists public.admin_user_assignments (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  -- optional narrowing: assignment applies to one course only
  course_id   uuid references public.courses(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (admin_id, member_id),
  constraint admin_not_self check (admin_id <> member_id)
);
create index if not exists aua_admin_idx  on public.admin_user_assignments(admin_id);
create index if not exists aua_member_idx on public.admin_user_assignments(member_id);

-- ============================================================
-- enrollments
-- ============================================================
create table if not exists public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id)  on delete cascade,
  status       progress_status not null default 'not_started',
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (profile_id, course_id)
);
create index if not exists enrollments_course_idx  on public.enrollments(course_id);
create index if not exists enrollments_profile_idx on public.enrollments(profile_id);

-- ============================================================
-- module_progress — one row per (learner, module).
-- Best/last score are denormalised here from arcade_attempts by
-- trigger, so the dashboards never have to aggregate at read time.
-- ============================================================
create table if not exists public.module_progress (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  module_id        uuid not null references public.modules(id)  on delete cascade,
  status           progress_status not null default 'not_started',
  percent          int not null default 0,
  best_score       int,
  last_score       int,
  best_accuracy    numeric(5,2),
  last_accuracy    numeric(5,2),
  attempts         int not null default 0,
  last_activity_at timestamptz not null default now(),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (profile_id, module_id),
  constraint mp_percent_range check (percent between 0 and 100),
  constraint mp_accuracy_range check (
    (best_accuracy is null or best_accuracy between 0 and 100) and
    (last_accuracy is null or last_accuracy between 0 and 100)),
  constraint mp_complete_has_timestamp
    check (status <> 'complete' or completed_at is not null)
);
create index if not exists mp_profile_idx  on public.module_progress(profile_id);
create index if not exists mp_module_idx    on public.module_progress(module_id);
create index if not exists mp_activity_idx  on public.module_progress(profile_id, last_activity_at desc);
drop trigger if exists mp_touch on public.module_progress;
create trigger mp_touch before update on public.module_progress
  for each row execute function public.touch_updated_at();

-- ============================================================
-- arcade_attempts — append-only history. Never updated or
-- deleted by learners, so scores cannot be quietly rewritten.
-- ============================================================
create table if not exists public.arcade_attempts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  module_id   uuid not null references public.modules(id)  on delete cascade,
  score       int not null default 0,
  accuracy    numeric(5,2),
  max_streak  int,
  wave        int,
  duration_ms int,
  -- true when the player finished the whole game rather than running
  -- out of lives. A full clear is a completion in its own right: it
  -- means every stage's own pass bar was met on the way through.
  completed   boolean not null default false,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint aa_accuracy_range check (accuracy is null or (accuracy >= 0 and accuracy <= 100)),
  constraint aa_score_sane     check (score >= 0 and score < 10000000),
  constraint aa_duration_sane  check (duration_ms is null or (duration_ms >= 0 and duration_ms < 86400000))
);
create index if not exists aa_profile_module_idx on public.arcade_attempts(profile_id, module_id, created_at desc);
create index if not exists aa_module_score_idx   on public.arcade_attempts(module_id, score desc);


-- ─────────── 0002_security.sql ───────────

-- ============================================================
-- Awaken Audio — 0002 roles, RLS and privilege containment
--
-- Rules enforced here, at the database, not in the browser:
--   * a learner reads and writes only their own rows
--   * an admin reads only learners explicitly assigned to them
--   * nobody can change their own role
--   * nobody can assign themselves a learner
--   * arcade attempts are append-only
-- ============================================================

-- ------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so policies can read
-- profiles/assignments without recursing into their own RLS.
-- search_path is pinned: a definer function with a mutable
-- search_path is an escalation vector.
-- ------------------------------------------------------------
create or replace function public.current_app_role()
returns app_role
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user'::app_role);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_app_role() = 'super_admin';
$$;

-- true when the caller may see this learner's data:
-- themselves, an admin they are assigned to, or a super admin.
create or replace function public.can_view_member(target uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    auth.uid() = target
    or public.current_app_role() = 'super_admin'
    or (
      public.current_app_role() = 'admin'
      and exists (
        select 1 from public.admin_user_assignments a
        where a.admin_id = auth.uid() and a.member_id = target
      )
    );
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_super_admin()   from public, anon;
revoke all on function public.can_view_member(uuid) from public, anon;
grant execute on function public.current_app_role()    to authenticated;
grant execute on function public.is_super_admin()      to authenticated;
grant execute on function public.can_view_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- Profile creation. Runs as the definer on auth.users insert, so
-- the learner never needs INSERT on profiles at all — which means
-- they can never insert a profile carrying an elevated role.
-- Role is hard-coded to 'user' here regardless of signup metadata.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare default_course uuid;
begin
  insert into public.profiles (id, email, full_name, campus, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email,'@',1)),
    nullif(trim(new.raw_user_meta_data->>'campus'), ''),
    'user'                                  -- never taken from client metadata
  )
  on conflict (id) do nothing;

  -- auto-enrol in every available course
  for default_course in select id from public.courses where status = 'available' loop
    insert into public.enrollments (profile_id, course_id)
    values (new.id, default_course)
    on conflict (profile_id, course_id) do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Role escalation guard. A learner has UPDATE on their own
-- profile row (for name/campus), so the role column is defended
-- separately: only a super admin may change it, and never on
-- their own row.
-- ------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A session with no JWT is the service role or the SQL editor. That is
  -- the trusted, out-of-band path — it already bypasses RLS, and it is the
  -- only way the first privileged account can ever be created. Everything
  -- below constrains browser sessions.
  if auth.uid() is null then return new; end if;

  if new.role is distinct from old.role then
    if not public.is_super_admin() then
      raise exception 'insufficient privilege: role is not self-assignable'
        using errcode = '42501';
    end if;
    if auth.uid() = old.id then
      raise exception 'insufficient privilege: cannot change your own role'
        using errcode = '42501';
    end if;
  end if;
  -- identity columns are immutable from the client
  -- identity columns are immutable from the browser
  new.id := old.id;
  new.created_at := old.created_at;
  if not public.is_super_admin() then
    new.email := old.email;      -- email changes go through Supabase Auth
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ------------------------------------------------------------
-- Keep module_progress honest, and roll arcade attempts up into
-- it. Doing this in a trigger means a learner cannot post a
-- best_score that no attempt row supports.
-- ------------------------------------------------------------
create or replace function public.apply_arcade_attempt()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

drop trigger if exists arcade_attempt_applied on public.arcade_attempts;
create trigger arcade_attempt_applied after insert on public.arcade_attempts
  for each row execute function public.apply_arcade_attempt();

-- module_progress written directly by a learner (learn/listen):
-- normalise the derived columns so the client cannot lie about them.
create or replace function public.guard_module_progress()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

drop trigger if exists mp_guard on public.module_progress;
create trigger mp_guard before insert or update on public.module_progress
  for each row execute function public.guard_module_progress();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles              enable row level security;
alter table public.courses               enable row level security;
alter table public.topics                enable row level security;
alter table public.modules               enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.admin_user_assignments enable row level security;
alter table public.enrollments           enable row level security;
alter table public.module_progress       enable row level security;
alter table public.arcade_attempts       enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.can_view_member(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
-- no INSERT policy: profiles are created by the auth trigger only
-- no DELETE policy: removing a learner is a super-admin/service task

-- ---------- curriculum is public reference data ----------
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses
  for select to authenticated using (true);

drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics
  for select to authenticated using (true);

drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules
  for select to authenticated using (true);
-- writes to the curriculum go through migrations / the service role

-- ---------- groups ----------
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select to authenticated using (true);

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
  for select to authenticated using (public.can_view_member(profile_id));

-- ---------- admin assignments ----------
-- An admin may READ their own assignments (that is how the
-- dashboard finds its roster) but may not create them — otherwise
-- an admin could assign themselves the entire church.
drop policy if exists aua_read on public.admin_user_assignments;
create policy aua_read on public.admin_user_assignments
  for select to authenticated
  using (admin_id = auth.uid() or member_id = auth.uid() or public.is_super_admin());

drop policy if exists aua_write on public.admin_user_assignments;
create policy aua_write on public.admin_user_assignments
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------- enrollments ----------
drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments
  for select to authenticated
  using (public.can_view_member(profile_id));

drop policy if exists enrollments_self_insert on public.enrollments;
create policy enrollments_self_insert on public.enrollments
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.courses c
                where c.id = course_id and c.status = 'available')
  );

drop policy if exists enrollments_self_update on public.enrollments;
create policy enrollments_self_update on public.enrollments
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------- module progress ----------
drop policy if exists mp_read on public.module_progress;
create policy mp_read on public.module_progress
  for select to authenticated
  using (public.can_view_member(profile_id));

-- A learner may only write progress for their own account, and only
-- for a module belonging to a course they are actually enrolled in.
drop policy if exists mp_self_insert on public.module_progress;
create policy mp_self_insert on public.module_progress
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.modules m
      join public.topics t on t.id = m.topic_id
      join public.enrollments e
        on e.course_id = t.course_id and e.profile_id = auth.uid()
      where m.id = module_id and m.is_active
    )
  );

drop policy if exists mp_self_update on public.module_progress;
create policy mp_self_update on public.module_progress
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- no DELETE policy: progress is not erasable from the client

-- ---------- arcade attempts (append only) ----------
drop policy if exists aa_read on public.arcade_attempts;
create policy aa_read on public.arcade_attempts
  for select to authenticated
  using (public.can_view_member(profile_id));

drop policy if exists aa_self_insert on public.arcade_attempts;
create policy aa_self_insert on public.arcade_attempts
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.modules m
      join public.topics t on t.id = m.topic_id
      join public.enrollments e
        on e.course_id = t.course_id and e.profile_id = auth.uid()
      where m.id = module_id and m.is_active and m.kind = 'arcade'
    )
  );
-- deliberately no UPDATE or DELETE policy on arcade_attempts

-- ------------------------------------------------------------
-- Table grants. RLS filters rows; grants decide which verbs even
-- reach RLS. anon gets nothing beyond the curriculum.
-- ------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.courses, public.topics, public.modules to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.groups, public.group_members to authenticated;
-- Deliberately NOT "grant all". GRANT ALL includes TRUNCATE and TRIGGER,
-- which are table-level rights that row level security never filters:
-- any authenticated user could have emptied this table, or attached
-- their own trigger to it, with every RLS policy still in place.
grant select, insert, update, delete on public.admin_user_assignments to authenticated;
grant select, insert, update on public.enrollments     to authenticated;
grant select, insert, update on public.module_progress to authenticated;
grant select, insert on public.arcade_attempts to authenticated;


-- ─────────── 0003_views.sql ───────────

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


-- ─────────── 0001_awaken_audio.sql ───────────

-- ============================================================
-- Awaken Audio — curriculum seed
-- Idempotent: safe to re-run after adding a module.
-- ui_key values MUST match the identifiers the front-end already
-- uses for its substages and arcade cabinets.
-- ============================================================

-- ---------- courses ----------
insert into public.courses (slug, title, subtitle, description, status, accent, sort_order) values
  ('awaken-audio','AWAKEN AUDIO','FOH · MONS',
   'The core audio training path — gain structure, EQ, compression, time and space, feedback and frequency cleanup.',
   'available','#FF5A36',1),
  ('lighting','LIGHTING','Coming soon',
   'Fixtures, intensity, colour and cue structure for the room.','coming_soon','#7657FF',2),
  ('video','VIDEO','Coming soon',
   'Cameras, switching, framing and the broadcast feed.','coming_soon','#FF3D8D',3),
  ('production-leadership','PRODUCTION LEADERSHIP','Coming soon',
   'Running a team, running a service, and developing the volunteers behind you.','coming_soon','#3ECF8E',4)
on conflict (slug) do update set
  title=excluded.title, subtitle=excluded.subtitle, description=excluded.description,
  status=excluded.status, accent=excluded.accent, sort_order=excluded.sort_order;

-- ---------- topics ----------
with c as (select id from public.courses where slug='awaken-audio')
insert into public.topics (course_id, slug, title, summary, sort_order)
select c.id, t.slug, t.title, t.summary, t.sort_order from c, (values
  ('gain-structure','GAIN STRUCTURE',
   'Understand the preamp. Operate the trim. Mix with the fader.',1),
  ('eq','EQUALIZATION',
   'Nine bands, known by name — and what each one does to a real source.',2),
  ('compression','COMPRESSION',
   'Turn it down, or turn it off. Threshold, ratio, attack, release and make-up.',3),
  ('time-space','TIME & SPACE',
   'Make a room without building one. Reverb type, decay, pre-delay and wet level.',4),
  ('high-pass','HIGH-PASS FILTERS',
   'Most of the low end on your console is not music. Clean it up and make room.',5),
  ('feedback','FEEDBACK',
   'When the system starts listening to itself — and how to stop it without killing the mix.',6)
) as t(slug,title,summary,sort_order)
on conflict (course_id, slug) do update set
  title=excluded.title, summary=excluded.summary, sort_order=excluded.sort_order;

-- ---------- modules ----------
-- (topic slug, kind, ui_key, title, is_scored, pass_accuracy, sort)
--
-- pass_accuracy is the completion bar, as a percentage of the accuracy
-- each game already computes. 65 sits around a solid "B" run — high
-- enough to mean something, low enough that a volunteer who is actually
-- hearing it gets credit. THIS IS THE NUMBER TO TUNE once there are
-- real runs to look at; nothing else about the model needs to change.
with c as (select id from public.courses where slug='awaken-audio')
insert into public.modules (topic_id, kind, ui_key, title, is_scored, pass_accuracy, sort_order)
select t.id, m.kind::module_kind, m.ui_key, m.title, m.is_scored, m.pass_accuracy, m.sort_order
from (values
  ('gain-structure','learn',  'learn-gain',    'Learning',            false, null, 1),
  ('gain-structure','listen', 'listen-gain',   'Signal Machine GS-01',false, null, 2),
  ('gain-structure','arcade', 'arcade-gain',   'Gain Stage',          true,    65, 3),

  ('eq','learn',  'learn-eq',      'Learning',        false, null, 1),
  ('eq','listen', 'listen-eq',     'EQ A/B',          false, null, 2),
  ('eq','arcade', 'arcade-sprint', 'Frequency Frenzy',true,    65, 3),
  ('eq','arcade', 'arcade-match',  'EQ Match',        true,    65, 4),

  ('compression','learn',  'learn-comp',   'Learning',      false, null, 1),
  ('compression','listen', 'listen-comp',  'Compressor Lab',false, null, 2),
  ('compression','arcade', 'arcade-knee',  'Knee Deep',     true,    65, 3),

  ('time-space','learn',  'learn-space',  'Learning',        false, null, 1),
  ('time-space','listen', 'listen-verb',  'Reverb Lab',      false, null, 2),
  ('time-space','arcade', 'arcade-raid',  'Reverb Raider',   true,    65, 3),

  ('high-pass','learn',  'learn-hp',  'Learning', false, null, 1),
  ('high-pass','listen', 'listen-hp', 'HPF Lab',  false, null, 2),

  ('feedback','learn', 'learn-fb', 'Learning', false, null, 1)
) as m(topic_slug,kind,ui_key,title,is_scored,pass_accuracy,sort_order)
join c on true
join public.topics t on t.course_id = c.id and t.slug = m.topic_slug
on conflict (ui_key) do update set
  topic_id=excluded.topic_id, kind=excluded.kind, title=excluded.title,
  is_scored=excluded.is_scored, pass_accuracy=excluded.pass_accuracy,
  sort_order=excluded.sort_order, is_active=true;

-- Anyone who signed up before a course went live still gets enrolled.
insert into public.enrollments (profile_id, course_id)
select p.id, c.id
from public.profiles p
cross join public.courses c
where c.status = 'available'
on conflict (profile_id, course_id) do nothing;


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

