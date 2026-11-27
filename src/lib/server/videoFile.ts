// A copy of a public TikTok video, kept on the server for when the browser cannot load TikTok's own player (its CDN
// answers "Access Denied" to some networks). Downloaded with yt-dlp (YTDLP_BIN) on first request, served from disk after.
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PublicVideo } from '@/lib/media/publicVideo';

const DIR = process.env.VIDEO_CACHE_DIR || path.join(process.cwd(), '.video-cache');
const BIN = process.env.YTDLP_BIN || 'yt-dlp';
export const VIDEO_MAX_MB = 50;
const KEEP_MS = 7 * 86_400_000;
const MAX_TOTAL_BYTES = 3 * 1024 ** 3;
const DOWNLOAD_TIMEOUT_MS = 90_000;

const inFlight = new Map<string, Promise<string>>();

function download(video: PublicVideo, file: string) {
  return new Promise<void>((resolve, reject) => {
    execFile(BIN, [
      '-q', '--no-warnings', '--no-playlist', '--no-part',
      '-f', `b[ext=mp4][filesize<${VIDEO_MAX_MB}M]/b[ext=mp4][filesize_approx<${VIDEO_MAX_MB}M]/b[ext=mp4]`,
      '--max-filesize', `${VIDEO_MAX_MB}M`,
      '-o', file, video.url,
    ], { timeout: DOWNLOAD_TIMEOUT_MS }, (error) => (error ? reject(error) : resolve()));
  });
}

/** Drops copies older than KEEP_MS, then the oldest ones while the folder is over MAX_TOTAL_BYTES. */
async function prune() {
  const files = await Promise.all((await readdir(DIR)).map(async (name) => {
    const s = await stat(path.join(DIR, name)).catch(() => null);
    return s ? { name, size: s.size, time: s.mtimeMs } : null;
  }));
  let total = 0;
  const now = Date.now();
  for (const f of files.filter((f) => f !== null).sort((a, b) => b.time - a.time)) {
    total += f.size;
    if (now - f.time > KEEP_MS || total > MAX_TOTAL_BYTES) await rm(path.join(DIR, f.name), { force: true });
  }
}

/** Path of the stored mp4 (downloaded now if missing). Throws when TikTok refuses or the video is too large. */
export async function videoFile(video: PublicVideo): Promise<string> {
  if (video.platform !== 'tiktok' || !/^\d{10,25}$/.test(video.id)) throw new Error('Unsupported video');
  const file = path.join(DIR, `${video.id}.mp4`);
  if (await stat(file).then((s) => s.size > 0, () => false)) return file;
  let work = inFlight.get(video.id);
  if (!work) {
    work = (async () => {
      await mkdir(DIR, { recursive: true });
      try {
        await download(video, file);
        if (!(await stat(file).then((s) => s.size > 0, () => false))) throw new Error('Video too large or unavailable');
      } catch (error) {
        await rm(file, { force: true });
        throw error;
      }
      void prune().catch(() => undefined);
      return file;
    })().finally(() => inFlight.delete(video.id));
    inFlight.set(video.id, work);
  }
  return work;
}
