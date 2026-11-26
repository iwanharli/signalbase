"""Issue clustering service for Signalbase (PM2 `signalbase-klaster`, 127.0.0.1:3728).

POST /cluster {"items": [{"id": "...", "text": "..."}], "minCluster": 15, "minSamples": 5, "merge": 0.96}
  -> {"clusters": [{"ids": [...], "keywords": [...], "representative": [...]}], "embedded": n, "cached": n, "ms": n}

Posts are cleaned (links and mentions dropped), identical texts become one point, embedded with multilingual-e5-small
(ONNX, mean pooling, unit length) and clustered with HDBSCAN (leaf); clusters whose centres are nearly the same (cosine
>= merge) are joined, since one issue often splits by language or angle. Validated on SLOG POLRI 19-25 Nov 2026: see the
vault note "Uji klaster isu SLOG POLRI". Embeddings are cached per text, so an hourly run only embeds new posts.

Env: KLASTER_MODEL_DIR (model.onnx + tokenizer.json), KLASTER_PORT (3728), KLASTER_THREADS (2), KLASTER_CACHE (200000).
"""
import hashlib, json, os, re, threading, time
from collections import OrderedDict, defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import onnxruntime as ort
from sklearn.cluster import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer
from tokenizers import Tokenizer

MODEL_DIR = os.environ.get("KLASTER_MODEL_DIR", "/opt/sb-klaster/models/e5")
PORT = int(os.environ.get("KLASTER_PORT", "3728"))
THREADS = int(os.environ.get("KLASTER_THREADS", "2"))
CACHE_MAX = int(os.environ.get("KLASTER_CACHE", "200000"))
MAX_TOKENS = 256  # posts are short; longer ones keep their first 256 tokens
BATCH = 32
MIN_TEXT = 25

opts = ort.SessionOptions()
opts.intra_op_num_threads = THREADS
opts.inter_op_num_threads = 1
SESSION = ort.InferenceSession(os.path.join(MODEL_DIR, "model.onnx"), opts, providers=["CPUExecutionProvider"])
INPUTS = {i.name for i in SESSION.get_inputs()}
TOK = Tokenizer.from_file(os.path.join(MODEL_DIR, "tokenizer.json"))
TOK.enable_truncation(MAX_TOKENS)
TOK.enable_padding(pad_id=TOK.token_to_id("<pad>") or 1, pad_token="<pad>")
LOCK = threading.Lock()  # one computation at a time: CPU and memory stay bounded
CACHE: "OrderedDict[str, np.ndarray]" = OrderedDict()

STOP = set("""yang dan di ke dari ini itu untuk dengan pada adalah juga tidak ada akan sudah bisa saja atau karena dalam
oleh kami kita saya kamu dia mereka nya lagi aja ga gak nggak yg dgn utk tdk sdh jd jadi kalau kalo kok sih deh dong lah pun
apa siapa kenapa bagaimana mau masih harus bukan para semua satu dua orang hal sama seperti lebih banyak hanya tapi tetapi
namun agar biar buat sangat amp rt via https http co www com the and of to in is for on you this that tweet asli""".split())


def clean(text: str) -> str:
    t = re.sub(r"https?://\S+", " ", text or "")
    t = re.sub(r"(^|\s)@\w+", " ", t)  # mentions: replies start with them
    t = t.replace("&amp;", "&")
    return re.sub(r"\s+", " ", t).strip()


def embed(texts: list[str]) -> tuple[np.ndarray, int]:
    """Unit vectors for the texts, from the cache where possible. Returns (vectors, newly embedded)."""
    keys = [hashlib.sha1(t.encode()).hexdigest() for t in texts]
    todo = [i for i, k in enumerate(keys) if k not in CACHE]
    for s in range(0, len(todo), BATCH):
        idx = todo[s:s + BATCH]
        enc = TOK.encode_batch([f"query: {texts[i]}" for i in idx])  # e5: "query: " for symmetric similarity
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in INPUTS:
            feed["token_type_ids"] = np.zeros_like(ids)
        hidden = SESSION.run(None, feed)[0]  # (batch, tokens, 384)
        m = mask[..., None].astype(np.float32)
        vec = (hidden * m).sum(1) / np.maximum(m.sum(1), 1e-9)  # mean pooling over real tokens
        vec /= np.maximum(np.linalg.norm(vec, axis=1, keepdims=True), 1e-12)
        for i, v in zip(idx, vec):
            CACHE[keys[i]] = v.astype(np.float32)
    for k in keys:
        CACHE.move_to_end(k)
    while len(CACHE) > CACHE_MAX:
        CACHE.popitem(last=False)
    return np.stack([CACHE[k] for k in keys]) if keys else np.zeros((0, 384), np.float32), len(todo)


def keywords_for(docs: list[list[str]], top: int = 8) -> list[list[str]]:
    """Class-based TF-IDF: the words that set each cluster apart from the others."""
    if not docs:
        return []
    vec = CountVectorizer(token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]{2,}\b", stop_words=list(STOP), ngram_range=(1, 2), min_df=2)
    try:
        counts = vec.fit_transform([" ".join(d) for d in docs]).toarray().astype(float)
    except ValueError:  # no term left
        return [[] for _ in docs]
    tf = counts / np.maximum(counts.sum(1, keepdims=True), 1)
    idf = np.log(1 + len(docs) / np.maximum((counts > 0).sum(0), 1))
    terms = vec.get_feature_names_out()
    return [[str(terms[j]) for j in np.argsort(-(row * idf))[:top] if row[j] > 0] for row in tf]


def cluster(items: list[dict], min_cluster: int, min_samples: int, merge: float) -> dict:
    started = time.time()
    groups: dict[str, list[str]] = defaultdict(list)  # cleaned text -> post ids (identical texts are one point)
    for it in items:
        c = clean(str(it.get("text") or ""))
        if len(c) >= MIN_TEXT:
            groups[c.lower()].append(str(it["id"]))
    texts = list(groups)
    if len(texts) < max(min_cluster * 2, 10):
        return {"clusters": [], "embedded": 0, "cached": len(CACHE), "ms": int((time.time() - started) * 1000)}
    emb, new = embed(texts)
    labels = HDBSCAN(min_cluster_size=min_cluster, min_samples=min_samples, cluster_selection_method="leaf").fit_predict(emb)

    # Join clusters whose centres nearly coincide (same issue, other language or angle), largest first.
    ids = sorted({int(l) for l in labels if l >= 0}, key=lambda l: -int((labels == l).sum()))
    centre = {l: emb[labels == l].mean(0) for l in ids}
    for l in ids:
        centre[l] /= max(float(np.linalg.norm(centre[l])), 1e-12)
    parent = {l: l for l in ids}
    for a_i, a in enumerate(ids):
        for b in ids[:a_i]:
            if parent[b] == b and float(centre[a] @ centre[b]) >= merge:
                parent[a] = b
                break
    members: dict[int, list[int]] = defaultdict(list)
    for j, l in enumerate(labels):
        if l >= 0:
            root = int(l)
            while parent[root] != root:
                root = parent[root]
            members[root].append(j)

    roots = list(members)
    words = keywords_for([[texts[j] for j in members[r]] for r in roots])
    out = []
    for r, kw in zip(roots, words):
        idx = members[r]
        c = emb[idx].mean(0)
        rep = sorted(idx, key=lambda j: -float(emb[j] @ c))[:8]  # closest to the centre: the clearest examples
        out.append({
            "ids": [pid for j in idx for pid in groups[texts[j]]],
            "keywords": kw,
            "representative": [groups[texts[j]][0] for j in rep],
        })
    out.sort(key=lambda o: -len(o["ids"]))
    return {"clusters": out, "embedded": new, "cached": len(CACHE), "ms": int((time.time() - started) * 1000)}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200 if self.path == "/health" else 404, {"ok": True, "cached": len(CACHE)} if self.path == "/health" else {"error": "not found"})

    def do_POST(self):
        if self.path != "/cluster":
            return self._send(404, {"error": "not found"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            items = body.get("items") or []
            with LOCK:
                result = cluster(items, int(body.get("minCluster") or 15), int(body.get("minSamples") or 5), float(body.get("merge") or 0.96))
            self._send(200, result)
        except Exception as e:  # noqa: BLE001 - report to the worker, keep serving
            self._send(500, {"error": str(e)[:300]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
