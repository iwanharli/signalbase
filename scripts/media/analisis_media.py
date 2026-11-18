"""Analisis media lokal (tanpa GPU): teks dalam gambar (RapidOCR, model PaddleOCR ONNX), tag visual (CLIP ONNX, tanpa pelatihan) dan sidik jari
gambar (dHash 64-bit). Dipakai oleh layanan media (worker) dan untuk uji sampel:

    python analisis_media.py <file-url.txt>     # satu URL gambar per baris; hasil JSON per baris + ringkasan waktu

Model dibaca dari MEDIA_CLIP_DIR: CLIP (Xenova/clip-vit-base-patch32, terkuantisasi) vision_model_quantized.onnx,
text_model_quantized.onnx, tokenizer.json, dan pembaca teks Inggris en_PP-OCRv3_rec_infer.onnx (SWHL/RapidOCR, PP-OCRv3). Paket Python: scripts/media/requirements.txt.
Tesseract dicoba lebih dulu (uji 18 Nov 2026) tapi gagal membaca teks bergaya di thumbnail ("TERBUKTI SADAP PRESIDEN
PRABOWO" terbaca "A BY LS TAP 1"); RapidOCR membacanya utuh.
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
# Gambar raksasa (bom dekompresi) ditolak PIL sebelum dibuka penuh; 40 MP jauh di atas foto media biasa.
Image.MAX_IMAGE_PIXELS = 40_000_000
# Server media kadang mengirim gambar sebagai application/octet-stream (uji: 8 dari 11 kegagalan); isinya yang dicek PIL.
_BINARY_TYPES = ("application/octet-stream", "binary/octet-stream", "application/x-binary", "")
FETCH_TIMEOUT = 12
# Satu sesi ONNX per proses dan satu thread: worker memproses satu gambar per waktu dan tidak boleh memakan semua core.
THREADS = int(os.environ.get("MEDIA_THREADS", "1"))

# Tag visual: kode (disimpan) dan beberapa kalimat Inggris untuk CLIP (embedding-nya dirata-rata, lebih stabil daripada satu
# kalimat). Kode yang diawali "_" adalah pembanding "biasa" (tidak disimpan): tanpanya softmax memaksa gambar netral masuk
# tag penting (uji sampel: kamera terbaca "senjata", orang berjalan terbaca "jenazah").
TAGS = [
    # Uji 40 foto berita bertema demo (18 Nov 2026): massa malam hari, massa berhadapan dengan polisi, orasi dengan pengeras
    # suara dan rapat akbar ber-panggung terlewat dengan satu kalimat saja; kalimat berikut menangkapnya.
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
    # CLIP kecil tidak bisa membedakan polisi, TNI, dan ASN berseragam (uji sampel), jadi satu tag saja.
    ("aparat", ["a photo of police officers or soldiers in uniform", "uniformed security forces on duty"]),
    ("bencana", ["a photo of a flood or landslide disaster", "a natural disaster with damaged houses"]),
    ("kecelakaan", ["a photo of a traffic accident with a crashed vehicle", "a wrecked car after a collision"]),
    ("tangkapan_layar", ["a screenshot of a social media post", "a screenshot of a chat conversation on a phone"]),
    ("dokumen", ["a photo of an official document or letter", "a printed paper document with text"]),
    ("poster", ["a poster or flyer with large text", "a news graphic with a headline"]),
    ("meme", ["an internet meme with caption text", "a funny meme image"]),
    ("infografis", ["an infographic or chart", "a data visualization graphic"]),
    ("pidato", ["a photo of an official giving a speech at a podium", "a person speaking into a microphone"]),
    ("rapat", ["a photo of a formal meeting around a table", "officials sitting in a meeting room"]),
    ("kelompok", ["a group photo of people posing", "people standing together outdoors"]),
    ("orang", ["a portrait photo of a person", "a close-up of a face"]),
    ("_kamera", ["a photo of a camera or electronic device", "a product photo of a gadget"]),
    ("_jalan", ["a person walking on the street", "a street scene with a road"]),
    ("_tinjau", ["officials inspecting a site outdoors", "government employees in batik uniform"]),
    ("makanan", ["a photo of food", "a dish of food on a plate"]),
    ("pemandangan", ["a photo of a landscape or city view", "a scenic view of nature"]),
    ("olahraga", ["a photo of a sports match", "athletes playing sports"]),
    ("kendaraan", ["a photo of a car or motorcycle", "vehicles parked on the road"]),
    ("logo", ["a logo or brand graphic", "a company logo on a plain background"]),
    ("produk", ["a product photo", "an advertisement for a product"]),
]
# Tag yang menandai konten sensitif (kekerasan, korban). Hanya penanda; keputusan tetap pada pembaca.
SENSITIVE = {"kericuhan", "senjata", "darah_luka", "jenazah"}
TAG_MIN = 0.15         # peluang minimal agar tag disimpan
# Demo dan kerumunan sering tersebar di beberapa tag mirip (kerumunan/demo/aparat), jadi ambangnya sedikit lebih rendah.
TAG_MIN_BY = {"demo": 0.12, "kerumunan": 0.12}
SENSITIVE_MIN = 0.55   # jauh lebih ketat: lebih baik terlewat daripada banyak alarm palsu
TEMPERATURE = 100.0    # skala logit CLIP
# Baris OCR dengan keyakinan di bawah ini dibuang. Uji 18 Nov 2026: teks asli hampir semua ≥ 0,90; teks acak dari huruf
# Arab/Kirill yang dibaca sebagai Latin 0,53–0,87.
OCR_MIN_CONF = 0.88
OCR_MIN_WORDS = 2      # di bawah ini dianggap "tidak ada teks" (kata = minimal 3 huruf)
OCR_MAX_SIDE = int(os.environ.get("MEDIA_OCR_SIDE", "1000"))  # sisi terpanjang untuk OCR (uji: 1600 px RAM ±1,5 GB; 1000 px ±740 MB, hasil sama)
# Watermark/branding media yang muncul di hampir setiap gambar berita (uji sampel); baris yang cocok dibuang dari OCR.
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
        self.vision = ort.InferenceSession(os.path.join(CLIP_DIR, "vision_model_quantized.onnx"), opts, providers=["CPUExecutionProvider"])
        text = ort.InferenceSession(os.path.join(CLIP_DIR, "text_model_quantized.onnx"), opts, providers=["CPUExecutionProvider"])
        tok = Tokenizer.from_file(os.path.join(CLIP_DIR, "tokenizer.json"))
        # Embedding teks label dihitung sekali; model teks lalu dilepas dari memori.
        embeds = []
        for _, prompts in TAGS:
            vs = [text.run(None, {"input_ids": np.array([tok.encode(p).ids], dtype=np.int64)})[0][0] for p in prompts]
            vs = [v / np.linalg.norm(v) for v in vs]
            embeds.append(np.mean(vs, axis=0))
        e = np.array(embeds, dtype=np.float32)
        self.tag_embeds = e / np.linalg.norm(e, axis=1, keepdims=True)
        del text
        # Model pembaca bawaan RapidOCR (Mandarin) membuang spasi di teks Latin ("SadapPrabowo"); model Inggris tidak.
        rec = os.path.join(CLIP_DIR, "en_PP-OCRv3_rec_infer.onnx")
        self.ocr_engine = RapidOCR(intra_op_num_threads=THREADS, inter_op_num_threads=1, **({"rec_model_path": rec} if os.path.exists(rec) else {}))

    def tags(self, img: Image.Image):
        # Dua pandangan: potongan tengah (detail) dan gambar utuh berlatar polos (tangkapan layar/poster panjang yang
        # pinggirnya terpotong pada potongan tengah). Peluangnya dirata-rata.
        x = np.concatenate([preprocess(img), preprocess(letterbox(img))])
        v = self.vision.run(None, {"pixel_values": x})[0]
        v = v / np.linalg.norm(v, axis=1, keepdims=True)
        logits = TEMPERATURE * (v @ self.tag_embeds.T)
        p = np.exp(logits - logits.max(axis=1, keepdims=True))
        p = (p / p.sum(axis=1, keepdims=True)).mean(axis=0)
        order = np.argsort(-p)
        # Tag sensitif hanya disimpan dengan skor tinggi: uji data nyata 18 Nov 2026, "jenazah" benar 1 dari 7 (skor 0,94);
        # enam alarm palsu (roller coaster, poster film, orang tiarap) semuanya di bawah 0,36.
        found = [{"tag": TAGS[i][0], "score": round(float(p[i]), 3)} for i in order
                 if p[i] >= (SENSITIVE_MIN if TAGS[i][0] in SENSITIVE else TAG_MIN_BY.get(TAGS[i][0], TAG_MIN)) and not TAGS[i][0].startswith("_")][:4]
        sensitive = [t["tag"] for t in found if t["tag"] in SENSITIVE and t["score"] >= SENSITIVE_MIN]
        return found, sensitive

    def analyze(self, data: bytes):
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except (Image.UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
            raise ValueError(f"bukan gambar yang bisa dibaca: {type(e).__name__}") from None
        img = img.convert("RGB")
        tags, sensitive = self.tags(img)
        text, words, lines = ocr(self.ocr_engine, img)
        return {"width": img.width, "height": img.height, "dhash": dhash(img), "tags": tags, "sensitive": sensitive,
                "ocrText": text if words >= OCR_MIN_WORDS else "", "ocrWords": words, "ocrLines": lines if words >= OCR_MIN_WORDS else []}


def preprocess(img: Image.Image) -> np.ndarray:
    """CLIP: sisi terpendek 224 (bicubic), potong tengah 224×224, skala 0–1, normalisasi, CHW."""
    w, h = img.size
    s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size
    left, top = (w - 224) // 2, (h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    a = (np.asarray(img, dtype=np.float32) / 255.0 - MEAN) / STD
    return a.transpose(2, 0, 1)[None].astype(np.float32)


def letterbox(img: Image.Image) -> Image.Image:
    """Gambar utuh di tengah kanvas persegi abu-abu (warna rata-rata CLIP), tanpa terpotong."""
    side = max(img.size)
    canvas = Image.new("RGB", (side, side), (123, 117, 104))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def _wordlike(token: str) -> bool:
    """Kata, bukan sisa OCR huruf non-Latin: ≥3 huruf, ada vokal, tidak ada 5 konsonan berderet."""
    t = token.lower()
    return len(t) >= 3 and any(c in "aeiouy" for c in t) and not re.search(r"[^\Waeiouy\d_]{5,}", t)


def _readable(line: str) -> bool:
    """Baris dibuang bila kebanyakan katanya tidak menyerupai kata (uji: gambar berbahasa Arab terbaca
    "ALMAJDLAWFIRM cwigib ana giall"). Angka dan baris pendek tanpa huruf (harga, jam) tetap disimpan."""
    words = WORD.findall(line)
    if not words:
        return bool(re.search(r"\d", line))
    return sum(_wordlike(w) for w in words) / len(words) >= 0.6


def ocr(engine: RapidOCR, img: Image.Image):
    """Teks dalam gambar, baris demi baris dari atas. Watermark media dan teks acak dibuang.
    Kembali (teks, jumlah kata ≥3 huruf, baris dengan letaknya): h = tinggi huruf, cy = letak tengah vertikal, keduanya
    relatif terhadap tinggi gambar (0–1). Dipakai worker untuk memilih "teks penting" (judul besar vs teks kecil di latar)."""
    if max(img.size) > OCR_MAX_SIDE:
        f = OCR_MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * f), round(img.height * f)), Image.BICUBIC)
    res, _ = engine(np.asarray(img))
    lines = []
    for box, t, conf in res or []:
        t = t.strip()
        if float(conf) < OCR_MIN_CONF or not t or WATERMARK.match(t) or not _readable(t):
            continue
        ys = [p[1] for p in box]
        lines.append({"t": t, "h": round((max(ys) - min(ys)) / img.height, 4), "cy": round((max(ys) + min(ys)) / 2 / img.height, 4)})
    return "\n".join(l["t"] for l in lines), sum(len(WORD.findall(l["t"])) for l in lines), lines


def dhash(img: Image.Image) -> str:
    """Sidik jari 64-bit: gambar yang sama (meski ukuran/kompresinya beda) menghasilkan hash yang sama atau sangat dekat."""
    g = np.asarray(img.convert("L").resize((9, 8), Image.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def _public(url: str) -> None:
    """Tolak URL yang mengarah ke alamat internal (SSRF): hanya http(s) ke IP publik, dicek juga di setiap redirect."""
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


if __name__ == "__main__":
    a = Analyzer()
    times = []
    for url in [u.strip() for u in open(sys.argv[1]) if u.strip()]:
        t0 = time.time()
        try:
            data = fetch(url)
            t1 = time.time()
            r = a.analyze(data)
            r.update(url=url, fetchMs=round((t1 - t0) * 1000), analyzeMs=round((time.time() - t1) * 1000))
            times.append(r["analyzeMs"])
        except Exception as e:  # noqa: BLE001 — uji sampel: catat lalu lanjut
            r = {"url": url, "error": str(e)[:200]}
        print(json.dumps(r, ensure_ascii=False), flush=True)
    if times:
        print(json.dumps({"ringkasan": {"berhasil": len(times), "rataMs": round(sum(times) / len(times)), "maksMs": max(times)}}), flush=True)
