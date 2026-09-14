-- ============================================================
-- Topic order follows the signal chain, so the dashboards list
-- topics in the same order as the Learn and Listen tabs — and
-- in the same order as a dLive channel strip:
--
--   Gain  →  HPF  →  EQ  →  Compressor  →  FX sends
--
-- Feedback comes after the strip because it is not a processor
-- on it; it is what the whole system does when a loop closes.
-- Idempotent.
-- ============================================================
update public.topics t
   set sort_order = v.n
  from (values
    ('start-here',     0),
    ('gain-structure', 1),
    ('high-pass',      2),
    ('eq',             3),
    ('compression',    4),
    ('time-space',     5),
    ('feedback',       6),
    ('monitors',       7)
  ) as v(slug, n)
 where t.slug = v.slug
   and t.course_id = (select id from public.courses where slug='awaken-audio')
   and t.sort_order is distinct from v.n;

select sort_order, slug, title from public.topics
 where course_id = (select id from public.courses where slug='awaken-audio')
 order by sort_order;
