# Day 2 — 14 Sep 2026

Run in this order. Each step's verification gates the next.

| | Card | File / where |
|---|---|---|
| 0 | audit — settles cards 3, 4 and the seating counts | `00_audit.sql` |
| 1 | 4 · restrict signup campus dropdown | `01_campus_activation.sql` |
| 2 | 5,6,7,8 · seat the org | Manage tab, then `02_verify_seating.sql` |
| 3 | 3 · module rows | `../seed/0006_low_pass.sql` |
| 4 | 1 · Resend as custom SMTP | Resend + Supabase dashboards |
| 5 | 2 · email confirmation + real password reset | Supabase dashboard + live site |
| 6 | 9 · verify role scoping | log in as a trainer and a director |

Two cards are smaller than the board thinks:

* **Card 4 needs no code.** The deployed `awaken-data.js` already filters
  campuses on `is_active`. One `update`, no deploy.
* **Card 3's guess is wrong.** `learn-fb` is seeded in `0001`. The keys absent
  from every seed file are `learn-lp` and `listen-lp`.

Seating order (step 2) is not arbitrary: campus first, because campus is the
boundary every other rule is drawn against, and nobody without one is visible to
a director or a trainer.

Steps 4-6 are click-paths with no file here — see the full runbook in the
project docs (`claude/day2-runbook-2026-09-14.md`). Do not paste the Resend API
key or the database connection string into chat or into this repo.

## The thing this folder exists to flag

`supabase/` in this repo is the 3 Sep copy. Everything from 7 Sep — the schema
currently running production — is in no file on this machine. See
`../RECOVER_LIVE_SCHEMA.md`. That is the highest-value item on Day 2, and it is
not on the board.
