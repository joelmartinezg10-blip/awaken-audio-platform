-- ============================================================
-- Security behaviour tests. Every one of these is an attack a
-- volunteer or a compromised admin session could actually try.
-- ============================================================
\set ON_ERROR_STOP off
\pset pager off

create or replace function pg_temp.ok(label text, cond boolean)
returns void language plpgsql as $$
begin raise notice '%  %', case when cond then 'PASS' else '**FAIL**' end, label; end $$;

-- ---------- create four accounts through the auth trigger ----------
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','sam@awaken.test','{"full_name":"Sam Learner"}'),
 ('22222222-2222-2222-2222-222222222222','kim@awaken.test','{"full_name":"Kim Learner"}'),
 ('33333333-3333-3333-3333-333333333333','ada@awaken.test','{"full_name":"Ada Admin"}'),
 ('44444444-4444-4444-4444-444444444444','sue@awaken.test','{"full_name":"Sue Super"}');

select pg_temp.ok('auth trigger creates a profile for every new user',
  (select count(*) from public.profiles) = 4);
select pg_temp.ok('every new profile defaults to role = user',
  (select count(*) from public.profiles where role='user') = 4);
select pg_temp.ok('new users are auto-enrolled in the available course only',
  (select count(*) from public.enrollments) = 4);

-- an attacker sets role in signup metadata
insert into auth.users (id,email,raw_user_meta_data) values
 ('55555555-5555-5555-5555-555555555555','mal@awaken.test',
  '{"full_name":"Mal","role":"super_admin","app_role":"admin"}');
select pg_temp.ok('signup metadata cannot set an elevated role',
  (select role from public.profiles where email='mal@awaken.test') = 'user');

-- ---------- grant the intended roles out of band (service role) ----------
update public.profiles set role='admin'       where email='ada@awaken.test';
update public.profiles set role='super_admin' where email='sue@awaken.test';
insert into public.admin_user_assignments (admin_id, member_id)
 values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111');

-- ============================================================
-- Act as Sam, an ordinary learner
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.ok('learner sees only their own profile',
  (select count(*) from public.profiles) = 1);
select pg_temp.ok('learner sees the curriculum',
  (select count(*) from public.modules) = 25);

-- write progress for themselves: allowed
select pg_temp.ok('learner can record their own learn progress',
  (select status from public.record_module_progress('learn-gain','complete')) = 'complete');

-- write progress AS SOMEBODY ELSE: must fail
do $$ begin
  insert into public.module_progress (profile_id, module_id, status)
  select '22222222-2222-2222-2222-222222222222', id, 'complete' from public.modules where ui_key='learn-eq';
  raise notice '**FAIL**  learner wrote progress onto another account';
exception when insufficient_privilege or others then
  raise notice 'PASS  learner cannot write progress onto another account';
end $$;

-- read somebody else's progress: must return nothing
select pg_temp.ok('learner cannot read another learner''s progress',
  (select count(*) from public.module_progress
    where profile_id='22222222-2222-2222-2222-222222222222') = 0);

-- self-promotion: must fail
do $$ begin
  update public.profiles set role='super_admin' where id=auth.uid();
  raise notice '**FAIL**  learner promoted themselves';
exception when insufficient_privilege then
  raise notice 'PASS  learner cannot promote themselves';
end $$;

-- assigning themselves a learner: must fail
do $$ begin
  insert into public.admin_user_assignments (admin_id, member_id)
  values (auth.uid(), '22222222-2222-2222-2222-222222222222');
  raise notice '**FAIL**  learner assigned themselves a member';
exception when insufficient_privilege or others then
  raise notice 'PASS  learner cannot assign themselves members';
end $$;

-- forging a high score without an attempt row: must be ignored
insert into public.arcade_attempts (profile_id, module_id, score, accuracy)
select auth.uid(), id, 4200, 71.5 from public.modules where ui_key='arcade-gain';
update public.module_progress set best_score = 999999
 where profile_id = auth.uid()
   and module_id = (select id from public.modules where ui_key='arcade-gain');
select pg_temp.ok('best_score cannot be overwritten by the client',
  (select best_score from public.module_progress
    where profile_id=auth.uid()
      and module_id=(select id from public.modules where ui_key='arcade-gain')) = 4200);
select pg_temp.ok('arcade accuracy above the bar completes the module',
  (select status from public.module_progress
    where profile_id=auth.uid()
      and module_id=(select id from public.modules where ui_key='arcade-gain')) = 'complete');

-- deleting an attempt to hide it: must fail
do $$ begin
  delete from public.arcade_attempts where profile_id = auth.uid();
  if (select count(*) from public.arcade_attempts where profile_id=auth.uid()) = 0
    then raise notice '**FAIL**  learner deleted their arcade history';
    else raise notice 'PASS  arcade attempts are append-only';
  end if;
exception when insufficient_privilege or others then
  raise notice 'PASS  arcade attempts are append-only';
end $$;

reset role; reset request.jwt.claim.sub;

-- ============================================================
-- Act as Ada, an admin assigned only Sam
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select pg_temp.ok('admin sees themselves plus assigned learners only',
  (select count(*) from public.profiles) = 2);
select pg_temp.ok('admin roster returns exactly the assigned learners',
  (select count(*) from public.get_assigned_users()) = 1);
select pg_temp.ok('admin can read an assigned learner''s progress',
  (select count(*) from public.get_member_topic_progress('11111111-1111-1111-1111-111111111111')) = 8);
select pg_temp.ok('admin CANNOT read an unassigned learner''s progress',
  (select count(*) from public.get_member_topic_progress('22222222-2222-2222-2222-222222222222')) = 0);
select pg_temp.ok('admin cannot see unassigned learners at all',
  (select count(*) from public.profiles
    where id='22222222-2222-2222-2222-222222222222') = 0);

-- admin grants themselves the rest of the church: must fail
do $$ begin
  insert into public.admin_user_assignments (admin_id, member_id)
  values (auth.uid(), '22222222-2222-2222-2222-222222222222');
  raise notice '**FAIL**  admin assigned themselves an extra learner';
exception when insufficient_privilege or others then
  raise notice 'PASS  admin cannot widen their own roster';
end $$;

-- admin promotes themselves: must fail
do $$ begin
  update public.profiles set role='super_admin' where id=auth.uid();
  raise notice '**FAIL**  admin promoted themselves';
exception when insufficient_privilege then
  raise notice 'PASS  admin cannot promote themselves';
end $$;

-- admin edits a learner's progress: must fail
do $$ begin
  update public.module_progress set status='complete'
   where profile_id='11111111-1111-1111-1111-111111111111';
  if found then raise notice '**FAIL**  admin rewrote a learner''s progress';
  else raise notice 'PASS  admin can read but not rewrite learner progress'; end if;
exception when insufficient_privilege or others then
  raise notice 'PASS  admin can read but not rewrite learner progress';
end $$;

reset role; reset request.jwt.claim.sub;

-- ============================================================
-- Act as Sue, a super admin
-- ============================================================
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

select pg_temp.ok('super admin sees every profile',
  (select count(*) from public.profiles) = 5);
insert into public.admin_user_assignments (admin_id, member_id)
values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222');
select pg_temp.ok('super admin can assign learners to an admin',
  (select count(*) from public.admin_user_assignments) = 2);

-- even a super admin may not change their OWN role
do $$ begin
  update public.profiles set role='user' where id=auth.uid();
  raise notice '**FAIL**  super admin changed their own role';
exception when insufficient_privilege then
  raise notice 'PASS  nobody can change their own role, super admin included';
end $$;

reset role; reset request.jwt.claim.sub;

-- ============================================================
-- Anonymous visitor
-- ============================================================
set role anon;
do $$ begin
  perform count(*) from public.profiles;
  raise notice '**FAIL**  anonymous read of profiles succeeded';
exception when insufficient_privilege then
  raise notice 'PASS  anonymous visitors cannot read profiles';
end $$;
do $$ begin
  perform count(*) from public.module_progress;
  raise notice '**FAIL**  anonymous read of progress succeeded';
exception when insufficient_privilege then
  raise notice 'PASS  anonymous visitors cannot read progress';
end $$;
reset role;

-- ============================================================
-- Rollup correctness
-- ============================================================
select pg_temp.ok('topic rollup reports gain structure 2 of 3 modules complete',
  (select modules_complete from public.v_topic_progress
    where profile_id='11111111-1111-1111-1111-111111111111'
      and topic_slug='gain-structure') = 2);
select pg_temp.ok('course percent is the mean across topics',
  (select percent from public.v_course_progress
    where profile_id='11111111-1111-1111-1111-111111111111') between 1 and 30);
select pg_temp.ok('next topic skips nothing and returns the started one',
  (select topic_slug from public.v_topic_progress
    where profile_id='11111111-1111-1111-1111-111111111111'
      and status='in_progress' limit 1) = 'gain-structure');
