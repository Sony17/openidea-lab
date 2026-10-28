/**
 * Muse Spark via the Meta Model API.
 *
 * Muse Spark does the work that needs the most reasoning: read a paper or an
 * idea, decide what is reproducible, plan it, and write the first draft of the
 * code. It is called once or twice per flow. The many small fix-up calls go to
 * Fireworks (see fireworks.ts), which is faster and cheaper.
 *
 * The API is OpenAI-compatible chat completions. Check the model id in
 * META_MODEL against https://ai.meta.com before a demo; versions have moved.
 */

import { env, keyFor, notConfigured, type Result } from './env';
import type { Resource } from './openidea';

const META_API = 'https://api.meta.com/v1/chat/completions';

export interface Plan {
  summary: string;
  buildable: boolean;
  exists: string[];
  missing: string[];
  steps: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

async function chat(system: string, user: string, json = false): Promise<Result<string>> {
  const key = keyFor('meta');
  if (!key) return notConfigured('meta');

  const res = await fetch(META_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.metaModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) return { ok: false, error: `Muse Spark failed: ${res.status} ${await res.text()}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  return content ? { ok: true, value: content } : { ok: false, error: 'Muse Spark returned no content' };
}

/** Idea flow: is it buildable, what exists, what is missing, how to build it. */
export async function planIdea(idea: string, context: Resource[]): Promise<Result<Plan>> {
  const system =
    'You assess whether an idea can be built today from open research, code, datasets and hardware. ' +
    'Answer as JSON: {"summary": string, "buildable": boolean, "exists": string[], "missing": string[], "steps": string[]}. ' +
    'Be concrete. Name the resources you rely on by title.';
  const user = `Idea:\n${idea}\n\nRelevant open resources:\n${describe(context)}`;
  const r = await chat(system, user, true);
  return r.ok ? parseJson<Plan>(r.value) : r;
}

/** Idea flow: a small runnable prototype as a file list. */
export async function draftPrototype(idea: string, plan: Plan): Promise<Result<GeneratedFile[]>> {
  const system =
    'You write a minimal runnable prototype as a Vite + React + TypeScript project. ' +
    'Return JSON: {"files": [{"path": string, "content": string}]}. Include package.json, index.html, src/main.tsx, src/App.tsx. ' +
    'No external packages beyond react and react-dom. Keep it under 200 lines.';
  const user = `Idea:\n${idea}\n\nPlan:\n${plan.steps.join('\n')}`;
  const r = await chat(system, user, true);
  return r.ok ? parseJson<{ files: GeneratedFile[] }>(r.value).then(unwrapFiles) : r;
}

/** Paper flow: a notebook that reproduces one key result on small data. */
export async function draftNotebook(paperText: string, context: Resource[]): Promise<Result<GeneratedFile[]>> {
  const system =
    'You reproduce the key result of a research paper as a single Python script that runs in Pyodide ' +
    '(numpy, pandas, matplotlib, scikit-learn available; no torch, no network). Pick ONE figure or table that can be ' +
    'reproduced on a small synthetic or bundled sample, and say which. Return JSON: {"files": [{"path": "reproduce.py", "content": string}, {"path": "README.md", "content": string}]}.';
  const user = `Paper text (truncated):\n${paperText.slice(0, 60_000)}\n\nRelated open code and data:\n${describe(context)}`;
  const r = await chat(system, user, true);
  return r.ok ? parseJson<{ files: GeneratedFile[] }>(r.value).then(unwrapFiles) : r;
}

/** Photo flow: enrich a labelled parts list with datasheets and prices from search results. */
export async function enrichParts(parts: string[], context: Resource[]): Promise<Result<string>> {
  const system =
    'Given electronic or mechanical parts identified in a photo and open hardware search results, write a parts list in Markdown: ' +
    'part, likely model, datasheet link if present in the results, rough price, and what it does in this assembly.';
  const user = `Parts:\n${parts.join('\n')}\n\nSearch results:\n${describe(context)}`;
  return chat(system, user);
}

function describe(resources: Resource[]): string {
  if (!resources.length) return '(none)';
  return resources
    .slice(0, 20)
    .map((r) => `- [${r.type}] ${r.title} (${r.url})${r.description ? `: ${r.description.slice(0, 200)}` : ''}`)
    .join('\n');
}

async function parseJson<T>(text: string): Promise<Result<T>> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: 'Muse Spark returned invalid JSON' };
  }
}

function unwrapFiles(r: Result<{ files: GeneratedFile[] }>): Result<GeneratedFile[]> {
  if (!r.ok) return r;
  return Array.isArray(r.value.files) ? { ok: true, value: r.value.files } : { ok: false, error: 'No files in response' };
}
