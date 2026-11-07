import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/server/auth';
import { metaPost } from '@/lib/media/metaPost';
import { originalMetaPost } from '@/lib/server/metaPost';
const headers = { 'Cache-Control': 'private, no-store' };
export const GET = adminRoute(async (req: Request) => {
  const value = new URL(req.url).searchParams.get('url');
  if (!value || value.length > 2048 || !metaPost(value)) return NextResponse.json({ error: 'Tautan tidak didukung' }, { status: 400, headers });
  try { return NextResponse.json({ post: await originalMetaPost(value) }, { headers }); }
  catch { return NextResponse.json({ error: 'Pratinjau belum tersedia' }, { status: 502, headers }); }
});
