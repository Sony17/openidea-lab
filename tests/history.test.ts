import { beforeEach, describe, expect, it } from 'vitest';
import { listRuns, saveRun, deleteRun, runToMarkdown } from '@/lib/history';

// A tiny localStorage for the node test environment, with an optional size limit.
function install(limit = Infinity) {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if ([...data].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), v.length) > limit) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
}

const run = (title: string, extra = {}) => ({ kind: 'idea' as const, title, input: `input for ${title}`, ...extra });

describe('history', () => {
  beforeEach(() => install());

  it('saves runs and lists the newest first', async () => {
    saveRun(run('first'));
    await new Promise((r) => setTimeout(r, 2));
    saveRun(run('second'));
    expect(listRuns().map((r) => r.title)).toEqual(['second', 'first']);
  });

  it('deletes a run', () => {
    const a = saveRun(run('a'))!;
    saveRun(run('b'));
    deleteRun(a.id);
    expect(listRuns().map((r) => r.title)).toEqual(['b']);
  });

  it('keeps only the newest 20', () => {
    for (let i = 0; i < 25; i++) saveRun(run(`r${i}`));
    expect(listRuns()).toHaveLength(20);
  });

  it('drops figures before refusing a run when storage is nearly full', () => {
    install(2000);
    const saved = saveRun(run('big', { figures: ['x'.repeat(5000)] }));
    expect(saved).not.toBeNull();
    expect(listRuns()[0].figures).toBeUndefined();
  });

  it('returns null instead of throwing when storage is unavailable', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(saveRun(run('x'))).toBeNull();
    expect(listRuns()).toEqual([]);
  });
});

describe('runToMarkdown', () => {
  it('writes the input, plan and files as a readable document', () => {
    const md = runToMarkdown({
      id: '1', kind: 'idea', title: 'Soil sensor', createdAt: 0, input: 'A sensor for farmers',
      plan: { summary: 'Mostly buildable.', buildable: false, exists: ['moisture probes'], missing: ['Hindi alerts'], steps: ['Wire the probe'] },
      files: [{ path: 'src/App.tsx', content: 'export default 1' }],
    });
    expect(md).toContain('# Soil sensor');
    expect(md).toContain('A sensor for farmers');
    expect(md).toContain('**Buildable:** not yet');
    expect(md).toContain('- Hindi alerts');
    expect(md).toContain('## src/App.tsx');
  });
});
