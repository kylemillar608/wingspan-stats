"""Local preview server that tells the browser never to cache files.

Plain `python3 -m http.server` lets browsers keep using old copies of the
JavaScript modules after you edit them. This serves the same files with
`Cache-Control: no-store`, so a normal refresh always shows the latest code.

    python3 scripts/serve.py          # http://localhost:8000
    python3 scripts/serve.py 8080     # another port
"""

import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Serving {root} at http://localhost:{port} (no caching). Ctrl+C to stop.")
        httpd.serve_forever()
