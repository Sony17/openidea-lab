import { budgetSummary, type ProviderBudget } from '@/lib/budget';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Credit usage · OpenIdea Lab', robots: { index: false, follow: false } };

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const int = (n: number) => Math.round(n).toLocaleString('en-US');

/** Green under 60% of the credit, amber to the stop point, red from there. */
function tone(p: ProviderBudget): string {
  if (p.blocked) return 'bg-red-400';
  return (p.pct ?? 0) >= 60 ? 'bg-amber-300' : 'bg-[var(--accent)]';
}

function Card({ p, stopPct }: { p: ProviderBudget; stopPct: number }) {
  const isGpu = p.provider === 'baseten';
  const pct = Math.min(100, p.pct ?? 0);
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{p.label}</h2>
        {p.blocked && <span className="rounded bg-red-400/20 px-2 py-0.5 text-xs text-red-300">paused</span>}
      </div>

      {p.creditUsd === undefined ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No credit set. Add <code>{p.provider.toUpperCase()}_CREDIT_USD</code> to see how much is left and to stop runs before it runs out.
        </p>
      ) : (
        <>
          <p className="mt-3 text-3xl font-semibold tabular-nums">{usd(p.remainingUsd ?? 0)}</p>
          <p className="text-xs text-[var(--muted)]">left of {usd(p.creditUsd)} credit · {usd(p.totals.costUsd)} used</p>
          <div className="relative mt-3 h-2 rounded bg-black/40" role="img" aria-label={`${pct.toFixed(0)}% of the credit used`}>
            <div className={`h-2 rounded ${tone(p)}`} style={{ width: `${pct}%` }} />
            <div className="absolute top-[-3px] h-[14px] w-px bg-[var(--fg)]/60" style={{ left: `${stopPct}%` }} title={`Pauses at ${stopPct}%`} />
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Pauses new runs at {stopPct}% ({usd(p.stopAtUsd ?? 0)}).
            {p.callsLeft !== undefined && <> About {int(p.callsLeft)} more calls at today’s average.</>}
          </p>
        </>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt className="text-[var(--muted)]">Calls</dt>
        <dd className="text-right">{int(p.totals.calls)}</dd>
        {isGpu ? (
          <>
            <dt className="text-[var(--muted)]">GPU time</dt>
            <dd className="text-right">{p.totals.seconds.toFixed(0)} s</dd>
          </>
        ) : (
          <>
            <dt className="text-[var(--muted)]">Input tokens</dt>
            <dd className="text-right">{int(p.totals.promptTokens)}</dd>
            <dt className="text-[var(--muted)]">Output tokens</dt>
            <dd className="text-right">{int(p.totals.completionTokens)}</dd>
          </>
        )}
      </dl>

      <table className="mt-4 w-full text-xs tabular-nums">
        <thead className="text-left text-[var(--muted)]">
          <tr>
            <th className="py-1 font-normal">Day (UTC)</th>
            <th className="py-1 text-right font-normal">Calls</th>
            <th className="py-1 text-right font-normal">Spend</th>
          </tr>
        </thead>
        <tbody>
          {p.days.map((d) => (
            <tr key={d.day} className="border-t border-[var(--line)]">
              <td className="py-1">{d.day}</td>
              <td className="py-1 text-right">{int(d.calls)}</td>
              <td className="py-1 text-right">{d.calls ? usd(d.costUsd) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const adminKey = process.env.LAB_ADMIN_KEY;

  // In production the page needs a key: it shows spend, and the link is easy to share by accident.
  if (process.env.NODE_ENV === 'production' && !adminKey) {
    return <p className="text-sm text-[var(--muted)]">Set LAB_ADMIN_KEY in the environment, then open /usage?key=&lt;that value&gt;.</p>;
  }
  if (adminKey && key !== adminKey) {
    return <p className="text-sm text-[var(--muted)]">Not authorised. Open /usage?key=&lt;your LAB_ADMIN_KEY&gt;.</p>;
  }

  let summary;
  try {
    summary = await budgetSummary();
  } catch (e) {
    return <p className="text-sm text-red-300">Could not read the usage store: {e instanceof Error ? e.message : String(e)}</p>;
  }

  const anyCredit = summary.providers.some((p) => p.creditUsd !== undefined);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credit usage</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Estimated from each call’s tokens or GPU time and the prices you set. The provider’s own dashboard is the bill; this is the early warning.
        </p>
      </div>

      {summary.store === 'memory' && (
        <p className="rounded-md border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-200">
          Counting in memory only. Totals reset when the server restarts or redeploys, and each serverless instance counts separately, so the pause
          is not reliable. Connect Upstash Redis (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) for a shared count.
        </p>
      )}
      {summary.unpricedCalls > 0 && (
        <p className="rounded-md border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-200">
          {int(summary.unpricedCalls)} call{summary.unpricedCalls === 1 ? '' : 's'} had no price set, so their cost is missing below. Add the *_PRICE_*
          variables so spend and the pause are accurate.
        </p>
      )}
      {!anyCredit && (
        <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
          Set META_CREDIT_USD, FIREWORKS_CREDIT_USD and BASETEN_CREDIT_USD to the credit you were given.
        </p>
      )}

      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Estimated spend, all providers</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{usd(summary.totalCostUsd)}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summary.providers.map((p) => (
          <Card key={p.provider} p={p} stopPct={summary.stopPct} />
        ))}
      </div>
    </div>
  );
}
