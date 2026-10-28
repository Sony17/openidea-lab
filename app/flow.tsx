'use client';

/**
 * The idea and paper flows share one shape: search → Muse Spark drafts →
 * browser sandbox runs → Fireworks fixes → repeat up to MAX_FIXES → hand off.
 * Only the runner and the prompt differ, so this is one component.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Plan, GeneratedFile } from '@/lib/muse';
import type { Verdict } from '@/lib/fireworks';
import type { Resource } from '@/lib/openidea';
import type { RunResult } from '@/lib/runner/types';
import { describeGraph, type Subgraph } from '@/lib/graph';
import type { UsageEntry } from '@/lib/usage-types';
import { saveToWorkspaceLink, type Handoff } from '@/lib/handoff';
import { saveRun } from '@/lib/history';
import { GraphView } from './graph-view';
import { StudioButton } from './studio-button';
import { UsagePanel } from './usage-panel';

const MAX_FIXES = 3;

type Step = 'idle' | 'searching' | 'drafting' | 'running' | 'fixing' | 'judging' | 'done' | 'failed';

interface Props {
  kind: 'idea' | 'paper';
  title: string;
  placeholder: string;
  hint: string;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; value: T; usage?: UsageEntry[] } | { ok: false; error: string; missing?: string; usage?: UsageEntry[] }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // A route that throws returns an empty or HTML body; say so instead of a JSON parse error.
  const text = await res.text();
  if (!text) return { ok: false, error: `${url} returned an empty response (HTTP ${res.status}). See the pnpm dev terminal.` };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `${url} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
}

/** Open Resources links here with ?q=<title> ("Build this"); Suspense is what useSearchParams needs. */
export function FlowPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Flow {...props} />
    </Suspense>
  );
}

function Flow({ kind, title, placeholder, hint }: Props) {
  const params = useSearchParams();
  const [input, setInput] = useState('');
  const [graph, setGraph] = useState<Subgraph | null>(null);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  useEffect(() => {
    const q = params.get('q');
    if (q) setInput(q);
  }, [params]);
  const [step, setStep] = useState<Step>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [context, setContext] = useState<Resource[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const say = (s: string) => setLog((l) => [...l, s]);

  /** post() that also collects the provider usage the route reports. */
  async function call<T>(url: string, body: unknown) {
    const r = await post<T>(url, body);
    if (r.usage?.length) setUsage((u) => [...u, ...(r.usage ?? [])]);
    return r;
  }

  async function start() {
    setStep('searching'); setLog([]); setError(null); setPlan(null); setFiles([]); setRun(null); setGraph(null); setUsage([]); setVerdict(null); setSavedId(null);

    const found = await call<Resource[]>('/api/lab/search', { query: input.slice(0, 500), keep: 6 });
    if (!found.ok) return fail(found.error, found.missing);
    setContext(found.value);
    say(`Found ${found.value.length} relevant open resources.`);

    // The graph is a bonus: if it is down or empty, the flow continues without it.
    let graphText = '';
    if (found.value.length) {
      const g = await call<Subgraph>('/api/lab/graph', { resources: found.value });
      if (g.ok && g.value.edges.length) {
        setGraph(g.value);
        graphText = describeGraph(g.value);
        say(`Knowledge graph: ${g.value.nodes.length - found.value.length} connected entities.`);
      }
    }

    setStep('drafting');
    const draft = await call<{ plan?: Plan; files: GeneratedFile[] }>(
      '/api/lab/plan',
      kind === 'idea' ? { kind, idea: input, context: found.value, graph: graphText } : { kind, text: input, context: found.value },
    );
    if (!draft.ok) return fail(draft.error, draft.missing);
    const planLocal = draft.value.plan;
    if (planLocal) setPlan(planLocal);
    let current = draft.value.files;
    setFiles(current);
    say(`Muse Spark drafted ${current.length} file(s).`);

    const runner = kind === 'idea'
      ? (await import('@/lib/runner/webcontainer')).webcontainerRunner
      : (await import('@/lib/runner/pyodide')).pyodideRunner;
    if (!runner.available()) return fail(`${runner.name} cannot run in this browser.`);

    for (let attempt = 0; attempt <= MAX_FIXES; attempt++) {
      setStep('running');
      say(attempt === 0 ? `Running in ${runner.name}…` : `Re-running after fix ${attempt}…`);
      const result = await runner.run(current, (line) => say(line.trimEnd()));
      setRun(result);
      if (result.ok) {
        say(result.previewUrl ? 'It runs. Live preview below.' : 'It runs.');

        // Running is not reproducing: for a paper, ask whether the output supports the claim.
        let v: Verdict | undefined;
        if (kind === 'paper') {
          setStep('judging');
          say('Checking the result against the paper\u2019s claim…');
          const readme = current.find((f) => /readme/i.test(f.path))?.content ?? '';
          const j = await call<Verdict>('/api/lab/verdict', { claim: input.slice(0, 6000), readme: readme.slice(0, 6000), output: result.output.slice(-6000) });
          if (j.ok) {
            v = j.value;
            setVerdict(v);
            say(`Verdict: ${v.verdict}. ${v.reason}`);
          } else {
            say(`Could not get a verdict: ${j.error}`);
          }
        }

        const saved = saveRun({
          kind, input, plan: planLocal, files: current, figures: result.figures, context: found.value, verdict: v,
          title: input.replace(/\s+/g, ' ').trim().slice(0, 70),
        });
        setSavedId(saved?.id ?? null);
        say(saved ? 'Saved to History.' : 'Could not save to History (browser storage is full or blocked).');
        setStep('done');
        return;
      }
      if (attempt === MAX_FIXES) break;

      setStep('fixing');
      say(`Error: ${result.error.split('\n')[0]}. Asking Fireworks to fix…`);
      const fixed = await call<GeneratedFile[]>('/api/lab/fix', { files: current, error: result.error });
      if (!fixed.ok) return fail(fixed.error, fixed.missing);
      current = fixed.value;
      setFiles(current);
    }
    fail(`Still failing after ${MAX_FIXES} fixes. The files are below; the last error is in the log.`);
  }

  function fail(msg: string, missing?: string) {
    setError(missing ? `${msg}. Set ${missing} in .env.local.` : msg);
    setStep('failed');
    if (/needs a passcode/i.test(msg)) window.location.href = `/enter?next=${encodeURIComponent(window.location.pathname)}`;
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'failed';
  const markdown = files.map((f) => `### ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--muted)]">{hint}</p>
        <textarea
          id={`${kind}-input`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={kind === 'paper' ? 14 : 6}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          id={`${kind}-start`}
          onClick={start}
          disabled={busy || input.trim().length < 5}
          className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy ? step + '…' : 'Build it'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}

        {context.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">What already exists</h2>
            <ul className="mt-2 grid gap-1 text-sm">
              {context.map((r) => (
                <li key={r.id}><a className="underline" href={r.url} target="_blank" rel="noreferrer">[{r.type}] {r.title}</a></li>
              ))}
            </ul>
          </div>
        )}
        {graph && (
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">What connects them</h2>
            <div className="mt-2"><GraphView graph={graph} /></div>
          </div>
        )}
        {plan && (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
            <p>{plan.summary}</p>
            <p className="mt-2"><b>Buildable:</b> {plan.buildable ? 'yes' : 'not yet'}</p>
            {plan.missing.length > 0 && <p className="mt-1"><b>Missing:</b> {plan.missing.join('; ')}</p>}
          </div>
        )}
      </section>

      <section className="grid content-start gap-3">
        <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Log</h2>
        <pre className="max-h-64 overflow-auto rounded-md border border-[var(--line)] bg-black/40 p-3 text-xs">{log.join('\n') || '—'}</pre>
        <UsagePanel entries={usage} />
        {run?.previewUrl && (
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Live preview</h2>
            <iframe
              id="prototype-preview"
              title="The running prototype"
              src={run.previewUrl}
              className="mt-2 h-[480px] w-full rounded-md border border-[var(--line)] bg-white"
            />
          </div>
        )}
        {run?.figures?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt={`Figure ${i + 1}`} className="rounded-md border border-[var(--line)]" />
        ))}
        {verdict && (
          <div
            id="verdict"
            className={`rounded-md border p-3 text-sm ${
              verdict.verdict === 'matches' ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10' : verdict.verdict === 'partial' ? 'border-amber-300/50 bg-amber-300/10' : 'border-red-400/50 bg-red-400/10'
            }`}
          >
            <b>{verdict.verdict === 'matches' ? 'Matches the paper\u2019s claim.' : verdict.verdict === 'partial' ? 'Partly matches the claim.' : 'Does not match the claim.'}</b>{' '}
            {verdict.reason}
            <span className="mt-1 block text-xs text-[var(--muted)]">Judged from the printed output on synthetic data. Not a peer review.</span>
          </div>
        )}
        {files.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm">{files.length} file(s)</summary>
            {files.map((f) => (
              <div key={f.path} className="mt-2">
                <div className="font-mono text-xs text-[var(--muted)]">{f.path}</div>
                <pre className="max-h-64 overflow-auto rounded-md bg-black/40 p-2 text-xs">{f.content}</pre>
              </div>
            ))}
          </details>
        )}
        {step === 'done' && (
          <div className="flex flex-wrap gap-2">
            <a className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm" href={saveToWorkspaceLink(input.slice(0, 80), markdown).url} target="_blank" rel="noreferrer">
              Save to Workspace ↗
            </a>
            <a className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" href="/history">History</a>
            {kind === 'idea' && (
              <StudioButton
                title={input.replace(/\s+/g, ' ').trim().slice(0, 70) || 'Lab prototype'}
                idea={input}
                summary={plan?.summary}
                files={files}
                runId={savedId}
                onOpened={(h: Handoff) => say(`Opened in App Studio: ${h.url}`)}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
