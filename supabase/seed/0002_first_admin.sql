-- ============================================================
-- Bootstrap the first privileged account.
--
-- Run this ONCE, in the Supabase SQL editor, AFTER signing up
-- through the app with the email below. It runs as the service
-- role, which bypasses RLS — this is the only path to an elevated
-- role, and it is deliberately not reachable from the browser.
--
-- Replace the email, then run.
-- ============================================================

-- 1. make yourself a super admin
update public.profiles
   set role = 'super_admin'
 where email = 'joelmartinezg10@gmail.com';

-- 2. Assign learners to an admin.
--    Every learner not already assigned goes to the admin below.
--    Re-run it whenever new volunteers sign up, or assign
--    individually with the second statement.
insert into public.admin_user_assignments (admin_id, member_id, assigned_by)
select a.id, m.id, a.id
from public.profiles a
cross join public.profiles m
where a.email = 'joelmartinezg10@gmail.com'
  and m.id <> a.id
  and m.role = 'user'
on conflict (admin_id, member_id) do nothing;

-- Assign one learner to one admin:
-- insert into public.admin_user_assignments (admin_id, member_id, assigned_by)
-- select a.id, m.id, auth.uid()
-- from public.profiles a, public.profiles m
-- where a.email = 'admin@example.org' and m.email = 'volunteer@example.org'
-- on conflict do nothing;

-- Promote someone to admin (not super admin):
-- update public.profiles set role = 'admin' where email = 'lead@example.org';
