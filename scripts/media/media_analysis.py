"""Local media analysis (no GPU): text in images (RapidOCR, PaddleOCR ONNX models), visual tags (CLIP ONNX, zero-shot plus a
trained tag model) and an image fingerprint (64-bit dHash). Used by the media service (worker) and for sample tests:

    python media_analysis.py <urls.txt>     # one image URL per line; one JSON result per line + a timing summary

Models are read from MEDIA_CLIP_DIR: CLIP (Xenova/clip-vit-base-patch32) vision_model.onnx and text_model.onnx (fp32; fallback
*_quantized.onnx), tokenizer.json, and the English text reader en_PP-OCRv5_rec.onnx + en_PP-OCRv5_dict.txt (monkt/paddleocr-onnx
languages/english, Apache-2.0; fallback en_PP-OCRv3_rec_infer.onnx from SWHL/RapidOCR). Python packages: scripts/media/requirements.txt.
Tesseract was tried first (test 18 Nov 2026) but could not read styled text on thumbnails ("TERBUKTI SADAP PRESIDEN
PRABOWO" came out as "A BY LS TAP 1"); RapidOCR read it whole.
"""
import io
import ipaddress
import json
import os
import re
import socket
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
import onnxruntime as ort
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
from tokenizers import Tokenizer

CLIP_DIR = os.environ.get("MEDIA_CLIP_DIR", os.path.join(os.path.dirname(__file__), "clip"))
MAX_BYTES = 8 * 1024 * 1024
# Huge images (decompression bombs) are refused by PIL before they are fully opened; 40 MP is far above normal media photos.
Image.MAX_IMAGE_PIXELS = 40_000_000
# Media servers sometimes send images as application/octet-stream (test: 8 of 11 failures); PIL checks the content instead.
_BINARY_TYPES = ("application/octet-stream", "binary/octet-stream", "application/x-binary", "")
# 12 s was too tight for news CDNs that are slow from the server (19 Nov 2026: ±190 of 10,000 images failed on handshake/read
# timeouts at detik, kompas, RRI); 403/404 are not affected and not worked around.
FETCH_TIMEOUT = 20
# One ONNX session per process and one thread: the worker handles one image at a time and must not take every core.
THREADS = int(os.environ.get("MEDIA_THREADS", "1"))
VARIANT = os.environ.get("MEDIA_CLIP_VARIANT", "fp32")  # fp32 (default when the file exists) | q8

# Visual tags: a code (stored; Indonesian, shown in the panel) and a few English sentences for CLIP (their embeddings are
# averaged, steadier than one sentence). Codes starting with "_" are "ordinary" contrasts (not stored): without them softmax
# pushes neutral images into important tags (sample test: a camera read as "senjata", a person walking as "jenazah").
TAGS = [
    # Test of 40 protest news photos (18 Nov 2026): crowds at night, crowds facing police, speeches with a megaphone and big
    # staged rallies were missed with a single sentence; the sentences below catch them.
    ("demo", ["a photo of a street protest with people holding banners", "demonstrators rallying with placards",
              "a protester shouting into a megaphone at a rally", "a political rally with a stage and a large audience",
              "protest banners and writing spread on the ground"]),
    ("kerumunan", ["a photo of a large crowd of people", "a mass gathering of many people", "hundreds of people sitting together in a hall",
                   "a crowd of people on a street at night under street lights", "riot police lines facing a crowd at night"]),
    ("kericuhan", ["a photo of a violent riot with clashes", "riot police clashing with protesters and tear gas",
                   "a street with smoke, fire and debris after a clash", "people scuffling and pushing in a chaotic crowd"]),
    ("kebakaran", ["a house on fire with big flames", "firefighters spraying water on a burning building", "the charred ruins of a burned building"]),
    ("senjata", ["a photo of a gun or rifle", "a person holding a firearm", "a knife or machete used as a weapon"]),
    ("darah_luka", ["a photo of a bloody wounded person", "a graphic injury with blood"]),
    ("jenazah", ["a photo of a corpse", "a dead body covered on the ground"]),
    # Small CLIP cannot tell police, military and uniformed civil servants apart (sample test), so one tag.
    ("aparat", ["a photo of police officers or soldiers in uniform", "uniformed security forces on duty"]),
    ("bencana", ["a photo of a flood or landslide disaster", "a natural disaster with damaged houses"]),
    ("kecelakaan", ["a photo of a traffic accident with a crashed vehicle", "a wrecked car after a collision"]),
    ("tangkapan_layar", ["a screenshot of a social media post", "a screenshot of a chat conversation on a phone"]),
    ("dokumen", ["a photo of an official document or letter", "a printed paper document with text"]),
    # Test of 254 labelled images (19 Nov 2026): the first two sentences caught only 15/48 posters; three more → 26/48, main
    # tag right 59% → 64%, other tags lost only 2. "A person's face"/"candidate" sentences raised posters further but pulled in
    # photos of officers, meetings and speeches.
    ("poster", ["a poster or flyer with large text", "a news graphic with a headline", "a news thumbnail with a bold headline over a photo",
                "a graphic design with text and a photo collage", "a banner announcement with text"]),
    ("meme", ["an internet meme with caption text", "a funny meme image"]),
    ("infografis", ["an infographic or chart", "a data visualization graphic"]),
    ("pidato", ["a photo of an official giving a speech at a podium", "a person speaking into a microphone"]),
    ("rapat", ["a photo of a formal meeting around a table", "officials sitting in a meeting room"]),
    ("kelompok", ["a group photo of people posing", "people standing together outdoors"]),
    ("orang", ["a portrait photo of a person", "a close-up of a face"]),
    ("_kamera", ["a photo of a camera or electronic device", "a product photo of a gadget"]),
    ("_jalan", ["a person walking on the street", "a street scene with a road"]),
    ("makanan", ["a photo of food", "a dish of food on a plate"]),
    ("pemandangan", ["a photo of a landscape or city view", "a scenic view of nature"]),
    ("olahraga", ["a photo of a sports match", "athletes playing sports"]),
    ("kendaraan", ["a photo of a car or motorcycle", "vehicles parked on the road"]),
    ("logo", ["a logo or brand graphic", "a company logo on a plain background"]),
    ("produk", ["a product photo", "an advertisement for a product"]),
]
# Tags that mark sensitive content (violence, victims). A marker only; the reader decides.
SENSITIVE = {"kericuhan", "senjata", "darah_luka", "jenazah"}
TAG_MIN = 0.15         # lowest probability for a tag to be stored
# Per-tag thresholds, tuned 19 Nov 2026 on 254 labelled production images (fp32 model; tuned on half the sample, tested on the
# other half: main tag right 58% → 63%, right or swapped with a similar tag 68% → 77%). "_tinjau" was dropped: it absorbed news
# cards and portraits of officials, leaving those images untagged. Disaster at 0.9 (not the tuned 0.99: the sample had only 2
# disaster photos, and an earlier flood test scored ≥ 0.74).
TAG_MIN_BY = {"bencana": 0.9, "demo": 0.2, "kebakaran": 0.6, "kecelakaan": 0.35, "kerumunan": 0.6, "logo": 0.6, "meme": 0.35,
              "orang": 0.05, "pidato": 0.3, "poster": 0.1, "produk": 0.5, "rapat": 0.35, "tangkapan_layar": 0.3}
# Trained tag model (scripts/media/train_tags.py): replaces the zero-shot thresholds above for ordinary tags. Fixed test set of
# 286 images (19 Nov 2026): main tag right 53.5% → 66.4%, including similar tags 69.6% → 77.6%. Sensitive tags stay zero-shot
# with SENSITIVE_MIN: too few examples to train on. Without the file, zero-shot is used as before.
TAG_MODEL = os.environ.get("MEDIA_TAG_MODEL", os.path.join(os.path.dirname(__file__), "tag_model.npz"))
MODEL_TAG_MIN = 0.25   # extra tags (besides the main one) are shown from this probability
SENSITIVE_MIN = 0.65   # much stricter: better missed than many false alarms (fp32 test: 2/2 right)
TEMPERATURE = 100.0    # CLIP logit scale
# OCR lines below this confidence are dropped. Test 18 Nov 2026: real text almost always ≥ 0.90; noise from Arabic/Cyrillic
# letters read as Latin 0.53–0.87.
OCR_MIN_CONF = 0.88
OCR_MIN_WORDS = 2      # below this counts as "no text" (a word = at least 3 letters)
OCR_MAX_SIDE = int(os.environ.get("MEDIA_OCR_SIDE", "1000"))  # longest side for OCR (test: 1600 px ±1.5 GB RAM; 1000 px ±740 MB, same result)
OCR_UPSCALE_MAX = 2.0  # small images are enlarged towards OCR_MAX_SIDE, at most 2×
# Media watermarks/branding found on almost every news image (sample test); matching lines are dropped from OCR.
WATERMARK = re.compile(r"^\W*(kompas\.?com|jernih ?melihat ?dunia|konten ?redaksi ?kumparan|kumparan\w*|detik\w*|tribun\w*|"
                       r"cnn ?indonesia|antara\w*|liputan ?6|republika(\.co\.?(id)?)?|tempo\.?co|okezone|sindonews|suara\.?com|dok\.?)\W*$", re.I)
WORD = re.compile(r"[^\W\d_]{3,}")

MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)


class Analyzer:
    def __init__(self):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = THREADS
        opts.inter_op_num_threads = 1
        # fp32 when present: the 8-bit (u8s8) model scores off on x86 CPUs without VNNI (server: AMD EPYC, AVX2) —
        # test 19 Nov 2026: kericuhan 0.79 → 0.40, kelompok → demo. fp32 is identical on ARM and x86, ±70 ms slower.
        sfx = "" if os.path.exists(os.path.join(CLIP_DIR, "vision_model.onnx")) and VARIANT == "fp32" else "_quantized"
        self.vision = ort.InferenceSession(os.path.join(CLIP_DIR, f"vision_model{sfx}.onnx"), opts, providers=["CPUExecutionProvider"])
        text = ort.InferenceSession(os.path.join(CLIP_DIR, f"text_model{sfx}.onnx"), opts, providers=["CPUExecutionProvider"])
        self.variant = "fp32" if not sfx else "q8"
        tok = Tokenizer.from_file(os.path.join(CLIP_DIR, "tokenizer.json"))
        # The label text embeddings are computed once; the text model is then freed.
        embeds = []
        for _, prompts in TAGS:
            vs = [text.run(None, {"input_ids": np.array([tok.encode(p).ids], dtype=np.int64)})[0][0] for p in prompts]
            vs = [v / np.linalg.norm(v) for v in vs]
            embeds.append(np.mean(vs, axis=0))
        e = np.array(embeds, dtype=np.float32)
        self.tag_embeds = e / np.linalg.norm(e, axis=1, keepdims=True)
        del text
        self.tag_model = dict(np.load(TAG_MODEL)) if os.path.exists(TAG_MODEL) else None
        # Text reader: English PP-OCRv5 when present, English PP-OCRv3 as fallback, then RapidOCR's default (Chinese, which drops
        # spaces in Latin text: "SadapPrabowo"). Test 19 Nov 2026, 40 production images: v5 read 14% more lines and 17% more
        # words than v3 with spaces kept ("POLRES INDRAMAYU BANGUN SINERGI"), and styled letters v3 marked unreadable
        # ("Undangan ke Majlis Pertunangan").
        rec5, keys5 = os.path.join(CLIP_DIR, "en_PP-OCRv5_rec.onnx"), os.path.join(CLIP_DIR, "en_PP-OCRv5_dict.txt")
        rec3 = os.path.join(CLIP_DIR, "en_PP-OCRv3_rec_infer.onnx")
        if os.path.exists(rec5) and os.path.exists(keys5):
            rec, self.ocr_variant = {"rec_model_path": rec5, "rec_keys_path": keys5}, "en5"
        elif os.path.exists(rec3):
            rec, self.ocr_variant = {"rec_model_path": rec3}, "en3"
        else:
            rec, self.ocr_variant = {}, "ch4"
        self.ocr_engine = RapidOCR(intra_op_num_threads=THREADS, inter_op_num_threads=1, **rec)
        # Other scripts, only for images that stay unreadable: ocr_<script>_rec.onnx + ocr_<script>_dict.txt in CLIP_DIR.
        self.alt_ocr = {}
        for script in ALT_SCRIPTS:
            model, keys = (os.path.join(CLIP_DIR, f"ocr_{script}_{x}") for x in ("rec.onnx", "dict.txt"))
            if os.path.exists(model) and os.path.exists(keys):
                self.alt_ocr[script] = RapidOCR(intra_op_num_threads=THREADS, inter_op_num_threads=1, rec_model_path=model, rec_keys_path=keys)

    def tags(self, img: Image.Image):
        # Two views: the centre crop (detail) and the whole image on a plain background (screenshots/tall posters whose edges
        # the centre crop cuts off). Their probabilities are averaged.
        x = np.concatenate([preprocess(img), preprocess(letterbox(img))])
        v = self.vision.run(None, {"pixel_values": x})[0]
        v = v / np.linalg.norm(v, axis=1, keepdims=True)
        logits = TEMPERATURE * (v @ self.tag_embeds.T)
        p = np.exp(logits - logits.max(axis=1, keepdims=True))
        p = (p / p.sum(axis=1, keepdims=True)).mean(axis=0)
        order = np.argsort(-p)
        # Sensitive tags are only stored with a high score: real-data test 18 Nov 2026, "jenazah" right 1 of 7 (score 0.94);
        # the six false alarms (roller coaster, film poster, person lying down) were all below 0.36.
        found = [{"tag": TAGS[i][0], "score": round(float(p[i]), 3)} for i in order
                 if p[i] >= (SENSITIVE_MIN if TAGS[i][0] in SENSITIVE else TAG_MIN_BY.get(TAGS[i][0], TAG_MIN)) and not TAGS[i][0].startswith("_")][:4]
        sensitive = [t["tag"] for t in found if t["tag"] in SENSITIVE and t["score"] >= SENSITIVE_MIN]
        if self.tag_model is not None:
            m = v.mean(axis=0)
            found = [{"tag": t, "score": round(float(p[TAG_INDEX[t]]), 3)} for t in sensitive] + model_tags(m / np.linalg.norm(m), self.tag_model)
            found = found[:4]
        return found, sensitive

    def analyze(self, data: bytes):
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except (Image.UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
            raise ValueError(f"bukan gambar yang bisa dibaca: {type(e).__name__}") from None
        img = img.convert("RGB")
        tags, sensitive = self.tags(img)
        text, words, lines, unreadable = ocr(self.ocr_engine, img)
        script = None
        if unreadable and words < OCR_MIN_WORDS * 3 and self.alt_ocr:
            found = other_script(self.alt_ocr, img)
            if found:
                script, text, words, lines = found
                unreadable = False
        return {"width": img.width, "height": img.height, "dhash": dhash(img), "tags": tags, "sensitive": sensitive,
                "ocrText": text if words >= OCR_MIN_WORDS else "", "ocrWords": words, "ocrLines": lines if words >= OCR_MIN_WORDS else [],
                "unreadText": unreadable and words < OCR_MIN_WORDS * 3, "ocrScript": script}


TAG_INDEX = {t: i for i, (t, _) in enumerate(TAGS)}


def model_tags(emb: np.ndarray, model: dict) -> list:
    """Ordinary tags from the trained model for one image embedding (mean of both views, normalised): the main tag (the most
    likely class; "none" = no tag), then other tags with probability ≥ MODEL_TAG_MIN. Sensitive tags never come from here."""
    lg = float(model["scale"]) * emb @ model["W"] + model["b"]
    p = np.exp(lg - lg.max())
    p /= p.sum()
    classes = [str(c) for c in model["classes"]]
    order = [i for i in np.argsort(-p) if classes[i] not in SENSITIVE]
    if not order or classes[order[0]] == "none":
        return []
    return [{"tag": classes[i], "score": round(float(p[i]), 3)} for k, i in enumerate(order)
            if classes[i] != "none" and (k == 0 or p[i] >= MODEL_TAG_MIN)][:4]


def preprocess(img: Image.Image) -> np.ndarray:
    """CLIP: shortest side 224 (bicubic), centre crop 224×224, scale 0–1, normalise, CHW."""
    w, h = img.size
    s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size
    left, top = (w - 224) // 2, (h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    a = (np.asarray(img, dtype=np.float32) / 255.0 - MEAN) / STD
    return a.transpose(2, 0, 1)[None].astype(np.float32)


def letterbox(img: Image.Image) -> Image.Image:
    """The whole image centred on a square grey canvas (CLIP's mean colour), nothing cut off."""
    side = max(img.size)
    canvas = Image.new("RGB", (side, side), (123, 117, 104))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def _wordlike(token: str) -> bool:
    """A word, not OCR noise from non-Latin letters: ≥3 letters, a vowel, no 5 consonants in a row."""
    t = token.lower()
    return len(t) >= 3 and any(c in "aeiouy" for c in t) and not re.search(r"[^\Waeiouy\d_]{5,}", t)


def _readable(line: str) -> bool:
    """A line is dropped when most of its words don't look like words (test: an Arabic image read as
    "ALMAJDLAWFIRM cwigib ana giall"). Numbers and short lines without letters (prices, times) are kept."""
    words = WORD.findall(line)
    if not words:
        return bool(re.search(r"\d", line))
    return sum(_wordlike(w) for w in words) / len(words) >= 0.6


def ocr(engine: RapidOCR, img: Image.Image):
    """Text in the image, line by line from the top. Media watermarks and noise are dropped.
    Returns (text, number of words of ≥3 letters, lines with their position): h = letter height, cy = vertical centre, both
    relative to the image height (0–1). The worker uses them to pick the "key text" (big headline vs small background text)."""
    # Big images are shrunk (RAM); small ones enlarged (at most 2×): small text in a 730 px news photo read below the
    # confidence threshold, at 1000 px it read fine ("PIMPINAN DAN ANGGOTA DPRD ..." 0.85 → 0.98).
    f = min(OCR_MAX_SIDE / max(img.size), OCR_UPSCALE_MAX)
    if abs(f - 1) > 0.05:
        img = img.resize((round(img.width * f), round(img.height * f)), Image.BICUBIC)
    res, _ = engine(np.asarray(img))
    lines, unread = [], 0
    for box, t, conf in res or []:
        t = t.strip()
        if t and float(conf) < OCR_MIN_CONF:
            unread += 1
        if float(conf) < OCR_MIN_CONF or not t or WATERMARK.match(t) or not _readable(t):
            continue
        ys = [p[1] for p in box]
        lines.append({"t": t, "h": round((max(ys) - min(ys)) / img.height, 4), "cy": round((max(ys) + min(ys)) / 2 / img.height, 4)})
    # Text detected but not readable: many text boxes, almost all below the confidence threshold. Usually a non-Latin script
    # (Arabic, Cyrillic, Chinese) that the English model reads as random letters.
    total = len(res or [])
    unreadable = unread >= 3 and unread / max(1, total) >= 0.6
    return "\n".join(l["t"] for l in lines), sum(len(WORD.findall(l["t"])) for l in lines), lines, unreadable


# Non-Latin scripts (PP-OCR, monkt/paddleocr-onnx, Apache-2.0): arabic (Arabic/Urdu/Persian, v3), eslav (Cyrillic, v5), chinese
# (Chinese/Japanese, v5 server). The English model reads these as random letters; synthetic-text test 19 Nov 2026: all three
# read them right. The Arabic model outputs letters reversed (right to left) without spaces; the order is flipped here.
ALT_SCRIPTS = ("arabic", "eslav", "chinese")
ALT_MIN_CONF = 0.75  # the other-script models are less confident than the English one on equally clear text
_LATIN = re.compile(r"[A-Za-z]")
_LETTER = re.compile(r"[^\W\d_]")


def other_script(engines: dict, img: Image.Image):
    """Text in another script in an image the English model could not read: (script, text, words, lines) from the model that
    read the most non-Latin letters, or None. Results that are mostly Latin letters are refused (that is not another script)."""
    if max(img.size) > OCR_MAX_SIDE:
        f = OCR_MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * f), round(img.height * f)), Image.BICUBIC)
    best = None
    for script, engine in engines.items():
        res, _ = engine(np.asarray(img))
        lines = []
        for box, t, conf in res or []:
            t = t.strip()
            if not t or float(conf) < ALT_MIN_CONF:
                continue
            if script == "arabic":
                t = t[::-1]
            ys = [p[1] for p in box]
            lines.append({"t": t, "h": round((max(ys) - min(ys)) / img.height, 4), "cy": round((max(ys) + min(ys)) / 2 / img.height, 4)})
        letters = sum(len(_LETTER.findall(l["t"])) for l in lines)
        latin = sum(len(_LATIN.findall(l["t"])) for l in lines)
        other = letters - latin
        if other >= 6 and other >= latin and (best is None or other > best[0]):
            best = (other, script, lines)
    if not best:
        return None
    _, script, lines = best
    # Arabic words come without spaces: every line counts as at least one word.
    words = sum(max(1, len(WORD.findall(l["t"]))) for l in lines)
    return script, "\n".join(l["t"] for l in lines), words, lines


def dhash(img: Image.Image) -> str:
    """64-bit fingerprint: the same image (even at another size or compression) gives the same or a very close hash."""
    g = np.asarray(img.convert("L").resize((9, 8), Image.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def _public(url: str) -> None:
    """Refuse URLs pointing at internal addresses (SSRF): only http(s) to public IPs, checked on every redirect too."""
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("URL tidak valid")
    for info in socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80), proto=socket.IPPROTO_TCP):
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("alamat internal ditolak")


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _public(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SafeRedirect)


def fetch(url: str) -> bytes:
    _public(url)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; signalbase-media/1.0)"})
    with _OPENER.open(req, timeout=FETCH_TIMEOUT) as r:
        ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if not ctype.startswith("image/") and ctype not in _BINARY_TYPES:
            raise ValueError(f"bukan gambar: {ctype}")
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("gambar terlalu besar")
    return data


# Video frame: "<video url>#t=25%" = the frame at 25% of the length. Only from social media video CDNs (no arbitrary hosts): X and
# Instagram/Facebook. Videos are streamed over HTTP (PyAV/FFmpeg, range requests), never downloaded whole.
VIDEO_HOST = re.compile(r"(^|\.)(video\.twimg\.com|cdninstagram\.com|fbcdn\.net)$")
_FRAME = re.compile(r"t=(\d{1,2})%")


def is_video_frame(url: str) -> bool:
    base, _, frag = url.partition("#")
    return bool(_FRAME.fullmatch(frag)) and bool(VIDEO_HOST.search(urllib.parse.urlsplit(base).hostname or ""))


def open_video(url: str):
    """A PyAV container for a video URL from VIDEO_HOST (its address is checked too, SSRF)."""
    import av  # comes with faster-whisper (requirements.txt); only needed for video

    if urllib.parse.urlsplit(url).scheme != "https" or not VIDEO_HOST.search(urllib.parse.urlsplit(url).hostname or ""):
        raise ValueError("host video tidak diizinkan")
    _public(url)
    return av.open(url, timeout=FETCH_TIMEOUT, options={"user_agent": "Mozilla/5.0 (compatible; signalbase-media/1.0)"})


def video_frame(url: str) -> bytes:
    """One video frame as JPEG, analysed like an image."""
    base, _, frag = url.partition("#")
    pct = int(_FRAME.fullmatch(frag).group(1))
    try:
        container = open_video(base)
    except Exception as e:  # noqa: BLE001
        # Video deleted/expired: FFmpeg reports "Server returned 404/403".
        if re.search(r"40[34]|410", str(e)):
            raise ValueError(f"video tidak tersedia: {str(e)[:100]}") from e
        raise
    with container:
        vs = container.streams.video[0]
        dur = (container.duration or 0) / 1_000_000
        target = dur * pct / 100
        if target > 0 and vs.time_base:
            container.seek(int(target / vs.time_base), stream=vs)  # to the keyframe before the target
        img = None
        for frame in container.decode(vs):
            img = frame.to_image()
            if frame.time is None or frame.time >= target - 0.05:
                break
    if img is None:
        raise ValueError("video tanpa frame")
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=92)
    return out.getvalue()


def fetch_media(url: str) -> bytes:
    """The image at the URL, or a video frame for "<video>#t=N%"."""
    return video_frame(url) if is_video_frame(url) else fetch(url)


if __name__ == "__main__":
    a = Analyzer()
    times = []
    for url in [u.strip() for u in open(sys.argv[1]) if u.strip()]:
        t0 = time.time()
        try:
            data = fetch_media(url)
            t1 = time.time()
            r = a.analyze(data)
            r.update(url=url, fetchMs=round((t1 - t0) * 1000), analyzeMs=round((time.time() - t1) * 1000))
            times.append(r["analyzeMs"])
        except Exception as e:  # noqa: BLE001 — sample test: note it and go on
            r = {"url": url, "error": str(e)[:200]}
        print(json.dumps(r, ensure_ascii=False), flush=True)
    if times:
        print(json.dumps({"summary": {"ok": len(times), "avgMs": round(sum(times) / len(times)), "maxMs": max(times)}}), flush=True)
