# OpenIdea Lab — notes for Claude

Read `docs/ARCHITECTURE.md` and `PARTNERS.md` first. This file is the short version plus the rules.

## What this is

A Next.js 15 app at https://lab.openidea.world that turns an idea, a paper or a hardware photo into a
running prototype. Built during the Meta Global AI Developer Hackathon (26 Oct – 4 Nov 2026).
It is a client of the Open Idea platform (openidea.world, repo Sony17/Ecosyz): it reads the platform's
search and knowledge graph and hands results back to App Studio and Workspaces. It contains no platform code.

## Hackathon rule

Everything in this repo was written during the event. Never copy code from Ecosyz into here; call its
API instead. Keep partner usage legible: `PARTNERS.md` must name every partner product and the file
that calls it.

## Layout

- `app/` pages and `app/api/lab/*` routes. Routes are thin; logic lives in `lib/`.
- `lib/<provider>.ts`: one file per provider (`openidea`, `graph`, `muse`, `fireworks`, `baseten-sam3`),
  one exported function per capability. Nothing else imports a provider SDK or URL.
- `lib/runner/`: sandboxes behind one `Runner` interface (`webcontainer`, `pyodide`; a `modal` runner
  would slot in without touching the flows).
- `lib/env.ts`: every key is optional. Return `Result<T>`; use `notConfigured(provider)` so the UI can
  name the missing variable. Do not throw for config.
- `lib/usage.ts` / `lib/budget.ts`: every provider call records tokens or GPU seconds; routes wrap work
  in `withUsage` and check `overBudget` before spending.
- `lib/route.ts`: wrap every route in `safe()`. It adds the passcode check, the rate limit and JSON errors.
- `lib/history.ts`: saved runs live in the browser only.

## Conventions

- TypeScript strict; no `any` without a comment saying why.
- Comments say *why*, and cite the measurement when a decision was measured.
- Model ids, hosts and prices are env variables with defaults in `lib/env.ts`, never literals elsewhere.
- Prompts live next to the function that sends them. Keep JSON-mode prompts explicit about the shape.
- UI copy is plain: say what happened and what to do next. No apologies, no jargon.
- Secrets never go in code, tests, fixtures or logs. `.env.example` lists every variable with a comment.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass before a push. CI runs the same.

## Don't

- Don't add a dependency for something under 50 lines.
- Don't make the sandbox fail a run because the preview did not start; the build is the gate.
- Don't print raw model output into the log; trim with `tail()` and clean with `cleanLog()`.
- Don't commit `tsconfig.tsbuildinfo`, `.env.local` or anything under `.studio-runs/`.
