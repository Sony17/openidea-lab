'use client';

/**
 * Run a Vite + React prototype in the browser with a WebContainer.
 *
 * Boots once per page, mounts the generated files, runs `npm install` and
 * `npm run build`. A build is the signal we want: it catches unresolved
 * imports, syntax and type errors, and does so in the user's tab at no server
 * cost. The dev server URL is returned on success so the UI can preview it.
 *
 * Requires cross-origin isolation (COOP/COEP headers set in next.config.ts).
 * The @webcontainer/api package is loaded lazily so the server bundle never
 * sees it.
 */

import type { GeneratedFile } from '../muse';
import { tail, type Runner, type RunResult } from './types';

type WC = {
  mount(tree: Record<string, unknown>): Promise<void>;
  spawn(cmd: string, args: string[]): Promise<{ exit: Promise<number>; output: ReadableStream<string> }>;
  on(event: 'server-ready', cb: (port: number, url: string) => void): void;
};

let booted: Promise<WC> | null = null;

async function boot(): Promise<WC> {
  if (booted) return booted;
  booted = import('@webcontainer/api').then((m) => (m.WebContainer as unknown as { boot(): Promise<WC> }).boot());
  return booted;
}

function toTree(files: GeneratedFile[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (const dir of parts.slice(0, -1)) {
      const entry = (node[dir] ??= { directory: {} }) as { directory: Record<string, unknown> };
      node = entry.directory;
    }
    node[parts[parts.length - 1]] = { file: { contents: f.content } };
  }
  return root;
}

async function runCmd(wc: WC, cmd: string, args: string[], push: (s: string) => void): Promise<number> {
  const p = await wc.spawn(cmd, args);
  p.output.pipeTo(new WritableStream({ write: (chunk) => push(chunk) }));
  return p.exit;
}

export const webcontainerRunner: Runner = {
  name: 'webcontainer',
  available: () => typeof window !== 'undefined' && (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
  async run(files, onLog): Promise<RunResult> {
    let log = '';
    const push = (s: string) => {
      log += s;
      onLog?.(s);
    };
    try {
      const wc = await boot();
      await wc.mount(toTree(files));
      if ((await runCmd(wc, 'npm', ['install'], push)) !== 0) {
        return { ok: false, output: tail(log), error: `npm install failed:\n${tail(log, 2000)}` };
      }
      if ((await runCmd(wc, 'npm', ['run', 'build'], push)) !== 0) {
        return { ok: false, output: tail(log), error: `Build failed:\n${tail(log, 2000)}` };
      }
      return { ok: true, output: tail(log), error: '' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: tail(log), error: msg };
    }
  },
};
