-- Day 2 · Step 0 — read-only. Settles three cards that are written as guesses.

-- 0a. Did the 7 Sep campus/roles migration actually run?
select to_regclass('public.campuses')         as campuses,
       to_regclass('public.campus_directors') as campus_directors;

-- 0b. Every module the deployed site reports progress for, and whether it
--     has a row. The board guesses learn-fb is the gap; learn-fb is seeded
--     in 0001. The keys absent from every seed file are learn-lp/listen-lp.
with deployed(ui_key) as (values
  ('learn-start'),('learn-gain'),('learn-hp'),('learn-lp'),('learn-eq'),
  ('learn-comp'),('learn-space'),('learn-fb'),
  ('listen-gain'),('listen-hp'),('listen-lp'),('listen-eq'),
  ('listen-comp'),('listen-verb'),('listen-iem'))
select d.ui_key, (m.id is not null) as has_row, m.is_active, t.slug as topic
from deployed d
left join public.modules m on m.ui_key = d.ui_key
left join public.topics  t on t.id = m.topic_id
order by has_row, d.ui_key;

-- 0c. Seating picture before touching anything
select count(*) filter (where campus is null)        as no_campus,
       count(*) filter (where role = 'admin')        as trainers,
       count(*) filter (where role = 'super_admin')  as masters,
       count(*)                                      as profiles
from public.profiles;
select count(*) as directors   from public.campus_directors;
select count(*) as assignments from public.admin_user_assignments;
select slug, name, region, is_active from public.campuses order by sort_order;
