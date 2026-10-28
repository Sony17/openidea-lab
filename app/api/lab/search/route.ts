import { NextResponse } from 'next/server';
import { z } from 'zod';
import { search } from '@/lib/openidea';
import { rank } from '@/lib/fireworks';
import { withUsage } from '@/lib/usage';

const Body = z.object({
  query: z.string().min(2).max(2000),
  types: z.array(z.enum(['paper', 'dataset', 'code', 'model', 'hardware', 'video'])).optional(),
  keep: z.number().int().min(1).max(20).optional(),
});

/** Search the platform, then let Fireworks keep what matters. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const { query, types, keep } = parsed.data;

  const found = await search(query, { types, limit: 20 });
  if (!found.ok) return NextResponse.json(found, { status: found.missing ? 424 : 502 });

  // Ranking is a nicety: if Fireworks is not configured, return the raw order.
  const { result: ranked, usage } = await withUsage(() => rank(query, found.value, keep ?? 6));
  return NextResponse.json({ ok: true, value: ranked.ok ? ranked.value : found.value.slice(0, keep ?? 6), usage });
}
