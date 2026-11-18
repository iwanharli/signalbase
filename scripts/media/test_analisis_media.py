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


if __name__ == "__main__":
    unittest.main()
