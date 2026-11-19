"""Test fungsi murni analisis media (tanpa jaringan dan tanpa model):

    python -m unittest scripts/media/test_analisis_media.py     # dengan venv layanan media (requirements.txt)
"""
import os
import sys
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import analisis_media as A  # noqa: E402


def gambar(w=640, h=360, teks=None):
    img = Image.new("RGB", (w, h), (30, 90, 160))
    d = ImageDraw.Draw(img)
    for i in range(0, w, 40):
        d.rectangle([i, 0, i + 18, h], fill=(200, 60 + i % 150, 40))
    if teks:
        d.text((20, h // 2), teks, fill=(255, 255, 255))
    return img


class Ocr(unittest.TestCase):
    def test_watermark_dibuang(self):
        for l in ["KOMPAS.com", "JERNIHMELIHATDUNIA", "jernih melihat dunia", "kumparanNEWS", "REPUBLIKA.CO.ID", "DOK."]:
            self.assertTrue(A.WATERMARK.match(l), l)
        for l in ["Irjen Eko Hadi Gunakan", "Kompas mencatat kenaikan harga"]:
            self.assertFalse(A.WATERMARK.match(l), l)

    def test_baris_terbaca(self):
        for l in ["KEMAREN YG BIKIN STATUS BAHAGIA GIBRAN DI", "TERBUKTI SADAP", "Rp 950.000", "17.30 WIB"]:
            self.assertTrue(A._readable(l), l)
        for l in ["xkcd qwrtzpl mnbvcxz", "ghjklmnbv srtpqwz"]:
            self.assertFalse(A._readable(l), l)


    def test_teks_tak_terbaca(self):
        box = [[10, 10], [200, 10], [200, 40], [10, 40]]
        def engine(rows):
            return lambda _img: ([(box, t, c) for t, c in rows], None)
        img = gambar()
        acak = [("ala ilg", 0.6), ("wly mrq", 0.55), ("qsd lkh", 0.7), ("ALMAJD", 0.95)]
        self.assertTrue(A.ocr(engine(acak), img)[3])
        latin = [("TERBUKTI SADAP", 0.97), ("RESMI MUNDUR", 0.95), ("xx", 0.6)]
        self.assertFalse(A.ocr(engine(latin), img)[3])
        self.assertFalse(A.ocr(engine([]), img)[3])

    def test_aksara_lain(self):
        box = [[10, 10], [200, 10], [200, 40], [10, 40]]
        def engine(rows):
            return lambda _img: ([(box, t, c) for t, c in rows], None)
        img = gambar()
        # Arab keluar terbalik dari model: dibalik lagi. Kirill dipilih karena paling banyak huruf non-Latin.
        engines = {"arabic": engine([("نيرهاظتملا", 0.95)]), "eslav": engine([("задержала", 0.87), ("протестующих", 0.91)]),
                   "chinese": engine([("3anepkana", 0.9)])}
        script, text, words, lines = A.other_script(engines, img)
        self.assertEqual((script, text, words), ("eslav", "задержала\nпротестующих", 2))
        self.assertEqual(A.other_script({"arabic": engine([("نيرهاظتملا", 0.95)])}, img)[1], "المتظاهرين")
        # Huruf Latin (model aksara lain membaca teks Latin bergaya) dan keyakinan rendah ditolak.
        self.assertIsNone(A.other_script({"chinese": engine([("THEULTIMATE DESTINATION", 0.9)])}, img))
        self.assertIsNone(A.other_script({"eslav": engine([("задержала", 0.5)])}, img))


class ModelTag(unittest.TestCase):
    """Set uji tetap (data/label_tag.npz, 286 gambar berlabel yang tidak dipakai melatih): menjaga akurasi model tag saat
    aturan, kalimat CLIP, atau model diganti. Tanpa CLIP: embedding gambar sudah tersimpan."""
    GRUP = {"grafis": {"poster", "meme", "infografis", "tangkapan_layar", "dokumen", "logo"}, "orang": {"orang", "pidato"},
            "banyak": {"kelompok", "rapat", "kerumunan", "demo"}, "musibah": {"bencana", "kebakaran", "kecelakaan"}}

    @classmethod
    def setUpClass(cls):
        import numpy as np
        here = os.path.dirname(__file__)
        d = np.load(os.path.join(here, "data", "label_tag.npz"))
        cls.X, cls.y = d["X"][d["test"]].astype(np.float32), [str(t) for t in d["y"][d["test"]]]
        cls.model = dict(np.load(os.path.join(here, "tag_model.npz")))

    def utama(self, emb):
        tags = A.model_tags(emb, self.model)
        return tags[0]["tag"] if tags else "none"

    def test_akurasi_set_uji(self):
        pred = [self.utama(x) for x in self.X]
        grup = lambda t: next((k for k, v in self.GRUP.items() if t in v), t)
        tepat = sum(p == t for p, t in zip(pred, self.y)) / len(self.y)
        longgar = sum(grup(p) == grup(t) for p, t in zip(pred, self.y)) / len(self.y)
        # 19 Nov 2026: tepat 66,4%, longgar ±78%; zero-shot sebelumnya 53,5% / 69,6%.
        self.assertGreaterEqual(tepat, 0.62, f"tepat {tepat:.1%}")
        self.assertGreaterEqual(longgar, 0.74, f"longgar {longgar:.1%}")

    def test_tanpa_tag_sensitif(self):
        for x in self.X:
            self.assertFalse({t["tag"] for t in A.model_tags(x, self.model)} & A.SENSITIVE)


class Gambar(unittest.TestCase):
    def test_letterbox_persegi_tanpa_terpotong(self):
        img = gambar(300, 900)
        box = A.letterbox(img)
        self.assertEqual(box.size, (900, 900))
        self.assertEqual(box.getpixel((450, 450)), img.getpixel((150, 450)))

    def test_preprocess_bentuk_clip(self):
        self.assertEqual(A.preprocess(gambar(1200, 675)).shape, (1, 3, 224, 224))

    def test_dhash_stabil_untuk_ukuran_dan_kompresi(self):
        import io
        img = gambar()
        buf = io.BytesIO()
        img.resize((320, 180)).save(buf, format="JPEG", quality=40)
        kecil = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
        beda = bin(int(A.dhash(img), 16) ^ int(A.dhash(kecil), 16)).count("1")
        self.assertLessEqual(beda, 6)
        lain = bin(int(A.dhash(img), 16) ^ int(A.dhash(gambar().transpose(Image.FLIP_LEFT_RIGHT)), 16)).count("1")
        self.assertGreater(lain, 6)


class Keamanan(unittest.TestCase):
    def test_alamat_internal_ditolak(self):
        for url in ["http://127.0.0.1/x.png", "http://localhost:3100/a.jpg", "http://10.0.0.5/a.jpg", "http://169.254.169.254/latest/meta-data",
                    "file:///etc/passwd", "ftp://example.com/a.jpg", "http://[::1]/a.jpg"]:
            with self.assertRaises(ValueError, msg=url):
                A._public(url)


    def test_frame_video_hanya_dari_cdn_video(self):
        self.assertTrue(A.is_video_frame("https://video.twimg.com/amplify_video/1/vid/a.mp4?tag=14#t=50%"))
        self.assertTrue(A.is_video_frame("https://scontent-sin6-2.cdninstagram.com/o1/v/t2/a.mp4?x=1#t=25%"))
        for url in ["https://example.com/a.mp4#t=50%", "https://video.twimg.com/a.mp4#t=12", "https://video.twimg.com.evil.example/a.mp4#t=50%",
                    "https://pbs.twimg.com/media/a.jpg"]:
            self.assertFalse(A.is_video_frame(url), url)
        for url in ["http://video.twimg.com/a.mp4", "https://example.com/a.mp4", "https://127.0.0.1/a.mp4"]:
            with self.assertRaises(ValueError, msg=url):
                A.open_video(url)


if __name__ == "__main__":
    unittest.main()
