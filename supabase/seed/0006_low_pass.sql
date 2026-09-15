-- 0006 — Low-Pass module rows.
--
-- RECONSTRUCTED 14 Sep 2026. The original 0006_low_pass.sql exists nowhere on
-- this machine; this was rebuilt from the ui_keys the deployed site reports
-- progress for (learn-lp, listen-lp) and the shape of 0001_awaken_audio.sql.
--
-- VERIFIED 15 Sep 2026: day2/00_audit.sql was run against production. All 15
-- deployed ui_keys have rows and are active; learn-lp and listen-lp sit under
-- topic slug 'low-pass', matching this file. The original 0006 DID run before
-- it was lost. Nothing is broken; this file is the record, not a repair.
--
-- Do NOT run it against production - it is already what production has.
--
-- RUN day2/00_audit.sql FIRST if this is ever used to rebuild from scratch.
--   * If learn-lp and listen-lp already have rows, the original ran before it
--     was lost. Do NOT run this — instead correct the topic slug and title
--     below to match what the audit reported, and keep the file as the record.
--   * If they do not, the Low-Pass module is live on the site writing progress
--     into nothing, and this fixes it.
--
-- The ::module_kind cast is deliberate: its absence is what made the original
-- fail the first time it was run.

with c as (select id from public.courses order by created_at limit 1)
insert into public.topics (course_id, slug, title, sort_order)
select c.id, 'low-pass', 'Low-Pass Filtering', 30 from c
on conflict (course_id, slug) do nothing;

insert into public.modules
  (topic_id, kind, ui_key, title, is_scored, pass_accuracy, sort_order)
select t.id, m.kind::module_kind, m.ui_key, m.title,
       m.is_scored, m.pass_accuracy, m.sort_order
from (values
  ('learn',  'learn-lp',  'Learning', false, null::int, 1),
  ('listen', 'listen-lp', 'LPF Lab',  false, null::int, 2)
) as m(kind, ui_key, title, is_scored, pass_accuracy, sort_order)
join public.topics t on t.slug = 'low-pass'
on conflict (ui_key) do update set
  topic_id      = excluded.topic_id,
  kind          = excluded.kind,
  title         = excluded.title,
  is_scored     = excluded.is_scored,
  pass_accuracy = excluded.pass_accuracy,
  sort_order    = excluded.sort_order;

select ui_key, title from public.modules where ui_key in ('learn-lp','listen-lp');
