"""Tests of the pure functions of the media analysis (no network, no models):

    python -m unittest scripts/media/test_media_analysis.py     # in the media service venv (requirements.txt)
"""
import os
import sys
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import media_analysis as A  # noqa: E402


def make_image(w=640, h=360, text=None):
    img = Image.new("RGB", (w, h), (30, 90, 160))
    d = ImageDraw.Draw(img)
    for i in range(0, w, 40):
        d.rectangle([i, 0, i + 18, h], fill=(200, 60 + i % 150, 40))
    if text:
        d.text((20, h // 2), text, fill=(255, 255, 255))
    return img


class Ocr(unittest.TestCase):
    def test_watermarks_are_dropped(self):
        for l in ["KOMPAS.com", "JERNIHMELIHATDUNIA", "jernih melihat dunia", "kumparanNEWS", "REPUBLIKA.CO.ID", "DOK."]:
            self.assertTrue(A.WATERMARK.match(l), l)
        for l in ["Irjen Eko Hadi Gunakan", "Kompas mencatat kenaikan harga"]:
            self.assertFalse(A.WATERMARK.match(l), l)

    def test_readable_lines(self):
        for l in ["KEMAREN YG BIKIN STATUS BAHAGIA GIBRAN DI", "TERBUKTI SADAP", "Rp 950.000", "17.30 WIB"]:
            self.assertTrue(A._readable(l), l)
        for l in ["xkcd qwrtzpl mnbvcxz", "ghjklmnbv srtpqwz"]:
            self.assertFalse(A._readable(l), l)

    def test_unreadable_text(self):
        box = [[10, 10], [200, 10], [200, 40], [10, 40]]
        def engine(rows):
            return lambda _img: ([(box, t, c) for t, c in rows], None)
        img = make_image()
        noise = [("ala ilg", 0.6), ("wly mrq", 0.55), ("qsd lkh", 0.7), ("ALMAJD", 0.95)]
        self.assertTrue(A.ocr(engine(noise), img)[3])
        latin = [("TERBUKTI SADAP", 0.97), ("RESMI MUNDUR", 0.95), ("xx", 0.6)]
        self.assertFalse(A.ocr(engine(latin), img)[3])
        self.assertFalse(A.ocr(engine([]), img)[3])

    def test_other_scripts(self):
        box = [[10, 10], [200, 10], [200, 40], [10, 40]]
        def engine(rows):
            return lambda _img: ([(box, t, c) for t, c in rows], None)
        img = make_image()
        # Arabic comes out of the model reversed: flipped back. Cyrillic wins because it has the most non-Latin letters.
        engines = {"arabic": engine([("نيرهاظتملا", 0.95)]), "eslav": engine([("задержала", 0.87), ("протестующих", 0.91)]),
                   "chinese": engine([("3anepkana", 0.9)])}
        script, text, words, lines = A.other_script(engines, img)
        self.assertEqual((script, text, words), ("eslav", "задержала\nпротестующих", 2))
        self.assertEqual(A.other_script({"arabic": engine([("نيرهاظتملا", 0.95)])}, img)[1], "المتظاهرين")
        # Latin letters (another-script model reading styled Latin text) and low confidence are refused.
        self.assertIsNone(A.other_script({"chinese": engine([("THEULTIMATE DESTINATION", 0.9)])}, img))
        self.assertIsNone(A.other_script({"eslav": engine([("задержала", 0.5)])}, img))


class TagModel(unittest.TestCase):
    """Fixed test set (data/label_tag.npz, 286 labelled images never used for training): guards the tag model's accuracy when
    rules, CLIP sentences or the model change. No CLIP needed: the image embeddings are stored."""
    GROUPS = {"graphic": {"poster", "meme", "infografis", "tangkapan_layar", "dokumen", "logo"}, "person": {"orang", "pidato"},
              "many": {"kelompok", "rapat", "kerumunan", "demo"}, "incident": {"bencana", "kebakaran", "kecelakaan"}}

    @classmethod
    def setUpClass(cls):
        import numpy as np
        here = os.path.dirname(__file__)
        d = np.load(os.path.join(here, "data", "label_tag.npz"))
        cls.X, cls.y = d["X"][d["test"]].astype(np.float32), [str(t) for t in d["y"][d["test"]]]
        cls.model = dict(np.load(os.path.join(here, "tag_model.npz")))

    def main_tag(self, emb):
        tags = A.model_tags(emb, self.model)
        return tags[0]["tag"] if tags else "none"

    def test_accuracy_on_fixed_test_set(self):
        pred = [self.main_tag(x) for x in self.X]
        group = lambda t: next((k for k, v in self.GROUPS.items() if t in v), t)
        exact = sum(p == t for p, t in zip(pred, self.y)) / len(self.y)
        loose = sum(group(p) == group(t) for p, t in zip(pred, self.y)) / len(self.y)
        # 19 Nov 2026: exact 66.4%, loose ±78%; the earlier zero-shot 53.5% / 69.6%.
        self.assertGreaterEqual(exact, 0.62, f"exact {exact:.1%}")
        self.assertGreaterEqual(loose, 0.74, f"loose {loose:.1%}")

    def test_no_sensitive_tags(self):
        for x in self.X:
            self.assertFalse({t["tag"] for t in A.model_tags(x, self.model)} & A.SENSITIVE)


class Images(unittest.TestCase):
    def test_letterbox_is_square_and_uncropped(self):
        img = make_image(300, 900)
        box = A.letterbox(img)
        self.assertEqual(box.size, (900, 900))
        self.assertEqual(box.getpixel((450, 450)), img.getpixel((150, 450)))

    def test_preprocess_clip_shape(self):
        self.assertEqual(A.preprocess(make_image(1200, 675)).shape, (1, 3, 224, 224))

    def test_dhash_stable_across_size_and_compression(self):
        import io
        img = make_image()
        buf = io.BytesIO()
        img.resize((320, 180)).save(buf, format="JPEG", quality=40)
        small = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
        diff = bin(int(A.dhash(img), 16) ^ int(A.dhash(small), 16)).count("1")
        self.assertLessEqual(diff, 6)
        other = bin(int(A.dhash(img), 16) ^ int(A.dhash(make_image().transpose(Image.FLIP_LEFT_RIGHT)), 16)).count("1")
        self.assertGreater(other, 6)


class Security(unittest.TestCase):
    def test_internal_addresses_are_refused(self):
        for url in ["http://127.0.0.1/x.png", "http://localhost:3100/a.jpg", "http://10.0.0.5/a.jpg", "http://169.254.169.254/latest/meta-data",
                    "file:///etc/passwd", "ftp://example.com/a.jpg", "http://[::1]/a.jpg"]:
            with self.assertRaises(ValueError, msg=url):
                A._public(url)

    def test_video_frames_only_from_video_cdns(self):
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
