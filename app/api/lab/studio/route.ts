import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openInStudio } from '@/lib/handoff';
import { safe } from '@/lib/route';

export const maxDuration = 30;

const Body = z.object({
  title: z.string().min(1).max(120),
  idea: z.string().min(1).max(5000),
  summary: z.string().max(4000).optional(),
  files: z.array(z.object({ path: z.string(), content: z.string() })).max(40),
  /** The visitor's own openidea.world API key; forwarded once, never stored. */
  apiKey: z.string().min(8).max(200),
});

/** Create an App Studio project on openidea.world from a Lab prototype. */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const { title, idea, summary, files, apiKey } = parsed.data;
  const r = await openInStudio({ title, idea, summary, files }, apiKey);
  return NextResponse.json(r, { status: r.ok ? 200 : r.status ?? 502 });
}, { spends: false });
