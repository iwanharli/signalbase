import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/server/auth';
import { threadsPost } from '@/lib/media/threadsPost';
import { originalThreadsPost } from '@/lib/server/threadsPost';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET = adminRoute(async (req: Request) => {
  const value = new URL(req.url).searchParams.get('url');
  if (!value || value.length > 2048 || !threadsPost(value)) return NextResponse.json({ error: 'Tautan Threads tidak valid' }, { status: 400, headers });
  try {
    return NextResponse.json({ post: await originalThreadsPost(value) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Post asli Threads belum dapat dimuat' }, { status: 502, headers });
  }
});
