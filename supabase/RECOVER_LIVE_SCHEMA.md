# Recovering the live schema into git

`supabase/` in this repo is the 3 Sep copy. The campus + roles work of 7 Sep —
`campuses`, `campus_directors`, `admin_user_assignments.unique(member_id)`,
`can_view_member()`, `can_read_reflection()`, the roster functions and their RLS
policies — is running the production database and exists in **no file on this
machine** (searched the whole `AWAKEN AUDIO LOCAL` tree: only `awaken-data.js`
so much as mentions it).

So the live database is the only surviving copy of its own schema. Dump it.

## Primary path — one command in Terminal

Supabase → Project Settings → Database → Connection string → URI. Copy it, put
your database password in place of `[YOUR-PASSWORD]`, then:

```sh
cd ~/"AWAKEN AUDIO LOCAL/awaken-audio-platform"
npx --yes supabase db dump --db-url 'PASTE_URI_HERE' -f supabase/live_schema_2026-09-14.sql
npx --yes supabase db dump --db-url 'PASTE_URI_HERE' --data-only \
    --schema public -f supabase/live_data_2026-09-14.sql
```

The first is structure — tables, constraints, functions, policies, triggers.
The second is the seed content (courses, topics, modules, campuses) so the
module rows can be rebuilt too. Neither contains passwords; `auth.users` is not
in the `public` schema and is not dumped.

Do not paste the connection string into chat — it carries the database password.

## Fallback — SQL editor only, no password handling

If the CLI will not run, `EXPORT_LIVE_SCHEMA.sql` in this folder has four
queries. Run them one at a time and save each result; together they cover
tables, constraints, functions (full source) and RLS policies.

## Then

Commit the dump. After that the repo can rebuild the database, and
`migrations/0001-0004` + the reconstructed seeds become history rather than the
only record.
