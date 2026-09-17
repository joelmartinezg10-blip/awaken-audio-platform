# Awaken Audio — accounts, progress and admin

The training platform (Learn / Listen / Arcade) is unchanged. This adds
Supabase auth, a real progress database, row-level security, a learner
dashboard and an admin dashboard around it.

## Setup — three steps

### 1. Create the database
Open the Supabase SQL editor for project `kjbuffypftxaspmsvnuq` and run:

    supabase/RUN_THIS_FIRST.sql

That is the four migrations plus the Awaken Audio curriculum seed, combined
into one paste. It is idempotent — running it twice is harmless.

### 2. Deploy the site
The whole site is static. From this folder:

    npx vercel --prod public

Or drag the `public/` folder onto vercel.com/new.

Then in Supabase → Authentication → URL Configuration, set **Site URL** to
your deployed URL and add it to **Redirect URLs**, so the confirmation and
password-reset emails come back to the right place.

### 3. Make yourself an admin
Sign up through the site first, then run `supabase/seed/0002_first_admin.sql`
in the SQL editor. It promotes your account to `super_admin` and assigns
every existing learner to you.

There is deliberately no way to become an admin from the browser.

## Layout

    public/index.html          built site — do not edit by hand
    public/js/config.js        Supabase URL + anon key
    public/js/awaken-data.js   the only file that talks to Supabase
    public/js/awaken-app.js    auth screen, dashboards, route guards
    public/js/awaken-progress.js  bridges the training modules to the data layer
    supabase/migrations/       schema, security, views — run in order
    supabase/seed/             curriculum, first admin
    supabase/test/             local Postgres security suite (30 checks)

There is no build step. `app/public` is the source of truth and Vercel
deploys it directly from `main`. Edit the files in `app/public` and push.

## Data model

    courses ─┬─ topics ─┬─ modules            (learn | listen | arcade)
             │          │
    profiles ─┴─ enrollments                  one per learner per course
             ├─ module_progress               one per learner per module
             ├─ arcade_attempts               append-only run history
             └─ admin_user_assignments        which admin sees which learner

Rollups (`v_topic_progress`, `v_course_progress`) are views, so nothing
has to be recomputed or kept in sync.

`groups` / `group_members` exist but are unused. They are there so campus
admins, team leads and cohorts can be added later without rewriting the
assignment model.

## Security

Authorisation is enforced in the database, not the browser. The route
guards in `awaken-app.js` only spare people a blank screen — an admin who
edits their own JavaScript still sees nothing, because the policies return
no rows.

Verified by `supabase/test/01_security_test.sql` (30 checks, all passing):

* a learner reads and writes only their own rows
* an admin sees only learners explicitly assigned to them
* an admin cannot widen their own roster or rewrite learner progress
* nobody can change their own role, super admins included
* signup metadata cannot set an elevated role
* arcade attempts are append-only and best scores are server-derived
* anonymous visitors read nothing but the curriculum

Run the suite locally against any Postgres 15+:

    psql -f supabase/test/00_shim.sql
    psql -f supabase/RUN_THIS_FIRST.sql
    psql -f supabase/test/01_security_test.sql

### What this does not protect against
The arcade games run in the browser, so a determined volunteer could post a
score they did not earn. That is inherent to a static client and is not what
RLS is for. What is protected is everyone else's data: no volunteer can read
or alter another person's progress, and no admin can reach a learner who was
not assigned to them.

## Tuning completion

Arcade modules complete when a run is either a full clear or beats
`modules.pass_accuracy` (seeded at 65). That is the one number worth
revisiting once there are real runs to look at:

    update public.modules set pass_accuracy = 70 where ui_key = 'arcade-raid';
