"""Menguji model IndoBERT QW Signalbase terhadap data emas media (dilabel manual; emas-media.ts lalu label tangan):
satu baris {type, code, text, categoryAi, emas}. Melaporkan akurasi semua post, dan untuk post dengan keyakinan >= ambang
(LOCAL_QW_MIN, yang dilabel lokal di produksi) berapa porsinya dan seberapa tepat; juga akurasi label DeepSeek produksi.

  python uji_emas_media.py --model model-qw/ --data emas-media-label.jsonl [--ambang 0.7]
"""
import argparse
import collections
import re
import json
import os
import sys


# Aturan kata kunci (sama dengan pelabelan pbm; label media hanya satu): QW3/QW8 hanya mengganti tebakan none/QW1/QW5,
# QW5 hanya dipertahankan bila teks membahas kelanjutan perkara (audit emas 16 Nov 2026: berita kriminal biasa ditebak QW5).
QW3 = re.compile(r"\b(per)?judi(an)?\b|\bjudol\b|\bslot\b|\btogel\b|sabung ayam|\bpinjol\b|pinjaman (daring|online)|\bpenipu(an)?\b|\bscam\b|\bsiber\b|\bcyber", re.I)
QW8 = re.compile(r"\b(bbm|solar|elpiji|lpg|gas)\b[^.]{0,40}\b(ilegal|subsidi|oplos\w*|timbun\w*|penimbun\w*|selundup\w*)|\bpengoplos|\bpenimbunan\b"
                 r"|tambang\s+(emas\s+)?(ilegal|liar)|pertambangan ilegal|\btppo\b|perdagangan orang|\bkorupsi\b|\bkoruptor|\btipikor\b|\btppu\b"
                 r"|pencucian uang|mafia tanah|pidana pertanahan|labfor|\binafis\b|\bkuhp\b|\bkuhap\b", re.I)
QW5_ISI = re.compile(r"sp2hp|perkembangan (laporan|perkara|kasus)|mandek|mangkrak|berkas|dilimpahkan|\bp-?21\b|\bsp3\b|gelar perkara|"
                     r"restorative|keadilan restoratif|transparan|usut tuntas|mendesak|desak|tindak ?lanjut", re.I)


def aturan(label, teks):
    if label in ("none", "QW1", "QW5"):
        if QW8.search(teks):
            return "QW8"
        if QW3.search(teks):
            return "QW3"
    if label == "QW5" and not QW5_ISI.search(teks):
        return "none"
    return label


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--ambang", type=float, default=0.7)
    ap.add_argument("--aturan", action="store_true", help="terapkan aturan kata kunci QW3/QW8/QW5")
    args = ap.parse_args()
    info = json.load(open(os.path.join(args.model, "info.json")))
    os.environ["FINETUNE_BASE"] = info["base"]
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    sys.path.insert(0, os.path.dirname(__file__))
    import latih_qw as L

    tok = AutoTokenizer.from_pretrained(args.model)
    net = AutoModelForSequenceClassification.from_pretrained(args.model).eval()
    rows = [json.loads(l) for l in open(args.data)]
    pred = []
    with torch.no_grad():
        for b in range(0, len(rows), 32):
            part = rows[b:b + 32]
            enc = tok([L.prep(r["type"], r["text"]) for r in part], padding=True, truncation=True, max_length=info["maxlen"], return_tensors="pt")
            for p in net(**enc).logits.softmax(-1):
                k = int(p.argmax())
                pred.append((info["labels"][k], float(p[k])))
    if args.aturan:
        pred = [(aturan(lab, r["text"]), c) for (lab, c), r in zip(pred, rows)]
    gold = [r["emas"] for r in rows]
    ok = [g == p for g, (p, _) in zip(gold, pred)]
    yakin = [i for i, (_, c) in enumerate(pred) if c >= args.ambang]
    print(f"model {info.get('dilatih', '?')}: akurasi semua {sum(ok) / len(ok):.2f} ({sum(ok)}/{len(ok)})")
    print(f"  keyakinan >= {args.ambang}: {len(yakin)} post ({len(yakin) / len(rows):.0%}), akurasi {sum(ok[i] for i in yakin) / max(1, len(yakin)):.2f}")
    ai = [r.get("categoryAi") for r in rows]
    print(f"  DeepSeek produksi: akurasi {sum(a == g for a, g in zip(ai, gold)) / len(rows):.2f}")
    print("  per kategori (emas: tepat / jumlah):")
    for c in sorted(set(gold)):
        idx = [i for i, g in enumerate(gold) if g == c]
        tebak = sum(p == c for p, _ in pred)
        print(f"    {c:5s} {sum(ok[i] for i in idx):3d}/{len(idx):3d}   ditebak model {tebak}")
    salah = collections.Counter((g, p) for g, (p, _) in zip(gold, pred) if g != p)
    print("  salah terbanyak (emas -> model):", salah.most_common(6))


if __name__ == "__main__":
    main()
