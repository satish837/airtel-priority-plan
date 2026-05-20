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
API_PREFIX = "/api/"
API_BACKEND = os.environ.get("API_BACKEND", "http://127.0.0.1:3001").rstrip("/")
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

    def _is_api_path(self):
        return self.path.startswith(API_PREFIX) or self.path == "/api"

    def _send_api_cors_preflight(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-admin-key")
        self.end_headers()

    def _proxy_api(self, head_only=False):
        parsed = urlparse(self.path)
        url = API_BACKEND + parsed.path
        if parsed.query:
            url += "?" + parsed.query
        body = None
        if self.command in ("POST", "PUT", "DELETE", "PATCH"):
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length) if length else None
        headers = {"User-Agent": "AirtelLocalDev/1.0"}
        for key in ("Content-Type", "x-admin-key"):
            val = self.headers.get(key)
            if val:
                headers[key] = val
        req = urllib.request.Request(
            url,
            data=body,
            headers=headers,
            method="HEAD" if head_only else self.command,
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as remote:
                data = b"" if head_only else remote.read()
                self.send_response(remote.status)
                upstream_type = remote.headers.get("Content-Type", "")
                if upstream_type:
                    self.send_header("Content-Type", upstream_type)
                for hkey in ("Content-Length", "ETag", "Last-Modified"):
                    hval = remote.headers.get(hkey)
                    if hval:
                        self.send_header(hkey, hval)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "private, no-store, max-age=0")
                self.end_headers()
                if not head_only:
                    self.wfile.write(data)
        except urllib.error.HTTPError as err:
            err_body = err.read()
            self.send_response(err.code)
            ct = err.headers.get("Content-Type", "application/json")
            self.send_header("Content-Type", ct)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if not head_only:
                self.wfile.write(err_body)
        except urllib.error.URLError as err:
            msg = (
                "API not reachable at %s. Start it with: cd server && npm start"
                % API_BACKEND
            )
            payload = ('{"ok":false,"error":%s}' % repr(msg)).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if not head_only:
                self.wfile.write(payload)
        except Exception as err:
            self.send_error(502, str(err))

    def do_OPTIONS(self):
        if self._is_api_path():
            self._send_api_cors_preflight()
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self._is_api_path():
            self._proxy_api(head_only=False)
            return
        if self.path.startswith(LOCAL_PREFIX) or self.path == "/game-data":
            self._serve_game_data(head_only=False)
            return
        if self.path.startswith(PROXY_PREFIX) or self.path == "/cdn":
            self._serve_game_data_or_proxy(head_only=False)
            return
        super().do_GET()

    def do_POST(self):
        if self._is_api_path():
            self._proxy_api(head_only=False)
            return
        self.send_error(501, "POST not supported for static files")

    def do_DELETE(self):
        if self._is_api_path():
            self._proxy_api(head_only=False)
            return
        self.send_error(501, "DELETE not supported for static files")

    def do_HEAD(self):
        if self._is_api_path():
            self._proxy_api(head_only=True)
            return
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
    print("API proxy: http://localhost:%s%s -> %s (run: npm run api)" % (
        PORT, API_PREFIX, API_BACKEND))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
