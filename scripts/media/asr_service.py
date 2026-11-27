"""Local HTTP service for transcribing the speech in videos (called by the Signalbase worker, `npm run media`;
PM2 `signalbase-media-asr`):

    POST /transcribe {"url": "https://video.twimg.com/..."}  →  {"text", "language", "probability", "seconds", "ms"}
    GET  /health

127.0.0.1 only, and only videos from social media CDNs (media_analysis.VIDEO_HOST). Audio is streamed over HTTP (PyAV),
at most the first MEDIA_ASR_MAX_SECONDS seconds, in memory; nothing is written to disk. One video at a time.
Model: faster-whisper MEDIA_ASR_MODEL (default "small", int8 CPU; test 19 Nov 2026 on a laptop: 72 s of Indonesian audio
in ±12 s), downloaded once into MEDIA_ASR_DIR. Port: MEDIA_ASR_PORT (default 3727).
"""
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import media_analysis as A  # noqa: E402

PORT = int(os.environ.get("MEDIA_ASR_PORT", "3727"))
MODEL = os.environ.get("MEDIA_ASR_MODEL", "small")
MAX_SECONDS = int(os.environ.get("MEDIA_ASR_MAX_SECONDS", "180"))
THREADS = int(os.environ.get("MEDIA_ASR_THREADS", "4"))
RATE = 16_000
# Segments that are most likely not speech (music, silence) are dropped: Whisper tends to "invent" text there.
NO_SPEECH_MAX = 0.6
LOGPROB_MIN = -1.0

_model = None
_lock = threading.Lock()


def model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=THREADS,
                              download_root=os.environ.get("MEDIA_ASR_DIR") or None)
    return _model


def audio(url: str):
    """Mono 16 kHz audio (float32) of the first seconds of the video, and the video length; None without an audio track."""
    import av

    try:
        container = A.open_video(url)
    except Exception as e:  # noqa: BLE001
        if re.search(r"40[34]|410", str(e)):
            raise ValueError(f"video tidak tersedia: {str(e)[:100]}") from e
        raise
    with container:
        if not container.streams.audio:
            return None, (container.duration or 0) / 1_000_000
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format="s16", layout="mono", rate=RATE)
        chunks, n = [], 0
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                a = out.to_ndarray().reshape(-1)
                chunks.append(a)
                n += a.size
            if n >= MAX_SECONDS * RATE:
                break
        dur = (container.duration or 0) / 1_000_000
    if not chunks:
        return None, dur
    return np.concatenate(chunks)[: MAX_SECONDS * RATE].astype(np.float32) / 32768.0, dur


def transcribe(url: str):
    pcm, dur = audio(url)
    if pcm is None:
        return {"text": "", "language": None, "probability": 0, "seconds": round(dur, 1), "audio": False}
    with _lock:
        segments, info = model().transcribe(pcm, vad_filter=True, beam_size=1, condition_on_previous_text=False)
        parts = [s.text.strip() for s in segments if s.no_speech_prob < NO_SPEECH_MAX and s.avg_logprob > LOGPROB_MIN]
    text = re.sub(r"\s+", " ", " ".join(p for p in parts if p)).strip()
    return {"text": text[:5000], "language": info.language if text else None, "probability": round(info.language_probability, 2),
            "seconds": round(dur, 1), "audio": True}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": f"whisper-{MODEL}"}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 10_000)))
            url = req.get("url")
            if not isinstance(url, str) or len(url) > 2000:
                return self._send(400, {"error": "url wajib"})
            start = time.time()
            res = transcribe(url)
            res["model"] = f"whisper-{MODEL}"
            res["ms"] = round((time.time() - start) * 1000)
            self._send(200, res)
        except ValueError as e:
            self._send(422, {"error": str(e)[:200], "gone": True})
        except Exception as e:  # noqa: BLE001 - reported to the worker
            self._send(502, {"error": str(e)[:200]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    model()  # load (and download once) before accepting requests
    print(f"transcription service whisper-{MODEL} on 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
