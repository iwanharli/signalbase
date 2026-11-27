import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/server/auth';
import { threadsPost } from '@/lib/media/threadsPost';
import { originalThreadsPost } from '@/lib/server/threadsPost';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET = adminRoute(async (req: Request) => {
  const value = new URL(req.url).searchParams.get('url');
  if (!value || value.length > 2048 || !threadsPost(value)) return NextResponse.json({ error: 'Tautan Threads tidak valid' }, { status: 400, headers });
  // post: null = Threads will not embed it; the card then shows the stored copy (not an error, so no failed request).
  return NextResponse.json({ post: await originalThreadsPost(value) }, { headers });
});
