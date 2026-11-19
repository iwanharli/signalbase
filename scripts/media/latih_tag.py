"""Melatih model tag visual: klasifikasi linear di atas embedding CLIP, dimulai dari bobot teks CLIP (zero-shot) dan
hanya digeser seperlunya oleh data berlabel, sehingga tag yang contohnya sedikit tetap memakai pengetahuan CLIP.

    MEDIA_CLIP_DIR=... python scripts/media/latih_tag.py      →  scripts/media/tag_model.npz

Data: scripts/media/data/label_tag.npz — embedding gambar (rata-rata dua pandangan, ternormalisasi; float16), label
utama per gambar (tag atau "none"), dan penanda set uji tetap (25% per kelas, tidak pernah dipakai melatih). Label
19 Nov 2026: 1.150 gambar produksi (berita, foto/video X, thumbnail YouTube), lalu sesi 2: 392 gambar dua hari terakhir
(termasuk Instagram/Threads), lebih banyak dari tag yang sering tertukar; semuanya masuk data latih, set uji tetap sama
(286). Hasil: tepat 66,8% → 68,9%, longgar 79,7% → 78,7%. Gambarnya sendiri tidak disimpan.
Butuh model teks CLIP (MEDIA_CLIP_DIR) untuk bobot awal; uji model jadi: test_analisis_media.py (tanpa CLIP).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import analisis_media as A  # noqa: E402

HERE = os.path.dirname(__file__)
SCALE = 30.0      # skala logit model
L2 = 3e-3         # tarikan ke bobot CLIP (validasi silang 5 lipat: 1e-3 70,2%, 3e-3 71,2%, 1e-2 61,0%)
EPOCHS, LR = 500, 1.0


def softmax(lg):
    lg = lg - lg.max(axis=1, keepdims=True)
    p = np.exp(lg)
    return p / p.sum(axis=1, keepdims=True)


def initial_weights(classes, tag_embeds):
    names = [t for t, _ in A.TAGS]
    junk = np.mean([tag_embeds[i] for i, t in enumerate(names) if t.startswith("_")], axis=0)  # "none": kelas buangan
    return np.stack([(tag_embeds[names.index(c)] if c in names else junk) * A.TEMPERATURE / SCALE for c in classes], axis=1)


def train(X, y, classes, W0, l2=L2):
    Y = np.zeros((len(y), len(classes)))
    Y[np.arange(len(y)), [classes.index(c) for c in y]] = 1
    # Bobot contoh: akar frekuensi terbalik, agar poster (kelas terbesar) tidak menelan kelas lain.
    w = (1 / np.sqrt(np.maximum(Y.sum(0), 1)))[Y.argmax(1)]
    w /= w.mean()
    W, b = W0.copy(), np.zeros(len(classes))
    for _ in range(EPOCHS):
        G = (softmax(SCALE * X @ W + b) - Y) * w[:, None] / len(y)
        W -= LR * (SCALE * X.T @ G + l2 * (W - W0))
        b -= LR * G.sum(0)
    return W, b


if __name__ == "__main__":
    d = np.load(os.path.join(HERE, "data", "label_tag.npz"))
    X, y, test = d["X"].astype(np.float32), d["y"], d["test"]
    classes = sorted(set(y))
    W0 = initial_weights(classes, A.Analyzer().tag_embeds)
    Xtr, ytr = X[~test], y[~test]
    # Kalibrasi: logit dibagi suhu T yang dipilih dari prediksi silang 5 lipat di data latih (log-likelihood terbaik), agar
    # skor tag bisa dibaca sebagai peluang (tanpa ini hampir semua skor 1,0).
    folds = np.arange(len(ytr)) % 5
    np.random.default_rng(1).shuffle(folds)
    oof = np.zeros((len(ytr), len(classes)))
    for f in range(5):
        Wf, bf = train(Xtr[folds != f], ytr[folds != f], classes, W0)
        oof[folds == f] = SCALE * Xtr[folds == f] @ Wf + bf
    idx = np.array([classes.index(c) for c in ytr])
    nll = {t: -np.mean(np.log(softmax(oof / t)[np.arange(len(ytr)), idx] + 1e-9)) for t in np.arange(1.0, 12.01, 0.25)}
    temp = min(nll, key=nll.get)
    W, b = train(Xtr, ytr, classes, W0)
    lg = (SCALE * X[test] @ W + b) / temp
    pred = np.array(classes)[lg.argmax(1)]
    print(f"{len(y)} gambar ({(~test).sum()} latih, {test.sum()} uji), {len(classes)} kelas; suhu {temp:.2f}; "
          f"uji tepat {np.mean(pred == y[test]):.1%}, peluang tag utama rata-rata {softmax(lg).max(1).mean():.2f}")
    np.savez(os.path.join(HERE, "tag_model.npz"), W=W.astype(np.float32), b=b.astype(np.float32), classes=np.array(classes), scale=SCALE / temp)
