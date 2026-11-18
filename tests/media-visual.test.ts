import assert from "node:assert/strict";
import { test } from "node:test";
import {
  workerProblem,
  formatVisualCursor, hashDistance, KIND_PRIORITY, NEAR_TWIN_BITS, parseVisualCursor, parseVisualDays, retryDelayMs, VISUAL_TAGS, xPostImages, youtubeThumbnail,
} from "../src/lib/mediaVisual";

test("YouTube thumbnail from every video URL form, none without an id", () => {
  const thumb = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
  for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?t=3", "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ"]) assert.equal(youtubeThumbnail(url), thumb, url);
  assert.equal(youtubeThumbnail("https://www.youtube.com/@channel"), null);
  assert.equal(youtubeThumbnail("https://youtu.be/dQw4w9WgXcQextra"), null);
  assert.equal(youtubeThumbnail(null), null);
});

test("X post images: photos and video posters, at most four", () => {
  const photo = (n: number) => ({ kind: "image" as const, url: `https://pbs.twimg.com/media/${n}.jpg`, poster: null });
  assert.deepEqual(xPostImages([photo(1), { kind: "video", url: "https://video.twimg.com/v.mp4", poster: "https://pbs.twimg.com/p.jpg" }]), ["https://pbs.twimg.com/media/1.jpg", "https://pbs.twimg.com/p.jpg"]);
  assert.deepEqual(xPostImages([{ kind: "video", url: "https://video.twimg.com/v.mp4", poster: null }]), []);
  assert.equal(xPostImages([1, 2, 3, 4, 5].map(photo)).length, 4);
});

test("retry pauses grow and stop after the last attempt", () => {
  assert.deepEqual([1, 2, 3, 4].map(retryDelayMs), [5 * 60_000, 30 * 60_000, 2 * 3_600_000, null]);
  assert.equal(retryDelayMs(0), null);
});

test("hash distance counts differing bits of 64-bit hex hashes", () => {
  assert.equal(hashDistance("0000000000000000", "0000000000000000"), 0);
  assert.equal(hashDistance("0000000000000000", "ffffffffffffffff"), 64);
  assert.equal(hashDistance("1379184662f37e98", "1379184662f37e99"), 1);
  assert.equal(hashDistance("8000000000000000", "0000000000000001"), 2);
  assert.ok(hashDistance("1379184662f37e98", "1379184662f37e98") <= NEAR_TWIN_BITS);
});

test("paging cursor round-trips and rejects anything else", () => {
  const c = { ts: "2026-11-18T10:20:30.123456", id: "3f1c2a8e-5b6d-4f00-9a1b-2c3d4e5f6a7b" };
  assert.deepEqual(parseVisualCursor(formatVisualCursor(c)), c);
  for (const bad of [null, "", "x~y", "2026-11-18 10:20:30~id", "2026-11-18T10:20:30.1~a'; drop table x"]) assert.equal(parseVisualCursor(bad), null, String(bad));
});

test("periods, tags and analysis order", () => {
  assert.equal(parseVisualDays("7"), 7);
  assert.equal(parseVisualDays("999"), 3);
  assert.equal(parseVisualDays(null), 3);
  for (const t of ["senjata", "darah_luka", "jenazah", "kericuhan", "aparat", "kebakaran", "bencana"]) assert.ok(t in VISUAL_TAGS, t);
  assert.ok(KIND_PRIORITY.x_photo < KIND_PRIORITY.news && KIND_PRIORITY.youtube < KIND_PRIORITY.news);
});

test("key text keeps the message of an image and drops app chrome, stamps, small print and caption repeats", async () => {
  const { keyText } = await import("../src/lib/mediaVisual");
  const L = (t: string, h = 0.05) => ({ t, h, cy: 0.5 });
  // A screenshot of a reply thread: only the reply text is the message.
  const thread = keyText([L("Lihat 2 balasan lainnya"), L("bibmaul 3 hari"), L("25.1rb · 1.1rb · 513"), L("3 hari"), L("Balas"),
    L("Lo tau betapa bahagianya anak yang dapet nasi dari ompreng itu di daerah?"), L("@kandaabahlul · 4 jam")], null);
  assert.equal(thread.text, "Lo tau betapa bahagianya anak yang dapet nasi dari ompreng itu di daerah?");
  // A poster headline stays; a camera stamp and tiny background text go.
  const poster = keyText([L("KURSI WAPRES MAKIN PANAS!", 0.08), L("18 Nov 2026 09.23.51 99 Jalan Doktor Sitanala"), L("CAUTION CAUTION CAUTION", 0.01)], null);
  assert.equal(poster.text, "KURSI WAPRES MAKIN PANAS!");
  // A photo whose text only repeats the post's caption carries nothing new.
  const caption = "BAPETEN berkomitmen untuk terus mendukung penyusunan regulasi yang selaras dan jelas";
  assert.deepEqual(keyText([L("BAPETEN berkomitmen untuk terus mendukung"), L("penyusunan regulasi yang selaras")], caption), { text: "", words: 0 });
  // Fewer than four meaningful words left: no text.
  assert.deepEqual(keyText([L("bapeten.go.id"), L("Jakar PLN")], null), { text: "", words: 0 });
});

test("a post's images: text lines merged once, tags merged with their best score", async () => {
  const { mergeKeyText, mergeTags, parseVisualView } = await import("../src/lib/mediaVisual");
  assert.equal(mergeKeyText(["Tim 5 Kab. Gunung Mas\nPolres Kab Gunung Mas", "tim 5  kab. gunung mas\nKodim 1018", ""]), "Tim 5 Kab. Gunung Mas\nPolres Kab Gunung Mas\nKodim 1018");
  assert.deepEqual(mergeTags([[{ tag: "rapat", score: 0.4 }], [{ tag: "aparat", score: 0.7 }, { tag: "rapat", score: 0.6 }]]), [{ tag: "aparat", score: 0.7 }, { tag: "rapat", score: 0.6 }]);
  assert.equal(parseVisualView("image"), "image");
  assert.equal(parseVisualView(null), "post");
});

test("OCR lines are read back as headlines and joined sentences", async () => {
  const { reflowOcr } = await import("../src/lib/mediaVisual");
  assert.deepEqual(reflowOcr("KURSI WAPRES MAKIN PANAS!\n'PASUKAN' DAPUR MBG\nPemerintah menjaga kesiapan tim gabungan,\nperalatan, dan logistik agar\nsiap siaga.\nSumber: istimewa"), [
    { kind: "headline", text: "KURSI WAPRES MAKIN PANAS! 'PASUKAN' DAPUR MBG" },
    { kind: "text", text: "Pemerintah menjaga kesiapan tim gabungan, peralatan, dan logistik agar siap siaga." },
    { kind: "text", text: "Sumber: istimewa" },
  ]);
  assert.deepEqual(reflowOcr(""), []);
});

test("calls to action need an action word and a date, time or place", async () => {
  const { detectActionCall } = await import("../src/lib/mediaVisual");
  const poster = detectActionCall("AKSI DAMAI BELA RAKYAT\nKamis, 20 November 2026\nPukul 09.00 WIB\nTitik kumpul: Bundaran HI");
  assert.ok(poster);
  assert.equal(poster.time, "Pukul 09.00 WIB");
  assert.match(poster.date ?? "", /20 November/);
  assert.match(poster.place ?? "", /titik kumpul/i);
  assert.ok(detectActionCall("Ayo turun ke jalan 25/11 di depan gedung DPR"));
  assert.equal(detectActionCall("Polisi amankan aksi di gedung DPRD"), null); // a report, no date or time
  assert.equal(detectActionCall("Rapat koordinasi Kamis 20 November pukul 09.00"), null); // no action word
  assert.equal(detectActionCall(""), null);
});

test("narrative key tolerates case, accents and punctuation, ignores short texts", async () => {
  const { narrativeKey } = await import("../src/lib/mediaVisual");
  const a = narrativeKey("RATUSAN PERUSAHAAN DISELIDIKI, PRABOWO TEGAS TANGANI KARHUTLA! Permintaan maaf Prabowo kepada Malaysia");
  assert.equal(a, narrativeKey("Ratusan perusahaan diselidiki — Prabowo tegas tangani karhutla. Permintaan maaf prabowo kepada malaysia dan singapura"));
  assert.equal(narrativeKey("TERBUKTI SADAP PRESIDEN PRABOWO"), null);
});

test("numeric claims are lines with a number and a unit", async () => {
  const { numericClaims } = await import("../src/lib/mediaVisual");
  assert.deepEqual(numericClaims("ANGKA PERUSAHAAN TERKAIT\n104 perusahaan diselidiki oleh kepolisian\nNaik 0,35% ke 5.323\nBantuan Rp 950.000 per keluarga\nKamis 20 November\nSejak 2019"),
    ["104 perusahaan diselidiki oleh kepolisian", "Naik 0,35% ke 5.323", "Bantuan Rp 950.000 per keluarga"]);
});

test("reports about a rally are not calls to action (production false positive)", async () => {
  const { detectActionCall } = await import("../src/lib/mediaVisual");
  assert.equal(detectActionCall("Kapolri Tinjau Kericuhan Demo / di Yogyakarta / Polri Dalami Motif Aksi Massa / jam 18.00 WIB di lapangan"), null);
  assert.equal(detectActionCall("Demo buruh di depan gedung DPR pukul 10.00 berakhir ricuh, 12 orang diamankan"), null);
  assert.ok(detectActionCall("AYO HADIRI AKSI BELA PETANI\nSabtu 22 November\nPukul 08.00 WIB"));
  assert.ok(detectActionCall("Aksi akbar mahasiswa\nRabu, 26 November 2026 · pukul 13.00 WIB\nTitik kumpul Monas"));
});

test("words OCR ran together are split into common words, real words and names kept", async () => {
  const { splitJoinedText } = await import("../src/lib/mediaVisual");
  const words = new Map(Object.entries({ con: 300, ti: 400, nu: 300, ed: 200, de: 900, live: 800, ri: 3000, es: 500, resmi: 6007, mundur: 4237, dari: 90000, wapres: 6218, gibran: 20000, pks: 3000, membacakan: 19, hak: 2500,
    menyatakan: 940, pendapat: 604, terhadap: 3807, sadap: 650, prabowo: 50000, pengangguran: 717, yogyakarta: 3000, di: 100000, dpr: 5000 }));
  const total = [...words.values()].reduce((a, b) => a + b, 0);
  assert.equal(splitJoinedText("GIBRAN RESMIMUNDUR DARIWAPRES", words, total), "GIBRAN RESMI MUNDUR DARI WAPRES");
  assert.equal(splitJoinedText("Sadap Prabowo SadapPrabowo", words, total), "Sadap Prabowo Sadap Prabowo");
  assert.equal(splitJoinedText("MENYATAKANPENDAPAT / TERHADAPGIBRANDIDPR", words, total), "MENYATAKAN PENDAPAT / TERHADAP GIBRAN DI DPR");
  assert.equal(splitJoinedText("pengangguran Yogyakarta Sitanala", words, total), "pengangguran Yogyakarta Sitanala"); // words, or no common split
  assert.equal(splitJoinedText("CONTINUED US FUEL DELIVERIES", words, total), "CONTINUED US FUEL DELIVERIES"); // English stays whole
  words.set("viral", 4000); words.set("presiden", 30000);
  assert.equal(splitJoinedText("VIRALPRESIDENRIPRABOWO", words, total), "VIRAL PRESIDEN RI PRABOWO");
});

test("workerProblem: berhenti bila tanpa detak 15 menit, mati bila layanan tidak menjawab", () => {
  const now = Date.parse("2026-11-19T10:00:00Z");
  const w = (min: number, serviceOk = true) => ({ heartbeatAt: new Date(now - min * 60_000).toISOString(), serviceOk, lastError: null, lastTick: null });
  assert.equal(workerProblem(null, now), null);
  assert.equal(workerProblem(w(4), now), null);
  assert.match(workerProblem(w(16), now)!, /berhenti/);
  assert.match(workerProblem(w(2, false), now)!, /tidak menjawab/);
});
