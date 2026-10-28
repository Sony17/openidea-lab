'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function EnterPage() {
  return (
    <Suspense fallback={null}>
      <Enter />
    </Suspense>
  );
}

function Enter() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/lab/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode: code }) });
    const body = await res.json().catch(() => ({ ok: false, error: 'Something went wrong.' }));
    setBusy(false);
    if (!body.ok) return setError(body.error ?? 'That passcode is not right.');
    const next = params.get('next');
    router.replace(next && next.startsWith('/') ? next : '/');
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-sm gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Enter the passcode</h1>
      <p className="text-sm text-[var(--muted)]">This Lab is open to people with the passcode while it is being judged. Ask the team for it.</p>
      <input
        id="passcode"
        type="password"
        autoComplete="current-password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--accent)]"
        placeholder="Passcode"
        autoFocus
      />
      <button id="passcode-submit" disabled={busy || !code} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40">
        {busy ? 'Checking…' : 'Continue'}
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
