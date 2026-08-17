from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .claude import ClaudeRunner
from .config import Config
from .control_plane import ControlPlane
from .logging import configure
from .service import WakeService
from .store import Store


class Handler(BaseHTTPRequestHandler):
    service = None

    def _send(self, status: int, value: dict):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"status": "ok"}) if self.path == "/healthz" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/v1/wake":
            return self._send(404, {"error": "not found"})
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip() != "application/json":
            return self._send(415, {"error": "content type"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._send(400, {"error": "content length"})
        if length < 1 or length > 4096:
            return self._send(413, {"error": "body size"})
        body = self.rfile.read(length)
        status, value = self.service.accept(body, self.headers.get("X-Wake-Sender"), self.headers.get("X-Wake-Signature"))
        self._send(status, value)

    def log_message(self, format, *args):
        return


def main():
    config = Config.from_env()
    logger = configure()
    store = Store(config.data_dir / "wake-runner.sqlite3")
    Handler.service = WakeService(config, store, ControlPlane(config.control_plane_url, config.control_plane_token, config.request_timeout), ClaudeRunner(config), logger)
    logger.info("server_started")
    ThreadingHTTPServer((config.host, config.port), Handler).serve_forever()

