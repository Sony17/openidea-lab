import { afterEach, describe, expect, it } from 'vitest';
import { configured, missingKey, notConfigured } from '@/lib/env';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe('provider configuration', () => {
  it('reports every provider as unconfigured with no env', () => {
    delete process.env.OPENIDEA_API_KEY;
    delete process.env.META_API_KEY;
    delete process.env.FIREWORKS_API_KEY;
    delete process.env.BASETEN_API_KEY;
    expect(configured()).toEqual({ openidea: false, meta: false, fireworks: false, baseten: false });
  });

  it('needs both a key and a model id for Baseten', () => {
    process.env.BASETEN_API_KEY = 'k';
    delete process.env.BASETEN_SAM3_MODEL_ID;
    expect(configured().baseten).toBe(false);
  });

  it('names the missing variable so the UI can show it', () => {
    const r = notConfigured('meta');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toBe(missingKey('meta'));
  });
});
