/**
 * The one interface every sandbox implements.
 *
 * Browser runners (WebContainer, Pyodide) implement it today. A Modal runner
 * would implement the same interface server-side, which is the whole reason
 * the interface exists: the fix loop in the flows never knows where code ran.
 */

import type { GeneratedFile } from '../muse';

export interface RunResult {
  ok: boolean;
  /** stdout, or the rendered page's console, trimmed to what a model should read. */
  output: string;
  /** The first error worth fixing, phrased for the model; empty when ok. */
  error: string;
  /** For Python: PNG data URLs of any figures produced. */
  figures?: string[];
}

export interface Runner {
  readonly name: 'webcontainer' | 'pyodide' | 'modal';
  /** True in environments where this runner can work (SharedArrayBuffer, WASM, …). */
  available(): boolean;
  run(files: GeneratedFile[], onLog?: (line: string) => void): Promise<RunResult>;
}

/** Trim a long log to the part a model needs: the tail, where the error is. */
export function tail(log: string, max = 4000): string {
  return log.length > max ? `…${log.slice(-max)}` : log;
}
