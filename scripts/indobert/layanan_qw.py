"""Layanan kategori 8 Quick Win dengan IndoBERT lokal (hasil latih_qw.py), dipakai worker classifier sebelum memanggil
penyedia AI berbayar (src/lib/server/ai/localQw.ts). Hanya mendengar di 127.0.0.1.

  QW_MODEL=/opt/sb-indobert/model-qw QW_PORT=3725 python layanan_qw.py

POST /qw  {"type": "social"|"online", "items": [{"id": "...", "text": "..."}]}
  -> {"model": "indobert-qw-…", "items": [{"id", "category", "confidence"}]}
GET /health -> {"ok": true, "model": ...}

Teks disiapkan sama dengan data latih (prep di latih_qw.py: "[type] teks", praproses IndoBERTweet bila modelnya itu).
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.environ.get("QW_MODEL", "/opt/sb-indobert/model-qw")
PORT = int(os.environ.get("QW_PORT", "3725"))
INFO = json.load(open(os.path.join(MODEL, "info.json")))
os.environ["FINETUNE_BASE"] = INFO["base"]  # latih_qw.prep memakai praproses IndoBERTweet bila base-nya IndoBERTweet

import torch  # noqa: E402
from transformers import AutoModelForSequenceClassification, AutoTokenizer  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
import latih_qw as L  # noqa: E402

torch.set_num_threads(int(os.environ.get("QW_THREADS", "2")))
TOK = AutoTokenizer.from_pretrained(MODEL)
NET = AutoModelForSequenceClassification.from_pretrained(MODEL).eval()
LABELS = INFO["labels"]
NAME = f"indobert-qw-{INFO.get('dilatih', '')[:10]}"
LOCK = threading.Lock()  # satu inferensi sekaligus: CPU dan memori tetap terkendali


@torch.no_grad()
def classify(type_, items):
    texts = [L.prep(type_, it["text"]) for it in items]
    out = []
    for b in range(0, len(texts), 32):
        enc = TOK(texts[b:b + 32], padding=True, truncation=True, max_length=INFO["maxlen"], return_tensors="pt")
        p = NET(**enc).logits.softmax(-1)
        for it, row in zip(items[b:b + 32], p):
            k = int(row.argmax())
            out.append({"id": it["id"], "category": LABELS[k], "confidence": round(float(row[k]), 4)})
    return out


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": NAME}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/qw":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if req.get("type") not in ("social", "online") or not isinstance(req.get("items"), list) or len(req["items"]) > 500:
                return self._send(400, {"error": "type social|online dan items (maks. 500) wajib"})
            start = time.time()
            with LOCK:
                res = classify(req["type"], req["items"])
            print(f"{time.strftime('%H:%M:%S')} {req['type']} {len(res)} item {time.time() - start:.1f} dtk", flush=True)
            self._send(200, {"model": NAME, "items": res})
        except Exception as e:  # noqa: BLE001 - balasan error ke worker, worker lalu memakai penyedia AI biasa
            self._send(500, {"error": str(e)[:300]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"layanan QW {NAME} di 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
