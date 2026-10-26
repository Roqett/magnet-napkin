#!/usr/bin/env python3
"""A tiny static server that also accepts the smoke test's results.

Serves the repository and takes a POST at /__result, writing the body to
scratch/firefox-result.txt. Used to drive a headless browser test.
"""

import http.server
import os
import socketserver
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULT = os.path.join(ROOT, "tests", "result.txt")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        # Hold the page's load event open while the smoke test runs, so the
        # headless browser does not exit before the results are posted.
        if self.path.startswith("/__hold"):
            time.sleep(float(self.path.split("=")[-1]) if "=" in self.path else 8)
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/__result":
            with open(RESULT, "w") as handle:
                handle.write(body)
            self.send_response(204)
        else:
            self.send_response(404)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    # Threaded: the hold request sleeps, and everything else must still be
    # served while it does.
    with socketserver.ThreadingTCPServer(("127.0.0.1", 8124), Handler) as httpd:
        print("serving", ROOT, "on http://127.0.0.1:8124/")
        httpd.serve_forever()
