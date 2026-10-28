import { describe, expect, it } from 'vitest';
import { saveToWorkspaceLink, studioDescription } from '@/lib/handoff';

describe('hand-off', () => {
  it('writes a Studio description with the idea, plan and file list, under the cap', () => {
    const d = studioDescription({
      title: 'Soil sensor',
      idea: 'A soil sensor for farmers',
      summary: 'Buildable with an ESP32.',
      files: [{ path: 'package.json', content: '{}' }, { path: 'src/App.tsx', content: 'x'.repeat(5000) }],
    });
    expect(d).toContain('Idea: A soil sensor for farmers');
    expect(d).toContain('Plan: Buildable with an ESP32.');
    expect(d).toContain('package.json, src/App.tsx');
    expect(d.length).toBeLessThanOrEqual(2000);
  });

  it('links Save to Workspace with the content pre-filled', () => {
    const h = saveToWorkspaceLink('Parts list', '# hello');
    expect(h.url).toContain('openidea.world/workspaces?save=1');
    expect(h.url).toContain('title=Parts+list');
  });
});
