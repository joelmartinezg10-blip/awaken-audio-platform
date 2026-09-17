# Awaken Audio — agent rules

Joel runs this product with specialists. Read this before you touch the repo. Git is the only place truth lives.

## Who does what

| Role | Owns | Does not |
| --- | --- | --- |
| **Cursor** (you) | Editor work in `src/`. Local implement + commit. | Production SQL, `supabase/` migrations as primary owner, merging without Joel, reporting status from the task board alone |
| **Claude (Cowork)** | Planning, verification, SQL, browser/production checks, morning brief | Competing with Cursor in `src/` in the same hour |
| **Grok — Awaken Audio App Manager** | Schedule, launch status, daily/weekly reports, traffic insight | Writing to `main`, editing `src/` or `supabase/` |
| **Awaken Creative Director** | Visual audits, branding, cosmetics, creative bar | Merging code; vague “make it nicer” without a Cursor-ready brief |

Division is **inside the editor vs outside it**. Cursor owns the editor. Claude owns what the editor cannot see (DB, deployed site, browser proof). Grok owns the view from above. Creative Director owns how it looks and feels.

## The loop

1. **Brief (Claude, morning)** — verified against git + deployed site + DB, not the task board.
2. **Assign (Joel)** — editor work → Cursor; DB/browser/platform → Claude; visual/brand → Creative Director; status → Grok.
3. **Build (Cursor)** — implement against local dev; open the page before claiming it works.
4. **Commit (Cursor, every time)** — push before switching agents. Uncommitted work makes every other agent report a stale picture.
5. **Verify (Claude)** — read the diff, run SQL, open the deployed page, confirm the commit message’s claim.
6. **Report (Grok)** — daily 6:00 AM PT status paper; Monday 6:00 AM PT weekly insights. Creative visual risk can be flagged anytime.
7. Back to 1.

## Non-negotiable rules

1. **Commit before switching agents.**
2. **Git is truth. The task board is a claim.** If they disagree, say so. Say `unverified` when you have not checked commits / live site.
3. **One agent per surface at a time.** Cursor owns `src/`. Claude owns `supabase/` and production DB work. Never both at once; never two agents on the same file in the same hour.
4. **Nothing ships on green CI alone.** Open the page. Green means “not obviously broken,” never “works.”
5. **Grok manages; it does not merge.** Creative Director directs; it does not merge.
6. **Avoid process theatre.** If a step stops earning its place, cut it.

## Hard-won project landmines (do not relearn)

### Supabase editor / SQL

- No `psql` meta-commands in the SQL editor.
- An enum value gets its own run.
- Never put a SQL keyword inside a string literal — especially `into`.
- Only the last statement’s result is shown.

### plpgsql

- Prefix every local `v_`, every parameter `p_`.
- Never name a variable `row`, `table`, `user`, or `order`.

### Schema

- Owner column is `profile_id`, not `user_id`.
- `campuses` is keyed on `slug` (text).
- `went_well` / `needs_work` / `next_rep` are NOT NULL — write empty strings, never nulls.

### Contracts

- `save_reflection` is a frontend contract. New parameters go on the **end** with defaults. Never reorder.

### Deploy / build

- `build.py` carries a STOP header. Do not run it.
- Do not deploy with `vercel --prod` from the laptop.
- **Open the page before claiming it works.**

## Repo / product map (as of Sep 2026)

- Live site: https://awakenaudio.app
- Primary repo: `joelmartinezg10-blip/awaken-audio-platform` (`main`)
- Ignore empty `joelmartinezg10-blip/awakenaudio`
- Stack: Vercel + Supabase
- Vercel project: `awakenaudio` (team scope `visualize-led`)

## How to hand work back

When you finish a Cursor task: commit, push, say what changed in plain language (Joel is not a developer), and note what still needs Claude verify or Creative review. Do not mark launch-ready from CI alone.
