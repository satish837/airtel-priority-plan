#!/usr/bin/env python3
"""Static server for dist/ with a same-origin proxy for PlayCanvas CDN assets."""

from __future__ import annotations

import mimetypes
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

CDN_BASE = (
    "https://omnomrun.h5games.usercontent.goog/v/"
    "09a49b6f-99b7-4a51-ad16-69cf656925ff/"
)
PROXY_PREFIX = "/cdn/"
LOCAL_PREFIX = "/game-data/"
PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.path.dirname(os.path.abspath(__file__))
GAME_DATA_DIR = os.path.join(ROOT, "game-data")

# CDN serves some binaries as text/html; PlayCanvas needs correct types for arraybuffer loads.
MIME_OVERRIDES = {
    ".wasm": "application/wasm",
    ".basis": "application/octet-stream",
    ".glb": "model/gltf-binary",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
}


def guess_content_type(path, upstream=None):
    ext = os.path.splitext(path)[1].lower()
    if ext in MIME_OVERRIDES:
        return MIME_OVERRIDES[ext]
    if upstream and upstream != "text/html":
        return upstream
    guessed, _ = mimetypes.guess_type(path)
    return guessed or upstream or "application/octet-stream"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.startswith(LOCAL_PREFIX) or self.path == "/game-data":
            self._serve_game_data(head_only=False)
            return
        if self.path.startswith(PROXY_PREFIX) or self.path == "/cdn":
            self._serve_game_data_or_proxy(head_only=False)
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith(LOCAL_PREFIX) or self.path == "/game-data":
            self._serve_game_data(head_only=True)
            return
        if self.path.startswith(PROXY_PREFIX) or self.path == "/cdn":
            self._serve_game_data_or_proxy(head_only=True)
            return
        super().do_HEAD()

    def _rel_from_prefix(self, prefix):
        parsed = urlparse(self.path)
        rel = unquote(parsed.path[len(prefix) :].lstrip("/"))
        if parsed.query:
            rel = rel + "?" + parsed.query
        return rel

    def _local_file_path(self, rel):
        return os.path.join(GAME_DATA_DIR, rel.split("?")[0])

    def _serve_local_bytes(self, rel, head_only, data):
        content_type = guess_content_type(rel.split("?")[0], None)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def _serve_game_data(self, head_only=False):
        rel = self._rel_from_prefix(LOCAL_PREFIX)
        if not rel:
            self.send_error(404, "Missing path")
            return
        local = self._local_file_path(rel)
        if not os.path.isfile(local):
            self.send_error(404, "Not in game-data: " + rel)
            return
        with open(local, "rb") as fh:
            data = fh.read()
        self._serve_local_bytes(rel, head_only, data)

    def _serve_game_data_or_proxy(self, head_only=False):
        rel = self._rel_from_prefix(PROXY_PREFIX)
        if not rel:
            self.send_error(404, "Missing CDN path")
            return
        local = self._local_file_path(rel)
        if os.path.isfile(local):
            with open(local, "rb") as fh:
                data = fh.read()
            self._serve_local_bytes(rel, head_only, data)
            return
        self._proxy_cdn(head_only=head_only, rel=rel)

    def _proxy_cdn(self, head_only=False, rel=None):
        if rel is None:
            rel = self._rel_from_prefix(PROXY_PREFIX)
        if not rel:
            self.send_error(404, "Missing CDN path")
            return
        url = CDN_BASE + rel
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "AirtelLocalDev/1.0"},
            method="HEAD" if head_only else "GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as remote:
                data = b"" if head_only else remote.read()
                self.send_response(remote.status)
                upstream_type = remote.headers.get("Content-Type", "").split(";")[0].strip()
                content_type = guess_content_type(rel.split("?")[0], upstream_type)
                self.send_header("Content-Type", content_type)
                for key in ("Content-Length", "ETag", "Last-Modified"):
                    val = remote.headers.get(key)
                    if val:
                        self.send_header(key, val)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                if not head_only:
                    self.wfile.write(data)
        except urllib.error.HTTPError as err:
            self.send_error(err.code, err.reason)
        except Exception as err:
            self.send_error(502, str(err))

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    os.chdir(ROOT)
    try:
        server = ThreadingHTTPServer(("", PORT), Handler)
    except OSError as err:
        if err.errno == 48:
            sys.stderr.write(
                "Port %s is in use. Stop the other server first, e.g.:\n"
                "  lsof -ti :%s | xargs kill\n"
                "Then run: python3 serve.py\n" % (PORT, PORT)
            )
        raise
    print("Serving %s" % ROOT)
    print("Open http://localhost:%s/index.html" % PORT)
    has_local = os.path.isfile(os.path.join(GAME_DATA_DIR, "manifest.json"))
    print("Game data: http://localhost:%s%s (%s)" % (
        PORT, LOCAL_PREFIX, "local" if has_local else "run download-game-assets.py"))
    print("CDN proxy: http://localhost:%s%s -> %s (uses local files when present)" % (
        PORT, PROXY_PREFIX, CDN_BASE))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
