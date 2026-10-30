/**
 * Client for the Open Idea search API at openidea.world.
 *
 * The API existed before the hackathon and is not part of the submission.
 * Lab only reads from it. Resource types mirror the platform's tabs.
 *
 * The API takes ONE `type` per request. Sending "paper,code" matches no
 * provider and returns nothing, so a multi-type search is one request per type,
 * merged here. A demo must not stall on a slow upstream either: every request
 * has a timeout, a busy (429) answer is retried once, and the last good answer
 * for a query is reused when the API is unavailable.
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
  /** Platform relevance score, when it sends one. Used to merge per-type lists. */
  score?: number;
}

export interface SearchOptions {
  types?: ResourceType[];
  limit?: number;
}

/** The platform fans out to many sources; give it time, but never hang a demo. */
const TIMEOUT_MS = 25_000;
/** Longest Retry-After we will wait in a request the user is watching. */
const MAX_RETRY_WAIT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 200;

// Per server instance. It only has to keep a repeated demo query instant and
// cover a brief upstream outage, not be shared across instances.
const cache = new Map<string, { ts: number; value: Resource[] }>();

export async function search(query: string, opts: SearchOptions = {}): Promise<Result<Resource[]>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const limit = opts.limit ?? 20;
  const types = [...new Set(opts.types ?? [])];
  const cacheKey = `${types.slice().sort().join(',')}|${limit}|${query.trim().toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { ok: true, value: hit.value };

  // No type, or one: a single request. Several: one per type, so each gets its share.
  const perType = types.length > 1 ? Math.max(5, Math.ceil(limit / types.length)) : limit;
  const calls = types.length ? types.map((t) => fetchPage(key, query, perType, t)) : [fetchPage(key, query, limit)];
  const pages = await Promise.all(calls);

  const good = pages.filter((p): p is { ok: true; value: Resource[] } => p.ok);
  if (!good.length) {
    // Upstream is down or busy: an older answer beats an empty screen.
    if (hit) return { ok: true, value: hit.value };
    const first = pages[0] as { ok: false; error: string };
    return { ok: false, error: first.error };
  }

  const value = merge(good.map((p) => p.value)).slice(0, limit);
  remember(cacheKey, value);
  return { ok: true, value };
}

async function fetchPage(key: string, query: string, limit: number, type?: ResourceType): Promise<Result<Resource[]>> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (type) params.set('type', type);
  const url = `${env.openideaUrl}/search?${params}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: 0 },
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      if (attempt === 0 && !timedOut) continue;
      return { ok: false, error: timedOut ? 'OpenIdea search took too long. Try again, or use a shorter query.' : 'Could not reach OpenIdea search. Try again in a moment.' };
    }

    if (res.status === 429 && attempt === 0) {
      await sleep(retryAfterMs(res.headers.get('Retry-After')));
      continue;
    }
    if (res.status >= 500 && attempt === 0) continue;
    if (res.status === 429) return { ok: false, error: 'OpenIdea search is busy right now. Wait a minute and try again.' };
    if (res.status === 401) return { ok: false, error: 'openidea.world did not accept the API key (OPENIDEA_API_KEY).' };
    if (!res.ok) return { ok: false, error: `OpenIdea search failed: ${res.status}` };

    const body = (await res.json().catch(() => ({}))) as { results?: unknown[]; items?: unknown[] };
    // The live API has answered under `items` with an empty `results`; accept both.
    const raw = body.results?.length ? body.results : (body.items ?? []);
    return { ok: true, value: raw.map(normalise).filter((r): r is Resource => !!r) };
  }
  return { ok: false, error: 'OpenIdea search failed. Try again.' };
}

/**
 * Merge per-type lists. When the platform sends scores, order by them so one
 * type does not fill the top just because it was requested first; otherwise
 * interleave, keeping each list's own order.
 */
export function merge(lists: Resource[][]): Resource[] {
  const seen = new Set<string>();
  const out: Resource[] = [];
  const scored = lists.every((l) => l.every((r) => typeof r.score === 'number'));
  const ordered = scored
    ? lists.flat().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : interleave(lists);
  for (const r of ordered) {
    const id = r.id || r.url;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

function interleave(lists: Resource[][]): Resource[] {
  const out: Resource[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export function retryAfterMs(header: string | null): number {
  const s = Number(header);
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, MAX_RETRY_WAIT_MS) : 1000;
}

function remember(k: string, value: Resource[]) {
  cache.delete(k);
  cache.set(k, { ts: Date.now(), value });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    score: typeof r.score === 'number' ? r.score : undefined,
  };
}
