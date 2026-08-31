#!/usr/bin/env bash
# KudiTrack — STORAGE FILE COPY (source -> target). Read-only on the source.
# Copies every object with identical bucket + object path so all URLs stored in
# the database (business_logos, avatars, receipts, ads, email media) keep working
# after only the project host changes.
#
#   export SRC_URL="https://<current-ref>.supabase.co"   SRC_SERVICE_KEY="..."
#   export DST_URL="https://<new-ref>.supabase.co"       DST_SERVICE_KEY="..."
#
# Buckets (public flag):
#   business-logos (public), avatars (public), platform-ads (public),
#   expense-receipts (private), other-income-receipts (private),
#   email-media (private), database_export_05_08_26 (private, archive)
set -euo pipefail
: "${SRC_URL:?}"; : "${SRC_SERVICE_KEY:?}"; : "${DST_URL:?}"; : "${DST_SERVICE_KEY:?}"

python3 - <<'PY'
import os, json, urllib.request, pathlib
S,SK,D,DK = os.environ["SRC_URL"],os.environ["SRC_SERVICE_KEY"],os.environ["DST_URL"],os.environ["DST_SERVICE_KEY"]
BUCKETS = ["business-logos","avatars","platform-ads","expense-receipts",
           "other-income-receipts","email-media","database_export_05_08_26"]

def req(url, key, data=None, method="GET", ctype="application/json", raw=False):
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {key}")
    if data is not None: r.add_header("Content-Type", ctype)
    with urllib.request.urlopen(r) as resp:
        return resp.read() if raw else json.loads(resp.read() or b"{}")

def listing(bucket, prefix=""):
    body = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0,
                       "sortBy": {"column":"name","order":"asc"}}).encode()
    return req(f"{S}/storage/v1/object/list/{bucket}", SK, body, "POST")

for b in BUCKETS:
    stack=[""]
    while stack:
        prefix = stack.pop()
        for item in listing(b, prefix):
            name = f"{prefix}{item['name']}"
            if item.get("id") is None:            # folder
                stack.append(name + "/"); continue
            blob = req(f"{S}/storage/v1/object/{b}/{name}", SK, raw=True)
            req(f"{D}/storage/v1/object/{b}/{name}", DK, blob, "POST",
                item.get("metadata",{}).get("mimetype","application/octet-stream"))
            print("copied", b, name, len(blob))
print("storage copy complete")
PY
