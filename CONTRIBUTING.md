# Contributing to OpenIdea Lab

Thanks for helping. This file explains how the project is run and how to get a change in.

## Before you start

- **Hackathon window (26 Oct – 4 Nov 2026).** During this period the core team merges only
  what is needed for the Meta Global AI Developer Hackathon submission. Issues and PRs are
  welcome; they are triaged after 4 Nov unless labelled `hackathon`.
- **Scope.** Lab turns an idea, a paper or a hardware photo into a running prototype. It is a
  client of the Open Idea platform (openidea.world). Platform features belong in
  [Sony17/Ecosyz](https://github.com/Sony17/Ecosyz), not here.

## Setup

```bash
git clone https://github.com/Sony17/openidea-lab
cd openidea-lab
pnpm install
cp .env.example .env.local   # fill in the keys you have; every provider is optional in dev
pnpm dev
```

Node 22 and pnpm 10. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit.

## Making a change

1. Open an issue first for anything bigger than a typo, so we can agree on the approach.
2. Fork, branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
3. Keep PRs small and single-purpose. One flow, one provider client, one doc page.
4. `pnpm lint && pnpm typecheck && pnpm test` must pass. CI runs the same.
5. Fill in the PR template. Say what you tested and how.

## Commit messages

Conventional Commits, imperative mood, under 72 characters on the first line:

```
feat(paper): run generated notebook in Pyodide
fix(sam3): retry on Baseten cold start
docs: explain the hand-off to Studio
```

## Code style

- TypeScript strict. No `any` without a comment saying why.
- Every provider (Muse Spark, Fireworks, Baseten, OpenIdea) lives behind one file in `lib/`
  with one exported function per capability. Nothing else imports the SDKs directly.
- Comments explain *why*, not *what*. If a decision was measured, say what was measured.
- No secrets in code, fixtures or tests. `.env.example` lists every variable with a comment.

## Good first issues

Look for the `good first issue` label. Typical ones: a new OpenIdea resource type in the
ranker, a better error message in the fix loop, a doc page, a demo input.

## Review and merging

A maintainer (see CODEOWNERS) reviews within a few days. We squash-merge. Your commit is
credited to you; the squash keeps your authorship.

## Code of conduct

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing you agree your contribution is licensed under the [MIT Licence](LICENSE).
