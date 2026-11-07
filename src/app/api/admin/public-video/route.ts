import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/server/auth';
import { publicVideo } from '@/lib/media/publicVideo';
import { originalPublicVideo } from '@/lib/server/publicVideo';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET = adminRoute(async (req: Request) => {
  const value = new URL(req.url).searchParams.get('url');
  if (!value || value.length > 2048 || !publicVideo(value)) return NextResponse.json({ error: 'Tautan video tidak didukung' }, { status: 400, headers });
  try {
    return NextResponse.json({ video: await originalPublicVideo(value) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Video asli belum dapat dimuat' }, { status: 502, headers });
  }
});
