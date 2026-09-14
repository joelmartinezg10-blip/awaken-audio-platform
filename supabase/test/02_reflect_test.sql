\set ON_ERROR_STOP off
\pset pager off
create or replace function pg_temp.ok(label text, cond boolean)
returns void language plpgsql as $$
begin raise notice '%  %', case when cond then 'PASS' else '**FAIL**' end, label; end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','ref-sam@t.test','{"full_name":"Sam"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','ref-kim@t.test','{"full_name":"Kim"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','ref-ada@t.test','{"full_name":"Ada"}');
update public.profiles set role='admin' where email='ref-ada@t.test';
insert into public.admin_user_assignments (admin_id, member_id)
 values ('aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001');

-- ---------- Sam writes a reflection ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

-- too thin: recorded, but must not complete the step
select public.save_reflection('eq','too short','also short','no');
select pg_temp.ok('a three-word reflection does not complete the step',
  (select status from public.module_progress mp
     join public.modules m on m.id=mp.module_id
    where m.ui_key='reflect-eq' and mp.profile_id=auth.uid()) = 'in_progress');

-- real substance: completes
select public.save_reflection('eq',
  'I finally heard the 250 Hz buildup on the acoustic once I stopped looking at the analyser and just swept.',
  'I still reach for a boost before I try a cut, and I am slow finding the frequency under time pressure.',
  'Next rehearsal I will high-pass every non-bass channel before touching anything else.');
select pg_temp.ok('a real reflection completes the step',
  (select status from public.module_progress mp
     join public.modules m on m.id=mp.module_id
    where m.ui_key='reflect-eq' and mp.profile_id=auth.uid()) = 'complete');

select pg_temp.ok('editing a reflection keeps one row, not two',
  (select count(*) from public.reflections where profile_id=auth.uid()) = 1);

-- writing onto somebody else's account must fail
do $$ begin
  insert into public.reflections (profile_id, topic_id, went_well)
  select 'aaaaaaaa-0000-0000-0000-000000000002', id, 'not mine' from public.topics limit 1;
  raise notice '**FAIL**  learner wrote a reflection onto another account';
exception when others then
  raise notice 'PASS  learner cannot write a reflection onto another account';
end $$;

-- deleting your record must fail
do $$ begin
  delete from public.reflections where profile_id=auth.uid();
  if (select count(*) from public.reflections where profile_id=auth.uid())=0
    then raise notice '**FAIL**  learner deleted their reflection';
    else raise notice 'PASS  reflections cannot be deleted from the client'; end if;
exception when others then raise notice 'PASS  reflections cannot be deleted from the client';
end $$;
reset role; reset request.jwt.claim.sub;

-- ---------- Kim must not see Sam's reflection ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.ok('another learner cannot read the reflection',
  (select count(*) from public.reflections) = 0);
reset role; reset request.jwt.claim.sub;

-- ---------- Ada, assigned to Sam, can ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.ok('the assigned admin can read the reflection',
  (select count(*) from public.get_member_reflections('aaaaaaaa-0000-0000-0000-000000000001')) = 1);
select pg_temp.ok('the admin CANNOT read an unassigned learner''s reflections',
  (select count(*) from public.get_member_reflections('aaaaaaaa-0000-0000-0000-000000000002')) = 0);
do $$ begin
  update public.reflections set went_well='edited by admin';
  if found then raise notice '**FAIL**  admin rewrote a learner''s reflection';
  else raise notice 'PASS  admin can read but not rewrite a reflection'; end if;
exception when others then raise notice 'PASS  admin can read but not rewrite a reflection';
end $$;
reset role; reset request.jwt.claim.sub;

-- ---------- rollups still add up ----------
select pg_temp.ok('EQ now reports five modules including Reflect',
  (select modules_total from public.v_topic_progress
    where profile_id='aaaaaaaa-0000-0000-0000-000000000001' and topic_slug='eq') = 5);
select pg_temp.ok('START HERE appears first in the course',
  (select topic_slug from public.v_topic_progress
    where profile_id='aaaaaaaa-0000-0000-0000-000000000001'
    order by topic_order limit 1) = 'start-here');
