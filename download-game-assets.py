#!/usr/bin/env python3
"""
Download Om Nom Run / PlayCanvas CDN assets for offline development.

Usage:
  python3 download-game-assets.py          # full download (~200 MB)
  python3 download-game-assets.py --scripts-only   # config + __game-scripts.js only
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

CDN_BASE = (
    "https://omnomrun.h5games.usercontent.goog/v/"
    "09a49b6f-99b7-4a51-ad16-69cf656925ff/"
)
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "game-data"
MANIFEST_PATH = OUT / "manifest.json"
WORKERS = 12

EXTRA_PATHS = [
    "config.json",
    "1121883.json",
    "__game-scripts.js",
    "files/assets/45190263/1/ammo.wasm.js",
    "files/assets/45189122/1/ammo.wasm.wasm",
    "files/assets/45189611/1/ammo.js",
    "files/assets/45189856/1/basis.wasm.js",
    "files/assets/45190491/1/basis.wasm.wasm",
    "files/assets/45188911/1/basis.js",
]


def collect_urls_from_config(config: dict) -> set[str]:
    urls: set[str] = set()

    def add(u):
        if u and isinstance(u, str) and not u.startswith("http"):
            urls.add(u.replace("\\", "/"))

    for asset in config.get("assets", {}).values():
        f = asset.get("file")
        if isinstance(f, dict):
            variants = f.get("variants") or {}
            has_basis = "basis" in variants and isinstance(variants["basis"], dict)
            # CDN often hosts only .basis (compressed); skip PNG/JPG that 404
            if has_basis:
                add(variants["basis"].get("url"))
            else:
                add(f.get("url"))
            for name, variant in variants.items():
                if name == "basis":
                    continue
                if isinstance(variant, dict):
                    add(variant.get("url"))
        elif isinstance(f, str):
            add(f)

    for path in EXTRA_PATHS:
        add(path)

    return urls


def fetch_config() -> dict:
    url = CDN_BASE + "config.json"
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_one(rel: str) -> tuple[str, bool, str]:
    dest = OUT / rel
    if dest.exists() and dest.stat().st_size > 0:
        return rel, True, "skipped"

    dest.parent.mkdir(parents=True, exist_ok=True)
    url = CDN_BASE + rel

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AirtelAssetDownloader/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) < 64 and data[:15].lower().startswith(b"<!doctype"):
                return rel, False, "html error page"
            dest.write_bytes(data)
            return rel, True, "ok"
        except Exception as err:
            if attempt == 2:
                return rel, False, str(err)
            time.sleep(0.5 * (attempt + 1))

    return rel, False, "unknown"


def main():
    parser = argparse.ArgumentParser(description="Download PlayCanvas game assets locally")
    parser.add_argument(
        "--scripts-only",
        action="store_true",
        help="Only download config.json and __game-scripts.js (fast, for logic edits)",
    )
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "source").mkdir(exist_ok=True)

    print("Fetching config.json …")
    config = fetch_config()
    (OUT / "config.json").write_text(json.dumps(config), encoding="utf-8")

    if args.scripts_only:
        paths = ["__game-scripts.js", "1121883.json"] + [
            p for p in EXTRA_PATHS if "wasm" in p or "basis" in p or "ammo" in p
        ]
        urls = set(paths)
    else:
        urls = collect_urls_from_config(config)

    paths = sorted(urls)
    print("Files to fetch: %d  →  %s" % (len(paths), OUT))

    ok, fail, skip = 0, 0, 0
    failures: list[tuple[str, str]] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(download_one, p): p for p in paths}
        done = 0
        for fut in as_completed(futures):
            rel, success, msg = fut.result()
            done += 1
            if msg == "skipped":
                skip += 1
            elif success:
                ok += 1
            else:
                fail += 1
                failures.append((rel, msg))
            if done % 100 == 0 or done == len(paths):
                print("  [%d/%d] ok=%d skip=%d fail=%d" % (done, len(paths), ok, skip, fail))

    # Editable copy of game logic bundle
    bundle = OUT / "__game-scripts.js"
    source = OUT / "source" / "__game-scripts.js"
    if bundle.exists() and not source.exists():
        source.write_bytes(bundle.read_bytes())
        print("Copied logic bundle → game-data/source/__game-scripts.js")

    manifest = {
        "cdn": CDN_BASE,
        "downloadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total": len(paths),
        "ok": ok,
        "skipped": skip,
        "failed": fail,
        "paths": paths,
        "failures": [{"path": p, "error": e} for p, e in failures[:50]],
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\nDone. ok=%d skipped=%d failed=%d" % (ok, skip, fail))
    if failures:
        print("Failures (%d) — re-run to retry; game falls back to CDN proxy for missing files:" % fail)
        for p, e in failures[:10]:
            print("  ", p, "→", e)
        if fail > len(paths) * 0.05:
            sys.exit(1)

    print("\nEdit game logic:  game-data/source/__game-scripts.js")
    print("After edits, copy back:  cp game-data/source/__game-scripts.js game-data/__game-scripts.js")
    print("Run:  python3 serve.py  →  http://localhost:8080/index.html")


if __name__ == "__main__":
    main()
