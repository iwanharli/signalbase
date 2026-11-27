"""Trains the visual tag model: a linear classifier on CLIP embeddings that starts from the CLIP text weights (zero-shot) and
is only moved as far as the labelled data needs, so tags with few examples keep CLIP's knowledge.

    MEDIA_CLIP_DIR=... python scripts/media/train_tags.py      →  scripts/media/tag_model.npz

Data: scripts/media/data/label_tag.npz — image embeddings (mean of two views, normalised; float16), the main label per image
(a tag or "none"), and a fixed test-set marker (25% per class, never used for training). Labelled 19 Nov 2026: 1,150 production
images (news, X photos/videos, YouTube thumbnails), then session 2: 392 images of the last two days (Instagram/Threads too),
more of the often-confused tags; all of it is training data, the fixed test set stays the same (286). Result: exact
66.8% → 68.9%, loose 79.7% → 78.7%. The images themselves are not stored.
Needs the CLIP text model (MEDIA_CLIP_DIR) for the starting weights; the finished model is tested by test_media_analysis.py
(no CLIP needed).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import media_analysis as A  # noqa: E402

HERE = os.path.dirname(__file__)
SCALE = 30.0      # model logit scale
L2 = 3e-3         # pull towards the CLIP weights (5-fold cross-validation: 1e-3 70.2%, 3e-3 71.2%, 1e-2 61.0%)
EPOCHS, LR = 500, 1.0


def softmax(lg):
    lg = lg - lg.max(axis=1, keepdims=True)
    p = np.exp(lg)
    return p / p.sum(axis=1, keepdims=True)


def initial_weights(classes, tag_embeds):
    names = [t for t, _ in A.TAGS]
    junk = np.mean([tag_embeds[i] for i, t in enumerate(names) if t.startswith("_")], axis=0)  # "none": the catch-all class
    return np.stack([(tag_embeds[names.index(c)] if c in names else junk) * A.TEMPERATURE / SCALE for c in classes], axis=1)


def train(X, y, classes, W0, l2=L2):
    Y = np.zeros((len(y), len(classes)))
    Y[np.arange(len(y)), [classes.index(c) for c in y]] = 1
    # Example weights: inverse square root of the class frequency, so posters (the largest class) don't swallow the others.
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
    # Calibration: logits are divided by a temperature T chosen from 5-fold out-of-fold predictions on the training data (best
    # log-likelihood), so tag scores read as probabilities (without it almost every score is 1.0).
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
    print(f"{len(y)} images ({(~test).sum()} train, {test.sum()} test), {len(classes)} classes; temperature {temp:.2f}; "
          f"test exact {np.mean(pred == y[test]):.1%}, mean main-tag probability {softmax(lg).max(1).mean():.2f}")
    np.savez(os.path.join(HERE, "tag_model.npz"), W=W.astype(np.float32), b=b.astype(np.float32), classes=np.array(classes), scale=SCALE / temp)
