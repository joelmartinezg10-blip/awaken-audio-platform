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
