'use client';

/**
 * The idea and paper flows share one shape: search → Muse Spark drafts →
 * browser sandbox runs → Fireworks fixes → repeat up to MAX_FIXES → hand off.
 * Only the runner and the prompt differ, so this is one component.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Plan, GeneratedFile } from '@/lib/muse';
import type { Resource } from '@/lib/openidea';
import type { RunResult } from '@/lib/runner/types';
import { describeGraph, type Subgraph } from '@/lib/graph';
import { saveToWorkspaceLink } from '@/lib/handoff';
import { GraphView } from './graph-view';

const MAX_FIXES = 3;

type Step = 'idle' | 'searching' | 'drafting' | 'running' | 'fixing' | 'done' | 'failed';

interface Props {
  kind: 'idea' | 'paper';
  title: string;
  placeholder: string;
  hint: string;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; value: T } | { ok: false; error: string; missing?: string }> {
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

  const say = (s: string) => setLog((l) => [...l, s]);

  async function start() {
    setStep('searching'); setLog([]); setError(null); setPlan(null); setFiles([]); setRun(null); setGraph(null);

    const found = await post<Resource[]>('/api/lab/search', { query: input.slice(0, 500), keep: 6 });
    if (!found.ok) return fail(found.error, found.missing);
    setContext(found.value);
    say(`Found ${found.value.length} relevant open resources.`);

    // The graph is a bonus: if it is down or empty, the flow continues without it.
    let graphText = '';
    if (found.value.length) {
      const g = await post<Subgraph>('/api/lab/graph', { resources: found.value });
      if (g.ok && g.value.edges.length) {
        setGraph(g.value);
        graphText = describeGraph(g.value);
        say(`Knowledge graph: ${g.value.nodes.length - found.value.length} connected entities.`);
      }
    }

    setStep('drafting');
    const draft = await post<{ plan?: Plan; files: GeneratedFile[] }>(
      '/api/lab/plan',
      kind === 'idea' ? { kind, idea: input, context: found.value, graph: graphText } : { kind, text: input, context: found.value },
    );
    if (!draft.ok) return fail(draft.error, draft.missing);
    if (draft.value.plan) setPlan(draft.value.plan);
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
      if (result.ok) { say('It runs.'); setStep('done'); return; }
      if (attempt === MAX_FIXES) break;

      setStep('fixing');
      say(`Error: ${result.error.split('\n')[0]}. Asking Fireworks to fix…`);
      const fixed = await post<GeneratedFile[]>('/api/lab/fix', { files: current, error: result.error });
      if (!fixed.ok) return fail(fixed.error, fixed.missing);
      current = fixed.value;
      setFiles(current);
    }
    fail(`Still failing after ${MAX_FIXES} fixes. The files are below; the last error is in the log.`);
  }

  function fail(msg: string, missing?: string) {
    setError(missing ? `${msg}. Set ${missing} in .env.local.` : msg);
    setStep('failed');
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
        {run?.figures?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt={`Figure ${i + 1}`} className="rounded-md border border-[var(--line)]" />
        ))}
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
            {kind === 'idea' && (
              <span className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]" title="Needs your openidea.world API key; coming next">
                Open in Studio
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
