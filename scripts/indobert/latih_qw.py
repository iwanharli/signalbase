"""Fine-tune IndoBERT untuk kategori 8 Quick Win Polri (+ "none") dari label DeepSeek classifier KIPERMAS (key "Polisi").
Satu model untuk media sosial dan berita online; jenis media ditulis di awal teks ("[social] ..." / "[online] ...").

  python latih_qw.py --data label.jsonl --out model/ --uji     # 85% latih, 15% uji (teks unik tidak bocor), simpan model
  python latih_qw.py --data label.jsonl --out model/           # latih pada semua label

label.jsonl: satu baris {type, code, category, confidence, text}, diekspor dari tabel Classification + database sumber.
Jalan di GPU Apple (mps), CUDA, atau CPU. Hasil uji juga menulis tabel "cakupan": bila hanya prediksi dengan peluang
>= ambang yang dipakai (sisanya tetap ke DeepSeek), berapa porsi post yang tertangani model dan seberapa cocok dengan DeepSeek.
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


def prep(type_, text):
    t = " ".join(text.split())[:1200]
    if TWEET:  # praproses IndoBERTweet: huruf kecil, mention -> @USER, tautan -> HTTPURL
        t = re.sub(r"https?://\S+|www\.\S+", "HTTPURL", re.sub(r"@\w+", "@USER", t)).lower()
    return f"[{type_}] " + t


def load(path):
    seen, texts, y, conf, types = set(), [], [], [], []
    for line in open(path):
        r = json.loads(line)
        if r["category"] not in LABELS:
            continue
        key = " ".join(r["text"].lower().split())
        if key in seen:  # teks sama (repost/salin) cukup sekali, supaya data uji tidak bocor dari data latih
            continue
        seen.add(key)
        texts.append(prep(r["type"], r["text"]))
        y.append(LABELS.index(r["category"]))
        conf.append(r.get("confidence") or 0.0)
        types.append(r["type"])
    return texts, np.array(y), np.array(conf), np.array(types)


def sample_weights(y, conf, idx, weak):
    """Bobot per contoh: label DeepSeek yang ragu (keyakinan < 0,6) setengah; kelas jarang sedikit diperbesar (akar invers frekuensi)."""
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
    # Batch berisi teks sepanjang mirip (diurutkan menurut panjang, lalu urutan batch diacak tiap epoch): padding jauh
    # lebih sedikit, latihan ±2–3 kali lebih cepat dibanding batch acak.
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
                torch.mps.empty_cache()  # tiap panjang batch berbeda menyimpan cache sendiri; tanpa ini memori naik terus
            if done % 50 == 0:
                rate = done / (time.time() - start)
                print(f"epoch {ep + 1}/{epochs} langkah {done}/{steps} loss {loss.item():.3f} (sisa ±{(steps - done) / rate / 60:.0f} menit)", flush=True)
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
    print(f"\nAkurasi (cocok dengan DeepSeek): {accuracy_score(y, pred):.3f} | macro F1 {f1_score(y, pred, average='macro'):.3f}")
    for t in ("social", "online"):
        s = types == t
        print(f"  {t:7s}: akurasi {accuracy_score(y[s], pred[s]):.3f} (n={s.sum()})")
    hi = conf >= 0.8
    print(f"  label DeepSeek yakin (>=0.8): akurasi {accuracy_score(y[hi], pred[hi]):.3f} (n={hi.sum()})")
    print(classification_report(y, pred, labels=range(len(LABELS)), target_names=LABELS, digits=3, zero_division=0))
    print("Cakupan: pakai prediksi model bila peluang >= ambang, sisanya ke DeepSeek")
    top = p.max(1)
    rows = []
    for a in (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95):
        s = top >= a
        acc = accuracy_score(y[s], pred[s]) if s.any() else 0
        rows.append({"ambang": a, "tertangani": round(float(s.mean()), 3), "cocok": round(float(acc), 3)})
        print(f"  ambang {a:.2f}: tertangani {s.mean():.1%}, cocok {acc:.1%}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--uji", action="store_true")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--bobot", action="store_true", help="label ragu setengah bobot, kelas jarang diperbesar")
    args = ap.parse_args()
    texts, y, conf, types = load(args.data)
    print(f"{len(texts)} teks unik, perangkat {DEV}", flush=True)
    tok = AutoTokenizer.from_pretrained(BASE)
    idx = np.arange(len(texts))
    info = {"bobot": args.bobot, "epochs": args.epochs, "base": BASE, "labels": LABELS, "maxlen": MAXLEN, "contoh": len(texts), "dilatih": time.strftime("%Y-%m-%d %H:%M"), "format": "[type] teks"}
    if args.uji:
        a, b = train_test_split(idx, test_size=0.15, random_state=7, stratify=y)
        weights, _ = sample_weights(y, conf, a, args.bobot)
        m = train(tok, texts, y, a, args.epochs, weights)
        info["uji"] = report(y[b], predict(tok, m, [texts[i] for i in b]), conf[b], types[b])
        info["contoh"] = len(a)
    else:
        weights, _ = sample_weights(y, conf, idx, args.bobot)
        m = train(tok, texts, y, idx, args.epochs, weights)
    os.makedirs(args.out, exist_ok=True)
    m.save_pretrained(args.out); tok.save_pretrained(args.out)
    json.dump(info, open(os.path.join(args.out, "info.json"), "w"), indent=1)
    print(f"model disimpan: {args.out}", flush=True)


if __name__ == "__main__":
    main()
