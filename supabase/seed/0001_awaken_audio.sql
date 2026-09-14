-- ============================================================
-- Awaken Audio — curriculum seed
-- Idempotent: safe to re-run after adding a module.
-- ui_key values MUST match the identifiers the front-end already
-- uses for its substages and arcade cabinets.
-- ============================================================

-- ---------- courses ----------
insert into public.courses (slug, title, subtitle, description, status, accent, sort_order) values
  ('awaken-audio','AWAKEN AUDIO','FOH · MONS',
   'The core audio training path — gain structure, EQ, compression, time and space, feedback and frequency cleanup.',
   'available','#FF5A36',1),
  ('lighting','LIGHTING','Coming soon',
   'Fixtures, intensity, colour and cue structure for the room.','coming_soon','#7657FF',2),
  ('video','VIDEO','Coming soon',
   'Cameras, switching, framing and the broadcast feed.','coming_soon','#FF3D8D',3),
  ('production-leadership','PRODUCTION LEADERSHIP','Coming soon',
   'Running a team, running a service, and developing the volunteers behind you.','coming_soon','#3ECF8E',4)
on conflict (slug) do update set
  title=excluded.title, subtitle=excluded.subtitle, description=excluded.description,
  status=excluded.status, accent=excluded.accent, sort_order=excluded.sort_order;

-- ---------- topics ----------
with c as (select id from public.courses where slug='awaken-audio')
insert into public.topics (course_id, slug, title, summary, sort_order)
select c.id, t.slug, t.title, t.summary, t.sort_order from c, (values
  ('gain-structure','GAIN STRUCTURE',
   'Understand the preamp. Operate the trim. Mix with the fader.',1),
  ('eq','EQUALIZATION',
   'Nine bands, known by name — and what each one does to a real source.',2),
  ('compression','COMPRESSION',
   'Turn it down, or turn it off. Threshold, ratio, attack, release and make-up.',3),
  ('time-space','TIME & SPACE',
   'Make a room without building one. Reverb type, decay, pre-delay and wet level.',4),
  ('high-pass','HIGH-PASS FILTERS',
   'Most of the low end on your console is not music. Clean it up and make room.',5),
  ('feedback','FEEDBACK',
   'When the system starts listening to itself — and how to stop it without killing the mix.',6)
) as t(slug,title,summary,sort_order)
on conflict (course_id, slug) do update set
  title=excluded.title, summary=excluded.summary, sort_order=excluded.sort_order;

-- ---------- modules ----------
-- (topic slug, kind, ui_key, title, is_scored, pass_accuracy, sort)
--
-- pass_accuracy is the completion bar, as a percentage of the accuracy
-- each game already computes. 65 sits around a solid "B" run — high
-- enough to mean something, low enough that a volunteer who is actually
-- hearing it gets credit. THIS IS THE NUMBER TO TUNE once there are
-- real runs to look at; nothing else about the model needs to change.
with c as (select id from public.courses where slug='awaken-audio')
insert into public.modules (topic_id, kind, ui_key, title, is_scored, pass_accuracy, sort_order)
select t.id, m.kind::module_kind, m.ui_key, m.title, m.is_scored, m.pass_accuracy, m.sort_order
from (values
  ('gain-structure','learn',  'learn-gain',    'Learning',            false, null, 1),
  ('gain-structure','listen', 'listen-gain',   'Signal Machine GS-01',false, null, 2),
  ('gain-structure','arcade', 'arcade-gain',   'Gain Stage',          true,    65, 3),

  ('eq','learn',  'learn-eq',      'Learning',        false, null, 1),
  ('eq','listen', 'listen-eq',     'EQ A/B',          false, null, 2),
  ('eq','arcade', 'arcade-sprint', 'Frequency Frenzy',true,    65, 3),
  ('eq','arcade', 'arcade-match',  'EQ Match',        true,    65, 4),

  ('compression','learn',  'learn-comp',   'Learning',      false, null, 1),
  ('compression','listen', 'listen-comp',  'Compressor Lab',false, null, 2),
  ('compression','arcade', 'arcade-knee',  'Knee Deep',     true,    65, 3),

  ('time-space','learn',  'learn-space',  'Learning',        false, null, 1),
  ('time-space','listen', 'listen-verb',  'Reverb Lab',      false, null, 2),
  ('time-space','arcade', 'arcade-raid',  'Reverb Raider',   true,    65, 3),

  ('high-pass','learn',  'learn-hp',  'Learning', false, null, 1),
  ('high-pass','listen', 'listen-hp', 'HPF Lab',  false, null, 2),

  ('feedback','learn', 'learn-fb', 'Learning', false, null, 1)
) as m(topic_slug,kind,ui_key,title,is_scored,pass_accuracy,sort_order)
join c on true
join public.topics t on t.course_id = c.id and t.slug = m.topic_slug
on conflict (ui_key) do update set
  topic_id=excluded.topic_id, kind=excluded.kind, title=excluded.title,
  is_scored=excluded.is_scored, pass_accuracy=excluded.pass_accuracy,
  sort_order=excluded.sort_order, is_active=true;

-- Anyone who signed up before a course went live still gets enrolled.
insert into public.enrollments (profile_id, course_id)
select p.id, c.id
from public.profiles p
cross join public.courses c
where c.status = 'available'
on conflict (profile_id, course_id) do nothing;
