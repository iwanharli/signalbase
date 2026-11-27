"""Local HTTP service for media analysis (called by the Signalbase worker, `npm run media`; PM2 `signalbase-media-ai`):

    POST /analyze {"url": "https://..."}  (an image, or a video frame "<url>#t=25%")  →  {"model", "width", "height", "dhash", "tags", "sensitive", "ocrText", "ocrWords"}
    GET  /health

127.0.0.1 only. At most MEDIA_PARALLEL images (default 2) are analysed at once, each with its own engine
(±700 MB per engine; test 19 Nov 2026: one engine ±1 image/second on the server, load 1 of 8 cores). Images are downloaded
into memory and dropped; nothing is written to disk. Port: MEDIA_PORT (default 3726). Model: MEDIA_CLIP_DIR (see media_analysis.py).
"""
import json
import queue
import os
import sys
import time
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import media_analysis as A  # noqa: E402

PORT = int(os.environ.get("MEDIA_PORT", "3726"))
NAME = "media-clip-b32-v3+rapidocr"  # v3: tag model trained on 1,150 labels (19 Nov 2026); v2: fp32 CLIP, thresholds from 254 labels
PARALLEL = max(1, int(os.environ.get("MEDIA_PARALLEL", "2")))
# One engine per running analysis: RapidOCR is not guaranteed to be safe across threads.
ANALYZERS: "queue.Queue[A.Analyzer]" = queue.Queue()
for _ in range(PARALLEL):
    ANALYZERS.put(A.Analyzer())
VARIANT = ANALYZERS.queue[0].variant
OCR = ANALYZERS.queue[0].ocr_variant  # en5 (PP-OCRv5), en3, ch4


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": f"{NAME}-{OCR}", "parallel": PARALLEL}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/analyze":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 10_000)))
            url = req.get("url")
            if not isinstance(url, str) or len(url) > 2000:
                return self._send(400, {"error": "url wajib"})
            start = time.time()
            data = A.fetch_media(url)
            analyzer = ANALYZERS.get()
            try:
                res = analyzer.analyze(data)
            finally:
                ANALYZERS.put(analyzer)
            res["model"] = f"{NAME}-{OCR}-u-{VARIANT}"
            res["ms"] = round((time.time() - start) * 1000)
            self._send(200, res)
        except urllib.error.HTTPError as e:
            # 403/404/410: the media is gone or the URL expired; the worker marks it "gone" and does not retry.
            self._send(422 if e.code in (403, 404, 410) else 502, {"error": f"HTTP {e.code}", "gone": e.code in (403, 404, 410)})
        except ValueError as e:
            self._send(422, {"error": str(e)[:200], "gone": True})
        except Exception as e:  # noqa: BLE001 - reported to the worker, which retries later
            self._send(502, {"error": str(e)[:200]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"media service {NAME}-{OCR} on 127.0.0.1:{PORT}, {PARALLEL} engine(s)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
