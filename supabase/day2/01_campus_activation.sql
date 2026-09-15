-- Day 2 · Card 4 — restrict the signup campus dropdown to the pilot campuses.
--
-- No code change and no deploy: the deployed awaken-data.js already reads
--   sb.from("campuses").select(...).eq("is_active", true)
-- so this is the whole card. Confirm the two slugs with 00_audit.sql first.
--
-- The nine hidden campuses keep their rows, so existing profiles keep their
-- foreign key and re-activating one later is a single update.

update public.campuses set is_active = false where slug not in ('balboa','bay-ho');
update public.campuses set is_active = true  where slug     in ('balboa','bay-ho');

select slug, name, is_active from public.campuses order by is_active desc, sort_order;
