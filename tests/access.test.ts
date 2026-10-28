import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasAccess, passcodeCookieValue, sha256, takeRateLimitSlot } from '@/lib/access';
import { resetMemoryStore } from '@/lib/budget';

const saved = { ...process.env };
beforeEach(() => {
  resetMemoryStore();
  for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LAB_PASSCODE', 'LAB_RATE_LIMIT_PER_HOUR']) delete process.env[k];
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

const req = (headers: Record<string, string> = {}) => new Request('http://lab.test/api/lab/plan', { headers });

describe('passcode', () => {
  it('is open when no passcode is configured', async () => {
    expect(await hasAccess(req())).toBe(true);
    expect(await passcodeCookieValue()).toBeNull();
  });

  it('needs the hashed cookie when a passcode is set', async () => {
    process.env.LAB_PASSCODE = 'meta-2026';
    expect(await hasAccess(req())).toBe(false);
    expect(await hasAccess(req({ cookie: 'lab_pass=wrong' }))).toBe(false);
    expect(await hasAccess(req({ cookie: `other=1; lab_pass=${await sha256('meta-2026')}` }))).toBe(true);
  });
});

describe('rate limit', () => {
  it('counts down and then refuses', async () => {
    process.env.LAB_RATE_LIMIT_PER_HOUR = '3';
    const now = new Date('2026-10-28T10:15:00Z');
    expect(await takeRateLimitSlot('1.2.3.4', now)).toBe(2);
    expect(await takeRateLimitSlot('1.2.3.4', now)).toBe(1);
    expect(await takeRateLimitSlot('1.2.3.4', now)).toBe(0);
    expect(await takeRateLimitSlot('1.2.3.4', now)).toBe(-1);
  });

  it('keeps visitors and hours apart', async () => {
    process.env.LAB_RATE_LIMIT_PER_HOUR = '1';
    const now = new Date('2026-10-28T10:15:00Z');
    expect(await takeRateLimitSlot('a', now)).toBe(0);
    expect(await takeRateLimitSlot('a', now)).toBe(-1);
    expect(await takeRateLimitSlot('b', now)).toBe(0);
    expect(await takeRateLimitSlot('a', new Date('2026-10-28T11:00:00Z'))).toBe(0);
  });
});
