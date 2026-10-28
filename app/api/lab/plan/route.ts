import { NextResponse } from 'next/server';
import { z } from 'zod';
import { draftNotebook, draftPrototype, planIdea } from '@/lib/muse';
import { withUsage } from '@/lib/usage';

const Resource = z.object({
  id: z.string(),
  type: z.enum(['paper', 'dataset', 'code', 'model', 'hardware', 'video']),
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
});

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idea'), idea: z.string().min(5).max(5000), context: z.array(Resource), graph: z.string().max(4000).optional() }),
  z.object({ kind: z.literal('paper'), text: z.string().min(50), context: z.array(Resource) }),
]);

/** Muse Spark: plan an idea and draft its prototype, or draft a paper reproduction. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const body = parsed.data;

  const { result, usage } = await withUsage(async () => {
    if (body.kind === 'idea') {
      const plan = await planIdea(body.idea, body.context, body.graph);
      if (!plan.ok) return { out: plan, status: plan.missing ? 424 : 502 };
      const files = await draftPrototype(body.idea, plan.value);
      if (!files.ok) return { out: files, status: 502 };
      return { out: { ok: true as const, value: { plan: plan.value, files: files.value } }, status: 200 };
    }
    const files = await draftNotebook(body.text, body.context);
    if (!files.ok) return { out: files, status: files.missing ? 424 : 502 };
    return { out: { ok: true as const, value: { files: files.value } }, status: 200 };
  });

  return NextResponse.json({ ...result.out, usage }, { status: result.status });
}
