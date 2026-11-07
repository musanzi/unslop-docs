"""Private HTTP endpoint. Compose does not publish this port to the host."""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 2_000_000


def create_server(detector, address=("0.0.0.0", 8090)):
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            # Do not log document text, request targets, or request bodies.
            pass

        def respond(self, status, value):
            body = json.dumps(value, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            self.respond(200 if self.path == "/health" else 404, {"ready": self.path == "/health"})

        def do_POST(self):
            if self.path != "/detect":
                self.respond(404, {"error": "Not found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_BODY_BYTES or self.headers.get("Transfer-Encoding"):
                    self.respond(413, {"error": "Invalid request size"})
                    return
                self.connection.settimeout(30)
                payload = json.loads(self.rfile.read(length))
                text = payload.get("text") if isinstance(payload, dict) else None
                if not isinstance(text, str) or not text.strip():
                    raise ValueError("Invalid text")
                text.encode("utf-8")
            except (ValueError, UnicodeError, TimeoutError, OSError):
                self.respond(400, {"error": "Invalid request"})
                return
            if not lock.acquire(blocking=False):
                self.respond(429, {"error": "Detector busy"})
                return
            try:
                value = detector.detect(text)
            except Exception:
                # Inference errors must not expose text or private runtime details.
                self.respond(503, {"error": "Detection unavailable"})
            else:
                self.respond(200, value)
            finally:
                lock.release()

    return ThreadingHTTPServer(address, Handler)


if __name__ == "__main__":
    from engine import Detector

    detector = Detector()
    print("Local detector ready.", flush=True)
    create_server(detector, (os.environ.get("DETECTOR_BIND", "0.0.0.0"), 8090)).serve_forever()
