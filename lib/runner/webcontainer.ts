'use client';

/**
 * Run a Vite + React prototype in the browser with a WebContainer.
 *
 * Boots once per page, mounts the generated files, runs `npm install` and
 * `npm run build`. A build is the signal we want: it catches unresolved
 * imports, syntax and type errors, and does so in the user's tab at no server
 * cost. Once it passes, `npm run dev` starts and its URL is returned as
 * `previewUrl` so the page can show the running app in an iframe.
 *
 * Requires cross-origin isolation (COOP/COEP headers set in next.config.ts).
 * The @webcontainer/api package is loaded lazily so the server bundle never
 * sees it.
 */

import type { GeneratedFile } from '../muse';
import { cleanLog, tail, type Runner, type RunResult } from './types';

type Proc = { exit: Promise<number>; output: ReadableStream<string>; kill(): void };

type WC = {
  mount(tree: Record<string, unknown>): Promise<void>;
  spawn(cmd: string, args: string[]): Promise<Proc>;
  on(event: 'server-ready', cb: (port: number, url: string) => void): () => void;
};

let booted: Promise<WC> | null = null;
/** The dev server from the previous run, stopped before the next one starts. */
let devServer: Proc | null = null;

/** How long to wait for the dev server to announce a URL before giving up on the preview. */
const PREVIEW_TIMEOUT_MS = 60_000;

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

/** Start `npm run dev` and resolve with its URL, or null if it never comes up. */
async function startPreview(wc: WC, push: (s: string) => void): Promise<string | null> {
  // Listen before spawning so a fast server cannot announce itself unheard.
  const ready = new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS);
    wc.on('server-ready', (_port, url) => {
      clearTimeout(timer);
      resolve(url);
    });
  });
  devServer?.kill();
  devServer = await wc.spawn('npm', ['run', 'dev']);
  devServer.output.pipeTo(new WritableStream({ write: (chunk) => push(chunk) }));
  return ready;
}

export const webcontainerRunner: Runner = {
  name: 'webcontainer',
  available: () => typeof window !== 'undefined' && (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
  async run(files, onLog): Promise<RunResult> {
    let log = '';
    const push = (s: string) => {
      const clean = cleanLog(s);
      if (!clean) return;
      log += clean;
      onLog?.(clean);
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
      // The build is the error gate; the dev server is only for showing the result.
      const previewUrl = await startPreview(wc, push);
      if (!previewUrl) push('Built OK, but the live preview did not start.');
      return { ok: true, output: tail(log), error: '', previewUrl: previewUrl ?? undefined };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: tail(log), error: msg };
    }
  },
};
