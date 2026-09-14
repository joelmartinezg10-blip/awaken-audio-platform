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
