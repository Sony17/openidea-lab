import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merge, retryAfterMs, search, type Resource } from '@/lib/openidea';

const r = (id: string, type: Resource['type'], score?: number): Resource => ({ id, type, title: id, url: `https://x/${id}`, score });

function respond(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('merge', () => {
  it('orders by score across types when every result has one', () => {
    const out = merge([[r('p1', 'paper', 0.4), r('p2', 'paper', 0.1)], [r('c1', 'code', 0.9)]]);
    expect(out.map((x) => x.id)).toEqual(['c1', 'p1', 'p2']);
  });

  it('interleaves when scores are missing, so the first type does not fill the top', () => {
    const out = merge([[r('p1', 'paper'), r('p2', 'paper')], [r('c1', 'code')]]);
    expect(out.map((x) => x.id)).toEqual(['p1', 'c1', 'p2']);
  });

  it('drops duplicates', () => {
    expect(merge([[r('a', 'paper')], [r('a', 'paper')]])).toHaveLength(1);
  });
});

describe('retryAfterMs', () => {
  it('caps a long Retry-After so a watched request never waits long', () => {
    expect(retryAfterMs('60')).toBe(5000);
    expect(retryAfterMs('2')).toBe(2000);
    expect(retryAfterMs(null)).toBe(1000);
  });
});

describe('search', () => {
  beforeEach(() => {
    vi.stubEnv('OPENIDEA_API_KEY', 'oi_test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends one request per type instead of a comma-joined type', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      const type = new URL(url).searchParams.get('type');
      return respond(200, { results: [{ id: `${type}-1`, type, title: 't', url: `https://x/${type}` }] });
    }));
    const out = await search('per type query', { types: ['hardware', 'code'], limit: 10 });
    expect(out.ok && out.value.map((x) => x.type).sort()).toEqual(['code', 'hardware']);
    expect(urls.map((u) => new URL(u).searchParams.get('type')).sort()).toEqual(['code', 'hardware']);
    expect(urls.every((u) => !u.includes('%2C'))).toBe(true);
  });

  it('reads results the API returns under items', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { results: [], items: [{ id: 'a', type: 'paper', title: 'A', url: 'https://x/a' }] })));
    const out = await search('items query');
    expect(out.ok && out.value[0].id).toBe('a');
  });

  it('retries once after a 429, then succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(respond(429, {}, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(respond(200, { results: [{ id: 'a', type: 'paper', title: 'A', url: 'https://x/a' }] }));
    vi.stubGlobal('fetch', f);
    const out = await search('busy query');
    expect(out.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('says plainly when search stays busy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(429, {}, { 'Retry-After': '0' })));
    const out = await search('still busy query');
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toMatch(/busy/);
  });
});
