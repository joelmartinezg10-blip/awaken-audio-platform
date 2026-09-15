-- Recovered live schema: RLS policies, public schema
-- Exported from the Awaken Audio production database, 14 Sep 2026.
-- Recovery artifact, not a migration. See RECOVER_LIVE_SCHEMA.md.
--
-- 24 policies across 13 tables.
-- No DELETE-only policies exist anywhere: with RLS on and no policy for it,
-- DELETE is denied from the browser on every table. Arcade history is
-- therefore append-only, as designed.


-- ================================================ admin_user_assignments
-- aua_read  SELECT  to {authenticated}
--   USING      : ((admin_id = auth.uid()) OR (member_id = auth.uid()) OR is_super_admin() OR ((director_campus() IS NOT NULL) AND (member_campus(member_id) = director_campus())))
--   WITH CHECK : null
-- aua_write  ALL  to {authenticated}
--   USING      : can_assign(admin_id, member_id)
--   WITH CHECK : can_assign(admin_id, member_id)

-- ================================================ arcade_attempts
-- aa_read  SELECT  to {authenticated}
--   USING      : can_view_member(profile_id)
--   WITH CHECK : null
-- aa_self_insert  INSERT  to {authenticated}
--   USING      : null
--   WITH CHECK : ((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM ((modules m
     JOIN topics t ON ((t.id = m.topic_id)))
     JOIN enrollments e ON (((e.course_id = t.course_id) AND (e.profile_id = auth.uid()))))
  WHERE ((m.id = arcade_attempts.module_id) AND m.is_active AND (m.kind = 'arcade'::module_kind)))))

-- ================================================ campus_directors
-- campus_directors_read  SELECT  to {authenticated}
--   USING      : true
--   WITH CHECK : null
-- campus_directors_write  ALL  to {authenticated}
--   USING      : is_super_admin()
--   WITH CHECK : is_super_admin()

-- ================================================ campuses
-- campuses_read  SELECT  to {anon,authenticated}
--   USING      : true
--   WITH CHECK : null
-- campuses_write  ALL  to {authenticated}
--   USING      : is_super_admin()
--   WITH CHECK : is_super_admin()

-- ================================================ courses
-- courses_read  SELECT  to {authenticated}
--   USING      : true
--   WITH CHECK : null

-- ================================================ enrollments
-- enrollments_read  SELECT  to {authenticated}
--   USING      : can_view_member(profile_id)
--   WITH CHECK : null
-- enrollments_self_insert  INSERT  to {authenticated}
--   USING      : null
--   WITH CHECK : ((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = enrollments.course_id) AND (c.status = 'available'::course_status)))))
-- enrollments_self_update  UPDATE  to {authenticated}
--   USING      : (profile_id = auth.uid())
--   WITH CHECK : (profile_id = auth.uid())

-- ================================================ group_members
-- group_members_read  SELECT  to {authenticated}
--   USING      : can_view_member(profile_id)
--   WITH CHECK : null

-- ================================================ groups
-- groups_read  SELECT  to {authenticated}
--   USING      : true
--   WITH CHECK : null

-- ================================================ module_progress
-- mp_read  SELECT  to {authenticated}
--   USING      : can_view_member(profile_id)
--   WITH CHECK : null
-- mp_self_insert  INSERT  to {authenticated}
--   USING      : null
--   WITH CHECK : ((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM ((modules m
     JOIN topics t ON ((t.id = m.topic_id)))
     JOIN enrollments e ON (((e.course_id = t.course_id) AND (e.profile_id = auth.uid()))))
  WHERE ((m.id = module_progress.module_id) AND m.is_active))))
-- mp_self_update  UPDATE  to {authenticated}
--   USING      : (profile_id = auth.uid())
--   WITH CHECK : (profile_id = auth.uid())

-- ================================================ modules
-- modules_read  SELECT  to {authenticated}
--   USING      : true
--   WITH CHECK : null

-- ================================================ profiles
-- profiles_select  SELECT  to {authenticated}
--   USING      : can_view_member(id)
--   WITH CHECK : null
-- profiles_update_own  UPDATE  to {authenticated}
--   USING      : ((id = auth.uid()) OR is_super_admin() OR ((director_campus() IS NOT NULL) AND (campus = director_campus())))
--   WITH CHECK : ((id = auth.uid()) OR is_super_admin() OR ((director_campus() IS NOT NULL) AND (campus = director_campus())))

-- ================================================ reflections
-- reflections_read  SELECT  to {authenticated}
--   USING      : can_read_reflection(profile_id)
--   WITH CHECK : null
-- reflections_self_update  UPDATE  to {authenticated}
--   USING      : (profile_id = auth.uid())
--   WITH CHECK : (profile_id = auth.uid())
-- reflections_self_write  INSERT  to {authenticated}
--   USING      : null
--   WITH CHECK : ((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (topics t
     JOIN enrollments e ON (((e.course_id = t.course_id) AND (e.profile_id = auth.uid()))))
  WHERE (t.id = reflections.topic_id))))

-- ================================================ topics
-- topics_read  SELECT  to {authenticated}
--   USING      : true
--   WITH CHECK : null
