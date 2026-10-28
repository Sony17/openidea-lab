/**
 * Client for the Open Idea search API at openidea.world.
 *
 * The API existed before the hackathon and is not part of the submission.
 * Lab only reads from it. Resource types mirror the platform's tabs.
 */

import { env, keyFor, notConfigured, type Result } from './env';

export type ResourceType = 'paper' | 'dataset' | 'code' | 'model' | 'hardware' | 'video';

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  description?: string;
  source?: string;
  authors?: string[];
  year?: number;
  license?: string;
}

export interface SearchOptions {
  types?: ResourceType[];
  limit?: number;
}

export async function search(query: string, opts: SearchOptions = {}): Promise<Result<Resource[]>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const params = new URLSearchParams({ q: query, limit: String(opts.limit ?? 20) });
  if (opts.types?.length) params.set('type', opts.types.join(','));

  const res = await fetch(`${env.openideaUrl}/search?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) return { ok: false, error: `OpenIdea search failed: ${res.status}` };

  const body = (await res.json()) as { results?: unknown[] };
  return { ok: true, value: (body.results ?? []).map(normalise).filter((r): r is Resource => !!r) };
}

/** The platform's result shape varies a little by provider; keep only what Lab uses. */
function normalise(raw: unknown): Resource | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.url !== 'string') return null;
  return {
    id: String(r.id ?? r.url),
    type: (r.type as ResourceType) ?? 'paper',
    title: r.title,
    url: r.url,
    description: typeof r.description === 'string' ? r.description : undefined,
    source: typeof r.source === 'string' ? r.source : undefined,
    authors: Array.isArray(r.authors) ? r.authors.map(String) : undefined,
    year: typeof r.year === 'number' ? r.year : undefined,
    license: typeof r.license === 'string' ? r.license : undefined,
  };
}
