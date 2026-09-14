#!/usr/bin/env python3
"""
Static checks on app/public. No browser, no network - these run on every push
and are the machines watching for the failures people cannot see.

1. Every .ogg and .webm has a sibling .m4a.
   Shipping Opus-only is a SILENT failure: the site looks perfect and makes
   no sound on every iPhone. This is the check that would have caught 7 Sep.
2. Every .m4a is a real AAC file (starts with an ftyp box), not a 404 page
   or a zero-byte placeholder that was saved with the right extension.
3. index.html stays under 1.5 MB.
   Catches a base64 regression - the stems were inlined once and index.html
   was 6.1 MB. Current size is ~0.91 MB.
4. No file is zero bytes.
"""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
MAX_INDEX = 1_500_000
fail = []

def walk(ext):
    for d, _, fs in os.walk(ROOT):
        for f in fs:
            if f.endswith(ext):
                yield os.path.join(d, f)

# 1 - codec pairing
pairs = 0
for lossy in list(walk(".ogg")) + list(walk(".webm")):
    aac = os.path.splitext(lossy)[0] + ".m4a"
    pairs += 1
    if not os.path.exists(aac):
        fail.append("NO AAC SIBLING: {} has no .m4a - silent on every iPhone"
                    .format(os.path.relpath(lossy, ROOT)))
print("codec pairing: {} lossy files checked".format(pairs))

# 2 - m4a files are really m4a
m4as = list(walk(".m4a"))
for a in m4as:
    with open(a, "rb") as fh:
        head = fh.read(12)
    if b"ftyp" not in head:
        fail.append("NOT AAC: {} has no ftyp box (truncated or an error page?)"
                    .format(os.path.relpath(a, ROOT)))
print("aac headers: {} .m4a files checked".format(len(m4as)))

# 3 - index.html size
idx = os.path.join(ROOT, "index.html")
if not os.path.exists(idx):
    fail.append("MISSING: index.html")
else:
    size = os.path.getsize(idx)
    print("index.html: {:,} bytes (limit {:,})".format(size, MAX_INDEX))
    if size > MAX_INDEX:
        fail.append("TOO BIG: index.html is {:,} bytes, over the {:,} limit. "
                    "Something is being inlined that should be a file."
                    .format(size, MAX_INDEX))

# 4 - no empty files
empties = 0
for d, _, fs in os.walk(ROOT):
    for f in fs:
        p = os.path.join(d, f)
        if os.path.getsize(p) == 0:
            empties += 1
            fail.append("ZERO BYTES: {}".format(os.path.relpath(p, ROOT)))
print("zero-byte files: {}".format(empties))

print()
if fail:
    print("FAILURES: {}".format(len(fail)))
    for f in fail:
        print("  " + f)
    sys.exit(1)
print("ASSET CHECKS: all passed")
