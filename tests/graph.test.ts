import { describe, expect, it } from 'vitest';
import { describeGraph, sharedEntities, type Subgraph } from '@/lib/graph';

const g: Subgraph = {
  nodes: [
    { id: 'r1', label: 'Paper A', group: 'Resource' },
    { id: 'r2', label: 'Repo B', group: 'Resource' },
    { id: 'TECH:transformer', label: 'transformer', group: 'TECH', degree: 2 },
    { id: 'TECH:lora', label: 'lora', group: 'TECH', degree: 1 },
    { id: 'ORG:meta', label: 'Meta', group: 'ORG', degree: 1 },
  ],
  edges: [
    { source: 'r1', target: 'TECH:transformer', label: 'MENTIONS', score: 1 },
    { source: 'r2', target: 'TECH:transformer', label: 'MENTIONS', score: 1 },
    { source: 'r2', target: 'TECH:lora', label: 'MENTIONS', score: 1 },
    { source: 'r1', target: 'ORG:meta', label: 'MENTIONS', score: 1 },
  ],
};

describe('knowledge graph helpers', () => {
  it('orders shared entities by how many resources mention them', () => {
    // Ties break alphabetically, case-insensitive: "lora" before "Meta".
    expect(sharedEntities(g).map((e) => e.label)).toEqual(['transformer', 'lora', 'Meta']);
  });

  it('writes a prompt paragraph grouped by entity type', () => {
    const text = describeGraph(g);
    expect(text).toContain('Technologies these resources share: transformer (2), lora (1)');
    expect(text).toContain('Organisations involved: Meta (1)');
    expect(text).not.toContain('People');
  });

  it('says nothing when there are no entities', () => {
    expect(describeGraph({ nodes: [{ id: 'r1', label: 'A', group: 'Resource' }], edges: [] })).toBe('');
  });
});
