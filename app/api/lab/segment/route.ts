import { NextResponse } from 'next/server';
import { z } from 'zod';
import { segment } from '@/lib/baseten-sam3';
import { labelParts } from '@/lib/fireworks';
import { enrichParts } from '@/lib/muse';
import { search } from '@/lib/openidea';

const Body = z.object({
  /** data:image/...;base64,... of the whole photo. */
  image: z.string().startsWith('data:image/'),
  /** Crops of each segment, produced client-side from the masks; sent on the second call. */
  crops: z.array(z.string().startsWith('data:image/')).optional(),
});

/**
 * Photo flow in two calls. First call: SAM 3 segments the image (may answer
 * `warming`). Second call, with crops: Fireworks labels each part, OpenIdea
 * finds datasheets and listings, Muse Spark writes the parts list.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const { image, crops } = parsed.data;

  if (!crops) {
    const r = await segment(image);
    return NextResponse.json(r, { status: r.ok ? 200 : r.missing ? 424 : 502 });
  }

  const labelled = await labelParts(crops);
  if (!labelled.ok) return NextResponse.json(labelled, { status: labelled.missing ? 424 : 502 });
  const names = labelled.value.map((p) => p.name);

  const found = await search(names.slice(0, 5).join(' '), { types: ['hardware', 'code'], limit: 10 });
  const context = found.ok ? found.value : [];

  const list = await enrichParts(names, context);
  if (!list.ok) return NextResponse.json(list, { status: list.missing ? 424 : 502 });

  return NextResponse.json({ ok: true, value: { parts: labelled.value, markdown: list.value, context } });
}
