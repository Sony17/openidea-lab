/**
 * Saved runs, kept in this browser (localStorage).
 *
 * Nothing leaves the machine: Lab has no accounts, so there is no server-side
 * place to keep a person's work. The trade-off is that runs are per browser and
 * disappear if site data is cleared; "Download" gives a file that does not.
 * Keeps the newest MAX runs and sheds figures first when the browser quota is hit.
 */

import type { LabelledPart } from './fireworks';
import type { Plan, GeneratedFile } from './muse';
import type { Resource } from './openidea';

export type RunKind = 'idea' | 'paper' | 'photo';

export interface SavedRun {
  id: string;
  kind: RunKind;
  title: string;
  createdAt: number;
  /** The idea or abstract the user typed; for photos, a note. */
  input: string;
  plan?: Plan;
  files?: GeneratedFile[];
  /** PNG data URLs from a paper run. */
  figures?: string[];
  /** Photo flow: the written parts list and the named parts. */
  markdown?: string;
  parts?: LabelledPart[];
  context?: Resource[];
}

export type NewRun = Omit<SavedRun, 'id' | 'createdAt'>;

const KEY = 'openidea-lab:runs';
const MAX = 20;

function read(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedRun[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: SavedRun[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const listRuns = (): SavedRun[] => read().sort((a, b) => b.createdAt - a.createdAt);
export const getRun = (id: string): SavedRun | undefined => read().find((r) => r.id === id);

export function deleteRun(id: string): void {
  write(read().filter((r) => r.id !== id));
}

/** Returns the saved run, or null when the browser refused (private mode, quota). */
export function saveRun(run: NewRun): SavedRun | null {
  const saved: SavedRun = { ...run, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
  let list = [saved, ...read()].slice(0, MAX);
  if (write(list)) return saved;

  // Over quota: drop figures from the older runs, then from this one, then the oldest runs.
  list = list.map((r, i) => (i === 0 ? r : { ...r, figures: undefined }));
  if (write(list)) return saved;
  saved.figures = undefined;
  list[0] = saved;
  while (list.length > 1 && !write(list)) list = list.slice(0, -1);
  return write(list) ? saved : null;
}

export function runToMarkdown(run: SavedRun): string {
  const out: string[] = [`# ${run.title}`, '', `_${run.kind} run · ${new Date(run.createdAt).toLocaleString()} · OpenIdea Lab_`, '', '## Input', '', run.input];
  if (run.plan) {
    out.push('', '## Plan', '', run.plan.summary, '', `**Buildable:** ${run.plan.buildable ? 'yes' : 'not yet'}`);
    if (run.plan.exists.length) out.push('', '**What exists**', ...run.plan.exists.map((x) => `- ${x}`));
    if (run.plan.missing.length) out.push('', '**What is missing**', ...run.plan.missing.map((x) => `- ${x}`));
    if (run.plan.steps.length) out.push('', '**Steps**', ...run.plan.steps.map((x, i) => `${i + 1}. ${x}`));
  }
  if (run.markdown) out.push('', '## Parts list', '', run.markdown);
  if (run.context?.length) out.push('', '## Related open resources', '', ...run.context.map((r) => `- [${r.type}] [${r.title}](${r.url})`));
  for (const f of run.files ?? []) out.push('', `## ${f.path}`, '', '```', f.content, '```');
  return out.join('\n') + '\n';
}
