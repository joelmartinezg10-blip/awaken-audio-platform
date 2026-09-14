#!/usr/bin/env python3
"""
The ten-URL check from DEPLOY-CHECKLIST. All ten must return 200.

These are not arbitrary: they are one file from each thing that has broken
before. awaken-manage.js and awaken-profile.js went missing entirely on
7 Sep; the .m4a files are the only audio an iPhone can decode.

    python3 app/tests_live_urls.py https://www.awakenaudio.app
"""
import sys, urllib.request

URLS = ["/", "/js/awaken-data.js", "/js/awaken-manage.js", "/js/awaken-profile.js",
        "/js/iem.js", "/favicon.ico",
        "/audio/arcade/vocal.m4a", "/audio/arcade/vocal.ogg",
        "/audio/iem/vox-1.m4a", "/audio/iem/vox-1.webm"]

base = (sys.argv[1] if len(sys.argv) > 1 else "https://www.awakenaudio.app").rstrip("/")
bad = []
for u in URLS:
    try:
        req = urllib.request.Request(base + u, headers={"User-Agent": "awaken-ci"})
        with urllib.request.urlopen(req, timeout=30) as r:
            code, n = r.status, len(r.read())
    except Exception as e:
        code, n = "ERR", 0
        print("  {:<28} {}  {}".format(u, code, e))
        bad.append(u); continue
    print("  {:<28} {}  {:,} bytes".format(u, code, n))
    if code != 200 or n == 0:
        bad.append(u)

print()
if bad:
    print("FAILED: {} of {} URLs".format(len(bad), len(URLS)))
    for u in bad:
        print("  " + u)
    sys.exit(1)
print("ALL TEN URLS: 200")
