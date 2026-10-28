/**
 * Hand results back to the Open Idea platform.
 *
 * Lab does not store the user's work. An idea prototype becomes an App Studio
 * project; a notebook or parts list becomes a resource in a Workspace. Both go
 * through the platform's public v1 API with the user's own key, so the platform
 * owns the data and Lab holds nothing.
 *
 * STUDIO. `POST /api/v1/studio/projects` on the platform takes a title and a
 * description and creates an empty project; Studio's first build writes the
 * code. So the description carries what Studio needs to build the right thing:
 * the idea, Lab's plan and the file list. The files themselves are sent too, so
 * that when the platform starts accepting `files` (requested) they land in the
 * project without a change here.
 */

import { env } from './env';
import type { GeneratedFile } from './muse';

export interface Handoff {
  url: string;
  label: string;
}

export interface StudioExport {
  title: string;
  idea: string;
  summary?: string;
  files: GeneratedFile[];
}

export type StudioResult = { ok: true; value: Handoff & { projectId: string } } | { ok: false; error: string; status?: number };

/** What Studio reads first. Kept short: the platform may cap description length. */
export function studioDescription(x: StudioExport): string {
  const list = x.files.map((f) => f.path).join(', ');
  return [
    `Built from OpenIdea Lab. Idea: ${x.idea.trim()}`,
    x.summary ? `Plan: ${x.summary.trim()}` : '',
    `Starting files from the Lab prototype: ${list}.`,
    'Continue from this prototype: keep its structure and make it production-ready.',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2000);
}

/** Create a Studio project from a Lab prototype. Returns the project URL. */
export async function openInStudio(x: StudioExport, userApiKey: string): Promise<StudioResult> {
  const res = await fetch(`${env.openideaUrl}/studio/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: x.title.slice(0, 120), description: studioDescription(x), type: 'web', files: x.files, source: 'openidea-lab' }),
  });

  if (res.status === 401) return { ok: false, error: 'openidea.world did not accept that API key.', status: 401 };
  if (!res.ok) return { ok: false, error: `Studio import failed: ${res.status} ${(await res.text()).slice(0, 200)}`, status: 502 };

  const body = (await res.json()) as { project?: { id?: string }; id?: string; url?: string };
  const id = body.project?.id ?? body.id;
  if (!id) return { ok: false, error: 'Studio did not return a project id.', status: 502 };
  const url = body.url ?? `https://openidea.world/studio?project=${encodeURIComponent(id)}`;
  return { ok: true, value: { url, label: 'Open in Studio', projectId: id } };
}

/** A link that pre-fills "Save to Workspace" on the platform with this content. */
export function saveToWorkspaceLink(title: string, markdown: string): Handoff {
  const params = new URLSearchParams({ title, content: markdown.slice(0, 8000), source: 'openidea-lab' });
  return { url: `https://openidea.world/workspaces?save=1&${params}`, label: 'Save to Workspace' };
}

/** A shareable link back to this Lab result. */
export function labLink(path: string): string {
  return new URL(path, env.labUrl).toString();
}
