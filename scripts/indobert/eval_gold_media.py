"""Evaluates the Signalbase IndoBERT QW model against the media gold set (labelled by hand; gold-media.ts, then hand labels):
one line {type, code, text, categoryAi, gold}. Reports the accuracy over every post, and for posts at or above the confidence
threshold (LOCAL_QW_MIN, the ones labelled locally in production) their share and accuracy; also the production DeepSeek accuracy.

  python eval_gold_media.py --model model-qw/ --data gold-media-labelled.jsonl [--threshold 0.7] [--rules]
"""
import argparse
import collections
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--rules", action="store_true", help="apply the QW3/QW8/QW5 keyword rules")
    args = ap.parse_args()
    info = json.load(open(os.path.join(args.model, "info.json")))
    os.environ["FINETUNE_BASE"] = info["base"]
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    sys.path.insert(0, os.path.dirname(__file__))
    import train_qw as L

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
    if args.rules:
        pred = [(L.apply_rules(lab, r["text"]), c) for (lab, c), r in zip(pred, rows)]
    gold = [r.get("gold", r.get("emas")) for r in rows]  # "emas": gold files written before the rename
    ok = [g == p for g, (p, _) in zip(gold, pred)]
    confident = [i for i, (_, c) in enumerate(pred) if c >= args.threshold]
    print(f"model {info.get('trained') or info.get('dilatih', '?')}: accuracy over all {sum(ok) / len(ok):.2f} ({sum(ok)}/{len(ok)})")
    print(f"  confidence >= {args.threshold}: {len(confident)} posts ({len(confident) / len(rows):.0%}), accuracy {sum(ok[i] for i in confident) / max(1, len(confident)):.2f}")
    ai = [r.get("categoryAi") for r in rows]
    print(f"  production DeepSeek: accuracy {sum(a == g for a, g in zip(ai, gold)) / len(rows):.2f}")
    print("  per category (gold: right / total):")
    for c in sorted(set(gold)):
        idx = [i for i, g in enumerate(gold) if g == c]
        guessed = sum(p == c for p, _ in pred)
        print(f"    {c:5s} {sum(ok[i] for i in idx):3d}/{len(idx):3d}   guessed by the model {guessed}")
    wrong = collections.Counter((g, p) for g, (p, _) in zip(gold, pred) if g != p)
    print("  most frequent errors (gold -> model):", wrong.most_common(6))


if __name__ == "__main__":
    main()
