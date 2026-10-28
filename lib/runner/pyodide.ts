'use client';

/**
 * Run a Python reproduction in the browser with Pyodide.
 *
 * Loads Pyodide from the CDN once, installs the pure-Python wheels the script
 * imports (numpy, pandas, matplotlib and scikit-learn ship with Pyodide), runs
 * reproduce.py, and collects stdout plus any matplotlib figures as PNGs.
 *
 * No GPU and no torch. That is the honest limit of a browser sandbox, and the
 * paper prompt in muse.ts is written to stay inside it.
 */

import type { GeneratedFile } from '../muse';
import { tail, type Runner, type RunResult } from './types';

const PYODIDE_VERSION = '0.27.5';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;

interface Pyodide {
  runPythonAsync(code: string): Promise<unknown>;
  loadPackagesFromImports(code: string): Promise<void>;
  FS: { writeFile(path: string, data: string): void; readFile(path: string, opts: { encoding: 'binary' }): Uint8Array; readdir(path: string): string[] };
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
}

let instance: Promise<Pyodide> | null = null;

function load(): Promise<Pyodide> {
  if (instance) return instance;
  instance = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PYODIDE_URL;
    s.onload = () => {
      const w = window as unknown as { loadPyodide: (o: { indexURL: string }) => Promise<Pyodide> };
      w.loadPyodide({ indexURL: PYODIDE_URL.replace('pyodide.js', '') }).then(resolve, reject);
    };
    s.onerror = () => reject(new Error('Could not load Pyodide'));
    document.head.appendChild(s);
  });
  return instance;
}

// Force the Agg backend and save every figure so we can read them back.
const PRELUDE = `
import sys, os
os.environ.setdefault("MPLBACKEND", "Agg")
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    _orig_show = plt.show
    _fig_n = [0]
    def _save_show(*a, **k):
        for num in plt.get_fignums():
            _fig_n[0] += 1
            plt.figure(num).savefig(f"/tmp/fig_{_fig_n[0]}.png", dpi=110, bbox_inches="tight")
        plt.close("all")
    plt.show = _save_show
except Exception:
    pass
`;

export const pyodideRunner: Runner = {
  name: 'pyodide',
  available: () => typeof window !== 'undefined' && typeof WebAssembly !== 'undefined',
  async run(files: GeneratedFile[], onLog): Promise<RunResult> {
    const main = files.find((f) => f.path.endsWith('.py'));
    if (!main) return { ok: false, output: '', error: 'No .py file to run' };

    let log = '';
    const push = (s: string) => {
      log += s + '\n';
      onLog?.(s);
    };

    try {
      const py = await load();
      py.setStdout({ batched: push });
      py.setStderr({ batched: push });
      for (const f of files) py.FS.writeFile(`/home/pyodide/${f.path}`, f.content);
      await py.loadPackagesFromImports(main.content);
      await py.runPythonAsync(PRELUDE);
      await py.runPythonAsync(main.content + '\nimport matplotlib.pyplot as _p; _p.show()');

      const figures = py.FS.readdir('/tmp')
        .filter((n) => n.startsWith('fig_') && n.endsWith('.png'))
        .sort()
        .map((n) => `data:image/png;base64,${toBase64(py.FS.readFile(`/tmp/${n}`, { encoding: 'binary' }))}`);

      return { ok: true, output: tail(log), error: '', figures };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: tail(log), error: tail(msg, 2000) };
    }
  },
};

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
