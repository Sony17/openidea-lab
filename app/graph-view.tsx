'use client';

/**
 * A readable picture of the subgraph: resources in a left column, the
 * entities they share in a right column, a line per MENTIONS edge. Entities
 * sort by how many resources share them, so the thing everything has in
 * common sits at the top. Plain SVG; a force layout would look busier and say
 * less for a dozen nodes.
 */

import type { Subgraph } from '@/lib/graph';
import { sharedEntities } from '@/lib/graph';

const COLOUR: Record<string, string> = {
  TECH: '#4fd1a1',
  ORG: '#7fb3ff',
  PERSON: '#f2b36a',
};

export function GraphView({ graph }: { graph: Subgraph }) {
  const resources = graph.nodes.filter((n) => n.group === 'Resource');
  const entities = sharedEntities(graph, 14);
  if (!resources.length || !entities.length) return null;

  const rowH = 26;
  const h = Math.max(resources.length, entities.length) * rowH + 20;
  const w = 640;
  const leftX = 8;
  const rightX = w - 8;
  const yFor = (i: number, n: number) => 10 + rowH * i + (h - 20 - rowH * (n - 1)) / 2;

  const rIndex = new Map(resources.map((n, i) => [n.id, i]));
  const eIndex = new Map(entities.map((e, i) => [`${e.group}:${e.label}`, i]));
  const nodeKey = (id: string) => {
    const n = graph.nodes.find((x) => x.id === id);
    return n ? `${n.group}:${n.label}` : id;
  };

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-2">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 480 }} role="img" aria-label="Knowledge graph of the results">
        {graph.edges.map((e) => {
          const ri = rIndex.get(e.source);
          const ei = eIndex.get(nodeKey(e.target));
          if (ri === undefined || ei === undefined) return null;
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={leftX + 230}
              y1={yFor(ri, resources.length)}
              x2={rightX - 200}
              y2={yFor(ei, entities.length)}
              stroke="currentColor"
              strokeOpacity={0.18}
            />
          );
        })}
        {resources.map((n, i) => (
          <g key={n.id} transform={`translate(${leftX}, ${yFor(i, resources.length)})`}>
            <circle r="4" cx="230" fill="var(--muted)" />
            <text x="0" y="4" fontSize="11" fill="currentColor">
              {truncate(n.label, 36)}
            </text>
          </g>
        ))}
        {entities.map((e, i) => (
          <g key={`${e.group}:${e.label}`} transform={`translate(${rightX}, ${yFor(i, entities.length)})`}>
            <circle r={3 + Math.min(5, e.degree)} cx="-200" fill={COLOUR[e.group] ?? 'var(--muted)'} />
            <text x="-188" y="4" fontSize="11" fill="currentColor">
              {truncate(e.label, 26)}
              <tspan fill="var(--muted)"> · {e.group.toLowerCase()} · {e.degree}</tspan>
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
