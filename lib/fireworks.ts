/**
 * Fireworks: the fast, cheap calls.
 *
 * Three jobs, all of which run often or on bulk input:
 *   - rank: trim 20 search results to the handful Muse Spark should read
 *   - fix: patch the error the sandbox just reported (runs several times per build)
 *   - label: name each SAM 3 segment with a vision model, as structured JSON
 *
 * OpenAI-compatible endpoint.
 */

import { env, keyFor, notConfigured, type Result } from './env';
import type { GeneratedFile } from './muse';
import type { Resource } from './openidea';

const FIREWORKS_API = 'https://api.fireworks.ai/inference/v1/chat/completions';

type Content = string | { type: 'text'; text: string }[] | { type: 'image_url'; image_url: { url: string } }[];

async function chat(model: string, messages: { role: string; content: Content }[], json = false): Promise<Result<string>> {
  const key = keyFor('fireworks');
  if (!key) return notConfigured('fireworks');

  const res = await fetch(FIREWORKS_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.2, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!res.ok) return { ok: false, error: `Fireworks failed: ${res.status} ${await res.text()}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  return content ? { ok: true, value: content } : { ok: false, error: 'Fireworks returned no content' };
}

/** Keep the results that matter for this input. Returns ids in rank order. */
export async function rank(input: string, results: Resource[], keep = 6): Promise<Result<Resource[]>> {
  if (results.length <= keep) return { ok: true, value: results };
  const listing = results.map((r, i) => `${i}. [${r.type}] ${r.title}: ${r.description?.slice(0, 160) ?? ''}`).join('\n');
  const r = await chat(
    env.fireworksCodeModel,
    [
      { role: 'system', content: `Pick the ${keep} results most useful for building the input. Return JSON {"keep": number[]} with indices in rank order.` },
      { role: 'user', content: `Input:\n${input}\n\nResults:\n${listing}` },
    ],
    true,
  );
  if (!r.ok) return r;
  try {
    const { keep: idx } = JSON.parse(r.value) as { keep: number[] };
    return { ok: true, value: idx.map((i) => results[i]).filter(Boolean).slice(0, keep) };
  } catch {
    return { ok: true, value: results.slice(0, keep) };
  }
}

/** Patch the files so the reported error goes away. Returns the full file list. */
export async function fix(files: GeneratedFile[], error: string): Promise<Result<GeneratedFile[]>> {
  const r = await chat(
    env.fireworksCodeModel,
    [
      {
        role: 'system',
        content:
          'You fix a small project so it runs. Change as little as possible. Return JSON {"files": [{"path": string, "content": string}]} with EVERY file, changed or not.',
      },
      { role: 'user', content: `Error:\n${error}\n\nFiles:\n${files.map((f) => `--- ${f.path}\n${f.content}`).join('\n\n')}` },
    ],
    true,
  );
  if (!r.ok) return r;
  try {
    const { files: out } = JSON.parse(r.value) as { files: GeneratedFile[] };
    return Array.isArray(out) && out.length ? { ok: true, value: out } : { ok: false, error: 'Fix returned no files' };
  } catch {
    return { ok: false, error: 'Fix returned invalid JSON' };
  }
}

export interface LabelledPart {
  index: number;
  name: string;
  confidence: number;
}

/** Name each segmented part from a crop (data URL). */
export async function labelParts(crops: string[]): Promise<Result<LabelledPart[]>> {
  const r = await chat(
    env.fireworksVisionModel,
    [
      {
        role: 'system',
        content:
          'Each image is one part cut out of a photo of hardware. Name it (e.g. "ESP32 module", "M3 hex bolt", "16x2 LCD"). ' +
          'Return JSON {"parts": [{"index": number, "name": string, "confidence": number}]}.',
      },
      {
        role: 'user',
        content: crops.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      },
    ],
    true,
  );
  if (!r.ok) return r;
  try {
    const { parts } = JSON.parse(r.value) as { parts: LabelledPart[] };
    return { ok: true, value: parts };
  } catch {
    return { ok: false, error: 'Labeller returned invalid JSON' };
  }
}
