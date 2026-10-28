import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { budgetSummary, overBudget, persistSpend, resetMemoryStore } from '@/lib/budget';
import type { UsageEntry } from '@/lib/usage-types';

const saved = { ...process.env };
beforeEach(() => {
  resetMemoryStore();
  for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

const meta = (cost?: number, p = 1000, c = 500): UsageEntry => ({
  kind: 'tokens', provider: 'meta', model: 'm', label: 'plan', promptTokens: p, completionTokens: c, totalTokens: p + c, costUsd: cost,
});
const gpu = (seconds: number, cost?: number): UsageEntry => ({ kind: 'gpu', provider: 'baseten', model: 'x', label: 'segment', seconds, warming: false, costUsd: cost });

describe('budget summary', () => {
  it('adds up calls, tokens, GPU seconds and cost per provider', async () => {
    await persistSpend([meta(0.02), meta(0.03, 2000, 100), gpu(30, 0.05)]);
    const s = await budgetSummary();
    const m = s.providers.find((p) => p.provider === 'meta')!;
    expect(m.totals).toMatchObject({ calls: 2, promptTokens: 3000, completionTokens: 600 });
    expect(m.totals.costUsd).toBeCloseTo(0.05, 6);
    expect(s.providers.find((p) => p.provider === 'baseten')!.totals).toMatchObject({ calls: 1, seconds: 30 });
    expect(s.totalCostUsd).toBeCloseTo(0.1, 6);
    expect(s.store).toBe('memory');
  });

  it("puts today's spend in the daily table", async () => {
    await persistSpend([meta(0.5)]);
    const m = (await budgetSummary()).providers.find((p) => p.provider === 'meta')!;
    expect(m.days[0].calls).toBe(1);
    expect(m.days[0].costUsd).toBeCloseTo(0.5, 6);
    expect(m.days[1].calls).toBe(0);
  });

  it('counts calls that had no price so the page can warn', async () => {
    await persistSpend([meta(undefined), meta(0.01)]);
    expect((await budgetSummary()).unpricedCalls).toBe(1);
  });

  it('works out what is left and about how many calls that buys', async () => {
    process.env.META_CREDIT_USD = '10';
    await persistSpend([meta(1), meta(1)]);
    const m = (await budgetSummary()).providers.find((p) => p.provider === 'meta')!;
    expect(m.remainingUsd).toBeCloseTo(8, 6);
    expect(m.pct).toBeCloseTo(20, 6);
    expect(m.callsLeft).toBe(8);
  });
});

describe('overBudget', () => {
  it('allows everything when no credit is set', async () => {
    await persistSpend([meta(999)]);
    expect(await overBudget('meta')).toBeNull();
  });

  it('allows runs below the stop point and refuses at it', async () => {
    process.env.META_CREDIT_USD = '10';
    await persistSpend([meta(8.9)]);
    expect(await overBudget('meta')).toBeNull();
    await persistSpend([meta(0.1)]); // 9.0 = 90% of 10
    expect(await overBudget('meta')).toMatch(/credit is nearly used up/);
  });

  it('honours LAB_BUDGET_STOP_PCT', async () => {
    process.env.FIREWORKS_CREDIT_USD = '10';
    process.env.LAB_BUDGET_STOP_PCT = '50';
    await persistSpend([{ kind: 'tokens', provider: 'fireworks', model: 'q', label: 'fix', promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 5 }]);
    expect(await overBudget('fireworks')).not.toBeNull();
    expect(await overBudget('meta')).toBeNull();
  });
});
