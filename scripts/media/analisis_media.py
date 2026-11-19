"""Analisis media lokal (tanpa GPU): teks dalam gambar (RapidOCR, model PaddleOCR ONNX), tag visual (CLIP ONNX, tanpa pelatihan) dan sidik jari
gambar (dHash 64-bit). Dipakai oleh layanan media (worker) dan untuk uji sampel:

    python analisis_media.py <file-url.txt>     # satu URL gambar per baris; hasil JSON per baris + ringkasan waktu

Model dibaca dari MEDIA_CLIP_DIR: CLIP (Xenova/clip-vit-base-patch32) vision_model.onnx dan text_model.onnx (fp32; cadangan
*_quantized.onnx), tokenizer.json, dan pembaca teks Inggris en_PP-OCRv3_rec_infer.onnx (SWHL/RapidOCR, PP-OCRv3). Paket Python: scripts/media/requirements.txt.
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
# 12 dtk terlalu ketat untuk CDN berita yang lambat dari server (19 Nov 2026: ±190 dari 10 ribu gambar gagal karena
# handshake/baca timeout di detik, kompas, RRI); 403/404 tidak terpengaruh dan tidak diakali.
FETCH_TIMEOUT = 20
# Satu sesi ONNX per proses dan satu thread: worker memproses satu gambar per waktu dan tidak boleh memakan semua core.
THREADS = int(os.environ.get("MEDIA_THREADS", "1"))
VARIANT = os.environ.get("MEDIA_CLIP_VARIANT", "fp32")  # fp32 (bawaan bila filenya ada) | q8

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
    # Uji 254 gambar berlabel (19 Nov 2026): dua kalimat awal hanya menangkap 15/48 poster; tiga kalimat tambahan → 26/48,
    # tag utama tepat 59% → 64%, tag lain hanya rugi 2. Kalimat "wajah orang"/"kandidat" menaikkan poster lagi tapi menarik
    # foto aparat, rapat, dan pidato.
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
# Tag yang menandai konten sensitif (kekerasan, korban). Hanya penanda; keputusan tetap pada pembaca.
SENSITIVE = {"kericuhan", "senjata", "darah_luka", "jenazah"}
TAG_MIN = 0.15         # peluang minimal agar tag disimpan
# Ambang per tag, disetel 19 Nov 2026 dari 254 gambar produksi berlabel (model fp32; disetel di separuh sampel, diuji di
# separuh lainnya: tag utama tepat 58% → 63%, tepat atau tertukar dengan tag mirip 68% → 77%). "_tinjau" dibuang: ia
# menyerap kartu berita dan potret pejabat sehingga gambar itu tanpa tag. Bencana 0,9 (bukan 0,99 hasil penyetelan: sampel
# hanya punya 2 foto bencana, dan uji banjir sebelumnya memberi skor ≥ 0,74).
TAG_MIN_BY = {"bencana": 0.9, "demo": 0.2, "kebakaran": 0.6, "kecelakaan": 0.35, "kerumunan": 0.6, "logo": 0.6, "meme": 0.35,
              "orang": 0.05, "pidato": 0.3, "poster": 0.1, "produk": 0.5, "rapat": 0.35, "tangkapan_layar": 0.3}
# Model tag terlatih (scripts/media/latih_tag.py): menggantikan ambang zero-shot di atas untuk tag biasa. Uji set tetap
# 286 gambar (19 Nov 2026): tag utama tepat 53,5% → 66,4%, termasuk tag mirip 69,6% → 77,6%. Tag sensitif tetap dari
# zero-shot dengan SENSITIVE_MIN: contohnya terlalu sedikit untuk dilatih. Tanpa berkasnya, zero-shot dipakai seperti dulu.
TAG_MODEL = os.environ.get("MEDIA_TAG_MODEL", os.path.join(os.path.dirname(__file__), "tag_model.npz"))
MODEL_TAG_MIN = 0.25   # tag tambahan (selain tag utama) ditampilkan bila peluangnya setidaknya ini
SENSITIVE_MIN = 0.65   # jauh lebih ketat: lebih baik terlewat daripada banyak alarm palsu (uji fp32: 2/2 benar)
TEMPERATURE = 100.0    # skala logit CLIP
# Baris OCR dengan keyakinan di bawah ini dibuang. Uji 18 Nov 2026: teks asli hampir semua ≥ 0,90; teks acak dari huruf
# Arab/Kirill yang dibaca sebagai Latin 0,53–0,87.
OCR_MIN_CONF = 0.88
OCR_MIN_WORDS = 2      # di bawah ini dianggap "tidak ada teks" (kata = minimal 3 huruf)
OCR_MAX_SIDE = int(os.environ.get("MEDIA_OCR_SIDE", "1000"))  # sisi terpanjang untuk OCR (uji: 1600 px RAM ±1,5 GB; 1000 px ±740 MB, hasil sama)
OCR_UPSCALE_MAX = 2.0  # gambar kecil diperbesar ke OCR_MAX_SIDE, paling banyak 2×
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
        # fp32 bila ada: model 8-bit (u8s8) memberi skor yang menyimpang di CPU x86 tanpa VNNI (server: AMD EPYC, AVX2) —
        # uji 19 Nov 2026: kericuhan 0,79 → 0,40, kelompok → demo. fp32 identik di ARM dan x86, ±70 ms lebih lambat.
        sfx = "" if os.path.exists(os.path.join(CLIP_DIR, "vision_model.onnx")) and VARIANT == "fp32" else "_quantized"
        self.vision = ort.InferenceSession(os.path.join(CLIP_DIR, f"vision_model{sfx}.onnx"), opts, providers=["CPUExecutionProvider"])
        text = ort.InferenceSession(os.path.join(CLIP_DIR, f"text_model{sfx}.onnx"), opts, providers=["CPUExecutionProvider"])
        self.variant = "fp32" if not sfx else "q8"
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
        self.tag_model = dict(np.load(TAG_MODEL)) if os.path.exists(TAG_MODEL) else None
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
        return {"width": img.width, "height": img.height, "dhash": dhash(img), "tags": tags, "sensitive": sensitive,
                "ocrText": text if words >= OCR_MIN_WORDS else "", "ocrWords": words, "ocrLines": lines if words >= OCR_MIN_WORDS else [],
                "unreadText": unreadable and words < OCR_MIN_WORDS * 3}


TAG_INDEX = {t: i for i, (t, _) in enumerate(TAGS)}


def model_tags(emb: np.ndarray, model: dict) -> list:
    """Tag biasa dari model terlatih untuk satu embedding gambar (rata-rata dua pandangan, ternormalisasi): tag utama
    (kelas berpeluang tertinggi; "none" = tanpa tag) lalu tag lain dengan peluang ≥ MODEL_TAG_MIN. Tag sensitif tidak
    pernah dari sini."""
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
    # Gambar besar diperkecil (RAM); gambar kecil diperbesar (maks. 2×): teks kecil di foto berita 730 px terbaca di bawah
    # ambang keyakinan, pada 1000 px terbaca ("PIMPINAN DAN ANGGOTA DPRD ..." 0,85 → 0,98).
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
    # Teks yang terdeteksi tapi tidak terbaca: banyak kotak teks, hampir semuanya di bawah ambang keyakinan. Biasanya aksara
    # non-Latin (Arab, Kirill, Mandarin) yang dibaca model Inggris sebagai huruf acak.
    total = len(res or [])
    unreadable = unread >= 3 and unread / max(1, total) >= 0.6
    return "\n".join(l["t"] for l in lines), sum(len(WORD.findall(l["t"])) for l in lines), lines, unreadable


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
