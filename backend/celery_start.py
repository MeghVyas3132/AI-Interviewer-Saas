import os
import signal
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):  # noqa: A002
        # Keep health endpoint quiet in logs
        return


def start_health_server(port: int) -> HTTPServer:
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[celery_start] Health server listening on :{port}", flush=True)
    return server


def main() -> int:
    port = int(os.environ.get("PORT", "8000"))
    server = start_health_server(port)

    concurrency = int(os.environ.get("CELERY_CONCURRENCY") or os.environ.get("CELERYD_CONCURRENCY") or "2")
    cmd = [
        "celery",
        "-A",
        "app.core.celery_config:celery_app",
        "worker",
        "-l",
        "info",
        "--concurrency",
        str(concurrency),
    ]
    print(f"[celery_start] Starting worker: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(cmd)

    def handle_signal(signum, _frame):
        print(f"[celery_start] Received signal {signum}, shutting down.", flush=True)
        server.shutdown()
        if proc.poll() is None:
            proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    return proc.wait()


if __name__ == "__main__":
    raise SystemExit(main())
