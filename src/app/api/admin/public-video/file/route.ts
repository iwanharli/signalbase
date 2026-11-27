import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/server/auth';
import { byteRange, publicVideo } from '@/lib/media/publicVideo';
import { videoFile } from '@/lib/server/videoFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The server's copy of a TikTok video (see videoFile), with byte ranges so the browser can seek. */
export const GET = adminRoute(async (req: Request) => {
  const value = new URL(req.url).searchParams.get('url');
  const video = value && value.length <= 2048 ? publicVideo(value) : null;
  if (!video || video.platform !== 'tiktok') return NextResponse.json({ error: 'Tautan video tidak didukung' }, { status: 400 });
  let file: string;
  try {
    file = await videoFile(video);
  } catch {
    return NextResponse.json({ error: 'Video belum dapat diambil' }, { status: 502 });
  }
  const size = (await stat(file)).size;
  const headers: Record<string, string> = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
  const range = byteRange(req.headers.get('range'), size);
  if (range === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  if (range) {
    const { start, end } = range;
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, 'Content-Length': String(size) } });
});
