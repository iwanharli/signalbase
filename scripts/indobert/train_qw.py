"""Fine-tunes IndoBERT for the 8 Polri Quick Win categories (+ "none") from the DeepSeek labels of the KIPERMAS classifier
(key "Polisi"). One model for social media and online news; the media type leads the text ("[social] ..." / "[online] ...").

  python train_qw.py --data label.jsonl --out model/ --test     # 85% train, 15% test (unique texts, no leak), save the model
  python train_qw.py --data label.jsonl --out model/            # train on every label

label.jsonl: one line {type, code, category, confidence, text}, exported from the Classification table + the source database.
Runs on Apple GPU (mps), CUDA or CPU. The test also prints a "coverage" table: if only predictions with probability
>= a threshold are used (the rest still go to DeepSeek), what share of posts the model handles and how often it agrees.
"""
import argparse
import json
import math
import os
import re
import time

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

BASE = os.environ.get("FINETUNE_BASE", "indobenchmark/indobert-base-p1")
LABELS = [f"QW{i}" for i in range(1, 9)] + ["none"]
MAXLEN = 160
DEV = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"


TWEET = "indobertweet" in BASE.lower()


# Keyword rules (same as the pbm labelling; media items get one label): QW3/QW8 only replace a none/QW1/QW5 guess, and QW5
# is only kept when the text is about how a case proceeds (gold audit 16 Nov 2026: ordinary crime news was guessed QW5).
QW3 = re.compile(r"\b(per)?judi(an)?\b|\bjudol\b|\bslot\b|\btogel\b|sabung ayam|\bpinjol\b|pinjaman (daring|online)|\bpenipu(an)?\b|\bscam\b|\bsiber\b|\bcyber", re.I)
QW8 = re.compile(r"\b(bbm|solar|elpiji|lpg|gas)\b[^.]{0,40}\b(ilegal|subsidi|oplos\w*|timbun\w*|penimbun\w*|selundup\w*)|\bpengoplos|\bpenimbunan\b"
                 r"|tambang\s+(emas\s+)?(ilegal|liar)|pertambangan ilegal|\btppo\b|perdagangan orang|\bkorupsi\b|\bkoruptor|\btipikor\b|\btppu\b"
                 r"|pencucian uang|mafia tanah|pidana pertanahan|labfor|\binafis\b|\bkuhp\b|\bkuhap\b", re.I)
QW5_CASE = re.compile(r"sp2hp|perkembangan (laporan|perkara|kasus)|mandek|mangkrak|berkas|dilimpahkan|\bp-?21\b|\bsp3\b|gelar perkara|"
                     r"restorative|keadilan restoratif|transparan|usut tuntas|mendesak|desak|tindak ?lanjut", re.I)


def apply_rules(label, text):
    if label in ("none", "QW1", "QW5"):
        if QW8.search(text):
            return "QW8"
        if QW3.search(text):
            return "QW3"
    if label == "QW5" and not QW5_CASE.search(text):
        return "none"
    return label


def prep(type_, text):
    t = " ".join(text.split())[:1200]
    if TWEET:  # IndoBERTweet preprocessing: lower case, mentions -> @USER, links -> HTTPURL
        t = re.sub(r"https?://\S+|www\.\S+", "HTTPURL", re.sub(r"@\w+", "@USER", t)).lower()
    return f"[{type_}] " + t


def load(path):
    seen, texts, y, conf, types = set(), [], [], [], []
    for line in open(path):
        r = json.loads(line)
        if r["category"] not in LABELS:
            continue
        key = " ".join(r["text"].lower().split())
        if key in seen:  # the same text (repost/copy) once only, so the test data does not leak from the training data
            continue
        seen.add(key)
        texts.append(prep(r["type"], r["text"]))
        y.append(LABELS.index(r["category"]))
        conf.append(r.get("confidence") or 0.0)
        types.append(r["type"])
    return texts, np.array(y), np.array(conf), np.array(types)


def sample_weights(y, conf, idx, weak):
    """Per-example weights: unsure DeepSeek labels (confidence < 0.6) count half; rare classes are boosted a little (inverse
    square root of the frequency)."""
    w = np.where(conf < 0.6, 0.5, 1.0) if weak else np.ones(len(y))
    freq = np.bincount(y[idx], minlength=len(LABELS)) / len(idx)
    cls = np.sqrt(freq.max() / np.maximum(freq, 1e-6)) if weak else np.ones(len(LABELS))
    return (w * cls[y]).astype(np.float32), cls


def train(tok, texts, y, idx, epochs, weights, bs=16):
    torch.manual_seed(7)
    m = AutoModelForSequenceClassification.from_pretrained(BASE, num_labels=len(LABELS)).to(DEV)
    ce = torch.nn.CrossEntropyLoss(reduction="none")
    opt = torch.optim.AdamW(m.parameters(), lr=3e-5, weight_decay=0.01)
    steps = epochs * math.ceil(len(idx) / bs)
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * steps), steps)
    rng = np.random.default_rng(7)
    start, done = time.time(), 0
    m.train()
    # Batches of similar-length texts (sorted by length, then the batch order shuffled each epoch): far less padding,
    # training ±2–3× faster than random batches.
    lens = np.array([len(texts[i]) for i in idx])
    for ep in range(epochs):
        noisy = idx[np.argsort(lens + rng.uniform(0, 80, len(idx)))]
        batches = [noisy[b:b + bs] for b in range(0, len(noisy), bs)]
        for k in rng.permutation(len(batches)):
            part = batches[k]
            enc = tok([texts[i] for i in part], padding=True, truncation=True, max_length=MAXLEN, return_tensors="pt").to(DEV)
            per = ce(m(**enc).logits, torch.tensor(y[part], device=DEV))
            wt = torch.tensor(weights[part], device=DEV)
            loss = (per * wt).sum() / wt.sum()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad()
            done += 1
            if DEV == "mps" and done % 25 == 0:
                torch.mps.empty_cache()  # every batch length keeps its own cache; without this memory keeps growing
            if done % 50 == 0:
                rate = done / (time.time() - start)
                print(f"epoch {ep + 1}/{epochs} step {done}/{steps} loss {loss.item():.3f} (±{(steps - done) / rate / 60:.0f} min left)", flush=True)
    m.eval()
    return m


@torch.no_grad()
def predict(tok, m, texts, bs=128):
    out = np.zeros((len(texts), len(LABELS)), dtype=np.float32)
    order = sorted(range(len(texts)), key=lambda i: len(texts[i]))
    for b in range(0, len(order), bs):
        part = order[b:b + bs]
        enc = tok([texts[i] for i in part], padding=True, truncation=True, max_length=MAXLEN, return_tensors="pt").to(DEV)
        out[part] = m(**enc).logits.softmax(-1).float().cpu().numpy()
    return out


def report(y, p, conf, types):
    pred = p.argmax(1)
    print(f"\nAccuracy (agreement with DeepSeek): {accuracy_score(y, pred):.3f} | macro F1 {f1_score(y, pred, average='macro'):.3f}")
    for t in ("social", "online"):
        s = types == t
        print(f"  {t:7s}: accuracy {accuracy_score(y[s], pred[s]):.3f} (n={s.sum()})")
    hi = conf >= 0.8
    print(f"  confident DeepSeek labels (>=0.8): accuracy {accuracy_score(y[hi], pred[hi]):.3f} (n={hi.sum()})")
    print(classification_report(y, pred, labels=range(len(LABELS)), target_names=LABELS, digits=3, zero_division=0))
    print("Coverage: use the model's prediction when its probability >= threshold, the rest goes to DeepSeek")
    top = p.max(1)
    rows = []
    for a in (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95):
        s = top >= a
        acc = accuracy_score(y[s], pred[s]) if s.any() else 0
        rows.append({"threshold": a, "handled": round(float(s.mean()), 3), "agreement": round(float(acc), 3)})
        print(f"  threshold {a:.2f}: handled {s.mean():.1%}, agreement {acc:.1%}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--test", action="store_true", help="hold out 15%% and report on it")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--weighted", action="store_true", help="unsure labels count half, rare classes are boosted")
    args = ap.parse_args()
    texts, y, conf, types = load(args.data)
    print(f"{len(texts)} unique texts, device {DEV}", flush=True)
    tok = AutoTokenizer.from_pretrained(BASE)
    idx = np.arange(len(texts))
    info = {"weighted": args.weighted, "epochs": args.epochs, "base": BASE, "labels": LABELS, "maxlen": MAXLEN, "examples": len(texts), "trained": time.strftime("%Y-%m-%d %H:%M"), "format": "[type] text"}
    if args.test:
        a, b = train_test_split(idx, test_size=0.15, random_state=7, stratify=y)
        weights, _ = sample_weights(y, conf, a, args.weighted)
        m = train(tok, texts, y, a, args.epochs, weights)
        info["test"] = report(y[b], predict(tok, m, [texts[i] for i in b]), conf[b], types[b])
        info["examples"] = len(a)
    else:
        weights, _ = sample_weights(y, conf, idx, args.weighted)
        m = train(tok, texts, y, idx, args.epochs, weights)
    os.makedirs(args.out, exist_ok=True)
    m.save_pretrained(args.out); tok.save_pretrained(args.out)
    json.dump(info, open(os.path.join(args.out, "info.json"), "w"), indent=1)
    print(f"model saved: {args.out}", flush=True)


if __name__ == "__main__":
    main()
