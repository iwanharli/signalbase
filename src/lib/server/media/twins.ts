// Near-duplicate images (MediaAsset.twinGroup): every analysed image's dHash is kept in memory (two 32-bit halves,
// ~20 MB for 400k images) and a new image joins the group of the first one within NEAR_TWIN_BITS, else starts its own.
// Scanning in the worker costs ~5 ms per image instead of a table scan on every page view.
import { NEAR_TWIN_BITS } from "@/lib/mediaVisual";
import { prisma } from "../db";

let hi: Uint32Array = new Uint32Array(0), lo: Uint32Array = new Uint32Array(0);
let groups: string[] = [];
let size = 0;
let loaded = false;

const popcount = (x: number) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
const halves = (hex: string): [number, number] => [parseInt(hex.slice(0, 8), 16) >>> 0, parseInt(hex.slice(8, 16), 16) >>> 0];

function push(hex: string, group: string) {
  if (size === hi.length) {
    const cap = Math.max(1024, hi.length * 2);
    const h2 = new Uint32Array(cap), l2 = new Uint32Array(cap);
    h2.set(hi); l2.set(lo); hi = h2; lo = l2;
  }
  [hi[size], lo[size]] = halves(hex);
  groups[size] = group;
  size++;
}

async function load() {
  if (loaded) return;
  const rows = await prisma.mediaAsset.findMany({ where: { dhash: { not: null }, status: "done", placeholder: false }, select: { id: true, dhash: true, twinGroup: true }, orderBy: { analyzedAt: "asc" } });
  hi = new Uint32Array(0); lo = new Uint32Array(0); groups = []; size = 0;
  for (const r of rows) push(r.dhash!, r.twinGroup ?? r.id);
  loaded = true;
}

/** The group for a just-analysed image (its own id when nothing is near), remembered for the next ones. */
export async function twinGroupFor(id: string, hex: string) {
  await load();
  const [h, l] = halves(hex);
  let group = id;
  for (let i = 0; i < size; i++) {
    if (popcount(hi[i] ^ h) + popcount(lo[i] ^ l) <= NEAR_TWIN_BITS) { group = groups[i]; break; }
  }
  push(hex, group);
  return group;
}

/** Groups any analysed image that has none yet (images from before this column existed), oldest first. */
export async function groupUngrouped(limit = 5000) {
  await load();
  const rows = await prisma.mediaAsset.findMany({ where: { dhash: { not: null }, status: "done", twinGroup: null }, select: { id: true, dhash: true }, orderBy: { analyzedAt: "asc" }, take: limit });
  if (!rows.length) return 0;
  // These were loaded with their own id as group; rebuild so each one is matched against the ones before it.
  loaded = false; hi = new Uint32Array(0); lo = new Uint32Array(0); groups = []; size = 0;
  const known = await prisma.mediaAsset.findMany({ where: { dhash: { not: null }, status: "done", twinGroup: { not: null }, placeholder: false }, select: { dhash: true, twinGroup: true } });
  for (const k of known) push(k.dhash!, k.twinGroup!);
  loaded = true;
  for (const r of rows) {
    const group = await twinGroupFor(r.id, r.dhash!);
    await prisma.mediaAsset.update({ where: { id: r.id }, data: { twinGroup: group } });
  }
  return rows.length;
}
