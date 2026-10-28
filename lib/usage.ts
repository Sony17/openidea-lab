/**
 * Server-side usage recorder.
 *
 * A route wraps its work in `withUsage`; every provider call inside it, however
 * deep, calls `recordTokens` or `recordGpu`, and the route returns what was
 * collected next to its result. AsyncLocalStorage keeps concurrent requests
 * apart without threading a collector through every function signature.
 *
 * Each request's entries are also added to the running totals in budget.ts.
 *
 * Prices come from the environment, per million tokens for Meta and Fireworks
 * and per minute for Baseten:
 *   META_PRICE_IN_PER_M, META_PRICE_OUT_PER_M,
 *   FIREWORKS_PRICE_IN_PER_M, FIREWORKS_PRICE_OUT_PER_M,
 *   BASETEN_PRICE_PER_MIN
 * Unset means no cost is shown.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { persistSpend } from './budget';
import type { TokenProvider, UsageEntry } from './usage-types';

const store = new AsyncLocalStorage<UsageEntry[]>();

export async function withUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: UsageEntry[] }> {
  const entries: UsageEntry[] = [];
  const result = await store.run(entries, fn);
  // Persist before the route responds: a serverless function may be frozen right after.
  await persistSpend(entries).catch((e) => console.warn('[budget] could not save spend', e));
  return { result, usage: entries };
}

function price(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface ApiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** Record one chat-completions call. `usage` is the `usage` object from the response. */
export function recordTokens(provider: TokenProvider, model: string, label: string, usage?: ApiUsage): void {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

  const key = provider.toUpperCase();
  const pin = price(`${key}_PRICE_IN_PER_M`);
  const pout = price(`${key}_PRICE_OUT_PER_M`);
  const costUsd = pin !== undefined && pout !== undefined ? (promptTokens * pin + completionTokens * pout) / 1_000_000 : undefined;

  push({ kind: 'tokens', provider, model, label, promptTokens, completionTokens, totalTokens, costUsd });
}

/** Record one Baseten call by how long it held the endpoint. */
export function recordGpu(model: string, label: string, seconds: number, warming: boolean): void {
  const perMin = price('BASETEN_PRICE_PER_MIN');
  const costUsd = perMin !== undefined ? (seconds / 60) * perMin : undefined;
  push({ kind: 'gpu', provider: 'baseten', model, label, seconds, warming, costUsd });
}

function push(entry: UsageEntry): void {
  store.getStore()?.push(entry);
  const detail =
    entry.kind === 'tokens'
      ? `${entry.promptTokens} in / ${entry.completionTokens} out`
      : `${entry.seconds.toFixed(1)}s${entry.warming ? ' (warming)' : ''}`;
  console.info(`[usage] ${entry.provider} ${entry.label} ${entry.model} ${detail}`);
}
