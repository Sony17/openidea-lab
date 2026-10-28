/**
 * Client for the Open Idea knowledge graph.
 *
 * The platform keeps a Neo4j graph of (Resource)-[:MENTIONS]->(TECH | ORG |
 * PERSON) built from its index. It existed before the hackathon; Lab only
 * reads it. Given the resources search returned, Lab asks the graph what they
 * have in common: which technologies, organisations and people connect them.
 * That becomes (a) a picture the user can read and (b) grounding for Muse
 * Spark, whose "what exists / what is missing" answer then names real nodes
 * instead of guesses.
 *
 * Endpoint: GET {OPENIDEA_GRAPH_URL}/expand?id=<resourceId|Label:value>
 * Response: { nodes: [{id, label, group}], edges: [{source, target, label, score}] }
 */

import { env, keyFor, notConfigured, type Result } from './env';
import type { Resource } from './openidea';

export type NodeGroup = 'Resource' | 'TECH' | 'ORG' | 'PERSON' | string;

export interface GraphNode {
  id: string;
  label: string;
  group: NodeGroup;
  /** How many of the input resources mention this entity. Filled by `neighbourhood`. */
  degree?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  score: number;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const graphUrl = () => process.env.OPENIDEA_GRAPH_URL || `${env.openideaUrl}/graph`;

/** One hop from a resource or an entity (`TECH:transformer`). */
export async function expand(id: string, limit = 30): Promise<Result<Subgraph>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const res = await fetch(`${graphUrl()}/expand?${new URLSearchParams({ id, limit: String(limit) })}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  });
  if (res.status === 404) return { ok: true, value: { nodes: [], edges: [] } };
  if (!res.ok) return { ok: false, error: `Graph expand failed: ${res.status}` };
  const body = (await res.json()) as Partial<Subgraph>;
  return { ok: true, value: { nodes: body.nodes ?? [], edges: body.edges ?? [] } };
}

/**
 * The union of one-hop neighbourhoods for a set of resources, with entity
 * degree counted so the UI and the prompt can lead with what is shared.
 * Resources the graph does not know are kept as isolated nodes so the picture
 * still shows every search result.
 */
export async function neighbourhood(resources: Resource[], perResource = 15): Promise<Result<Subgraph>> {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  for (const r of resources) nodes.set(r.id, { id: r.id, label: r.title, group: 'Resource' });

  const hops = await Promise.all(resources.map((r) => expand(r.id, perResource)));
  const first = hops.find((h) => !h.ok);
  if (first && !first.ok && first.missing) return first;

  for (const hop of hops) {
    if (!hop.ok) continue;
    for (const n of hop.value.nodes) {
      const prev = nodes.get(n.id);
      if (!prev) nodes.set(n.id, { ...n, degree: n.group === 'Resource' ? undefined : 0 });
    }
    for (const e of hop.value.edges) {
      const id = `${e.source}->${e.target}`;
      if (edges.has(id)) continue;
      edges.set(id, e);
      const target = nodes.get(e.target);
      if (target && target.group !== 'Resource') target.degree = (target.degree ?? 0) + 1;
    }
  }
  return { ok: true, value: { nodes: [...nodes.values()], edges: [...edges.values()] } };
}

/** Entities ordered by how many input resources share them, grouped for a prompt. */
export function sharedEntities(g: Subgraph, max = 12): { group: NodeGroup; label: string; degree: number }[] {
  return g.nodes
    .filter((n) => n.group !== 'Resource')
    .map((n) => ({ group: n.group, label: n.label, degree: n.degree ?? 0 }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, max);
}

/** A short paragraph for the planning prompt. */
export function describeGraph(g: Subgraph): string {
  const shared = sharedEntities(g);
  if (!shared.length) return '';
  const by = (grp: string) => shared.filter((s) => s.group === grp).map((s) => `${s.label} (${s.degree})`);
  const lines = [
    by('TECH').length ? `Technologies these resources share: ${by('TECH').join(', ')}` : '',
    by('ORG').length ? `Organisations involved: ${by('ORG').join(', ')}` : '',
    by('PERSON').length ? `People involved: ${by('PERSON').join(', ')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
