# Deploying awakenaudio.app

## The one rule

**Deploy from `app/public`. Never from anywhere else.**

On 7 Sep 2026 a deploy of a partial folder took the whole site down.
That folder is now quarantined one level up, in `_DO-NOT-DEPLOY/`.

## Vercel settings

Project **`awakenaudio`**, team **`visualize-led`**
(`team_GDEIQNMGtmgggwwRK9Wh9zUT`). Domain: `www.awakenaudio.app`.

Connect this repo at **Settings -> Git -> Connect Git Repository**.
Do NOT create a new project - the domain lives on the existing one.

Then **Settings -> Build and Deployment**:

| Setting | Value |
|---|---|
| Framework Preset | Other |
| Build Command | override ON, box empty |
| Output Directory | `app/public` |
| Install Command | override ON, box empty |
| Production Branch | `main` |

The site is static files. Nothing builds on Vercel.

Once git is connected, **stop running `vercel --prod` from the laptop.**
That bypass is the single largest operational risk this repo exists to
remove.

## Verify after every production deploy

All ten must return 200:

```bash
for u in / /js/awaken-data.js /js/awaken-manage.js /js/awaken-profile.js \
         /js/iem.js /favicon.ico \
         /audio/arcade/vocal.m4a /audio/arcade/vocal.ogg \
         /audio/iem/vox-1.m4a /audio/iem/vox-1.webm; do
  printf "%-28s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://www.awakenaudio.app$u)"
done
```

Then the mobile sweep (must print `TOTAL VIEWS WITH OVERFLOW: 0`, run at
393px and 320px), and the iPhone audio check with `**/*.ogg` and
`**/*.webm` blocked so only AAC is reachable.

**Every `.m4a` is load-bearing.** They are the only audio an iPhone can
decode. Shipping Opus-only is a silent failure: the site looks perfect
and makes no sound.

## Known state, 17 Sep 2026

- `app/public` is the source of truth and the live site. There is no
  build step; Vercel deploys it directly from `main`.
- The 3 Sep copies -- `src/`, `build.py` and `_stale-build-2026-09-03/` --
  were retired on 17 Sep. They were behind `app/public` and could only
  ever overwrite it. Recoverable from git history if ever needed.
- `vercel.json` currently in production drops `cleanUrls` and the three
  security headers (`X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`) that the 3 Sep version had. Committed as-is so the
  repo matches production. Restoring them is a follow-up.
