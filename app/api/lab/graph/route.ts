import { NextResponse } from 'next/server';
import { z } from 'zod';
import { neighbourhood } from '@/lib/graph';

const Body = z.object({
  resources: z
    .array(z.object({ id: z.string(), type: z.string(), title: z.string(), url: z.string() }))
    .min(1)
    .max(12),
});

/** Knowledge-graph neighbourhood of the search results: what connects them. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const r = await neighbourhood(parsed.data.resources.map((x) => ({ ...x, type: x.type as never })));
  return NextResponse.json(r, { status: r.ok ? 200 : r.missing ? 424 : 502 });
}
