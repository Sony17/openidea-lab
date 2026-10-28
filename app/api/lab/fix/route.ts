import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fix } from '@/lib/fireworks';

const Body = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })).min(1),
  error: z.string().min(1).max(8000),
});

/** Fireworks: patch the files so the sandbox error goes away. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const r = await fix(parsed.data.files, parsed.data.error);
  return NextResponse.json(r, { status: r.ok ? 200 : r.missing ? 424 : 502 });
}
