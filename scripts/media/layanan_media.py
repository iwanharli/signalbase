"""Layanan HTTP lokal untuk analisis media (dipanggil worker Signalbase, `npm run media`):

    POST /analyze {"url": "https://..."}  →  {"model", "width", "height", "dhash", "tags", "sensitive", "ocrText", "ocrWords"}
    GET  /health

Hanya 127.0.0.1. Paling banyak MEDIA_PARALLEL gambar (bawaan 2) dianalisis sekaligus, masing-masing dengan mesinnya sendiri
(±700 MB per mesin; uji 19 Nov 2026: 1 mesin ±1 gambar/detik di server, beban 1 dari 8 core). Gambar diunduh ke memori lalu dibuang;
tidak ada yang disimpan di disk. Port: MEDIA_PORT (bawaan 3726). Model: MEDIA_CLIP_DIR (lihat analisis_media.py).
"""
import json
import queue
import os
import sys
import time
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import analisis_media as A  # noqa: E402

PORT = int(os.environ.get("MEDIA_PORT", "3726"))
NAME = "media-clip-b32-v2+rapidocr-en-u"  # v2: fp32 CLIP, ambang dari 254 label (19 Nov 2026)
PARALLEL = max(1, int(os.environ.get("MEDIA_PARALLEL", "2")))
# Satu mesin per analisis yang berjalan: RapidOCR tidak dijamin aman dipakai bersamaan oleh beberapa thread.
ANALYZERS: "queue.Queue[A.Analyzer]" = queue.Queue()
for _ in range(PARALLEL):
    ANALYZERS.put(A.Analyzer())
VARIANT = ANALYZERS.queue[0].variant


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": NAME, "parallel": PARALLEL}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/analyze":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 10_000)))
            url = req.get("url")
            if not isinstance(url, str) or len(url) > 2000:
                return self._send(400, {"error": "url wajib"})
            start = time.time()
            data = A.fetch(url)
            analyzer = ANALYZERS.get()
            try:
                res = analyzer.analyze(data)
            finally:
                ANALYZERS.put(analyzer)
            res["model"] = f"{NAME}-{VARIANT}"
            res["ms"] = round((time.time() - start) * 1000)
            self._send(200, res)
        except urllib.error.HTTPError as e:
            # 403/404/410: media sudah tidak ada atau URL kedaluwarsa; worker menandainya "gone" dan tidak mencoba lagi.
            self._send(422 if e.code in (403, 404, 410) else 502, {"error": f"HTTP {e.code}", "gone": e.code in (403, 404, 410)})
        except ValueError as e:
            self._send(422, {"error": str(e)[:200], "gone": True})
        except Exception as e:  # noqa: BLE001 - balasan error ke worker, worker mencoba lagi nanti
            self._send(502, {"error": str(e)[:200]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"layanan media {NAME} di 127.0.0.1:{PORT}, {PARALLEL} mesin", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
