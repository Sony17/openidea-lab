import Link from 'next/link';
import { configured } from '@/lib/env';

const FLOWS = [
  {
    href: '/idea',
    icon: '💡',
    title: 'An idea',
    out: 'Is it buildable, what already exists, what is missing, plus starter code that runs.',
    needs: ['openidea', 'meta', 'fireworks'] as const,
  },
  {
    href: '/paper',
    icon: '📄',
    title: 'A research paper',
    out: 'A notebook that reproduces one key result, run in your browser.',
    needs: ['openidea', 'meta', 'fireworks'] as const,
  },
  {
    href: '/photo',
    icon: '📷',
    title: 'A photo of hardware',
    out: 'Every part outlined, with a parts list, prices and datasheets.',
    needs: ['baseten', 'fireworks', 'meta', 'openidea'] as const,
  },
];

export default function Home() {
  const ok = configured();
  return (
    <div className="grid gap-8">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">From open knowledge to a running prototype.</h1>
        <p className="mt-3 text-[var(--muted)]">
          Lab searches open research, code, datasets and hardware on openidea.world, then uses Muse Spark to plan and
          write, Fireworks to fix, and SAM 3 to see. The result runs in your browser and can be sent to App Studio or a
          Workspace.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {FLOWS.map((f) => {
          const missing = f.needs.filter((p) => !ok[p]);
          return (
            <Link
              key={f.href}
              href={f.href}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)]"
            >
              <div className="text-2xl">{f.icon}</div>
              <h2 className="mt-2 font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{f.out}</p>
              {missing.length > 0 && (
                <p className="mt-3 text-xs text-amber-300">Needs: {missing.join(', ')}</p>
              )}
            </Link>
          );
        })}
      </section>
    </div>
  );
}
