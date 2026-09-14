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
