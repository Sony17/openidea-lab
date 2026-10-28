/**
 * SAM 3 on Baseten.
 *
 * The deployment is in baseten/sam3/ (Truss). This client sends an image and
 * gets back one mask per detected part, each with a bounding box so the UI can
 * crop it for labelling. Cold starts on a scale-to-zero GPU run 30–90 s, so the
 * caller should show a "warming up" state on the first 503/timeout instead of
 * an error.
 */

import { env, keyFor, notConfigured, type Result } from './env';

export interface Segment {
  index: number;
  /** [x, y, width, height] in pixels of the original image. */
  bbox: [number, number, number, number];
  /** PNG data URL of the binary mask, same size as the original image. */
  mask: string;
  score: number;
}

export type SegmentResult = { warming: true } | { warming: false; segments: Segment[] };

export async function segment(imageDataUrl: string, prompt?: string): Promise<Result<SegmentResult>> {
  const key = keyFor('baseten');
  if (!key || !env.basetenSam3ModelId) return notConfigured('baseten');

  const res = await fetch(`https://model-${env.basetenSam3ModelId}.api.baseten.co/production/predict`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, prompt: prompt ?? 'every distinct component' }),
  });

  // Baseten answers 503 while a scale-to-zero replica is starting.
  if (res.status === 503) return { ok: true, value: { warming: true } };
  if (!res.ok) return { ok: false, error: `SAM 3 failed: ${res.status} ${await res.text()}` };

  const body = (await res.json()) as { segments?: Segment[] };
  return { ok: true, value: { warming: false, segments: body.segments ?? [] } };
}
