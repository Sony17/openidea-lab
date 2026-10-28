/**
 * Hand results back to the Open Idea platform.
 *
 * Lab does not store the user's work. An idea prototype becomes an App Studio
 * project; a notebook or parts list becomes a resource in a Workspace. Both go
 * through the platform's public v1 API with the user's own key, so the platform
 * owns the data and Lab holds nothing.
 */

import { env } from './env';
import type { GeneratedFile } from './muse';

export interface Handoff {
  url: string;
  label: string;
}

/** Create a Studio project from generated files. Returns the project URL. */
export async function openInStudio(
  title: string,
  files: GeneratedFile[],
  userApiKey: string,
): Promise<{ ok: true; value: Handoff } | { ok: false; error: string }> {
  const res = await fetch(`${env.openideaUrl}/studio/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, files, source: 'openidea-lab' }),
  });
  if (!res.ok) return { ok: false, error: `Studio import failed: ${res.status}` };
  const body = (await res.json()) as { id?: string; url?: string };
  const url = body.url ?? `https://openidea.world/studio?project=${body.id}`;
  return { ok: true, value: { url, label: 'Open in Studio' } };
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
