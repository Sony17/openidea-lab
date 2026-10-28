import { NextResponse } from 'next/server';
import { z } from 'zod';
import { draftNotebook, draftPrototype, planIdea } from '@/lib/muse';

const Resource = z.object({
  id: z.string(),
  type: z.enum(['paper', 'dataset', 'code', 'model', 'hardware', 'video']),
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
});

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idea'), idea: z.string().min(5).max(5000), context: z.array(Resource) }),
  z.object({ kind: z.literal('paper'), text: z.string().min(50), context: z.array(Resource) }),
]);

/** Muse Spark: plan an idea and draft its prototype, or draft a paper reproduction. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const body = parsed.data;

  if (body.kind === 'idea') {
    const plan = await planIdea(body.idea, body.context);
    if (!plan.ok) return NextResponse.json(plan, { status: plan.missing ? 424 : 502 });
    const files = await draftPrototype(body.idea, plan.value);
    if (!files.ok) return NextResponse.json(files, { status: 502 });
    return NextResponse.json({ ok: true, value: { plan: plan.value, files: files.value } });
  }

  const files = await draftNotebook(body.text, body.context);
  if (!files.ok) return NextResponse.json(files, { status: files.missing ? 424 : 502 });
  return NextResponse.json({ ok: true, value: { files: files.value } });
}
