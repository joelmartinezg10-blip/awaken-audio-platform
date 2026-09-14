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
