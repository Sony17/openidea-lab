# OpenIdea Lab

**https://lab.openidea.world**

OpenIdea Lab turns an idea, a research paper, or a photo of hardware into a working prototype, powered by Muse Spark and SAM 3.

> **Built during the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026), Startup track.**
> Everything in this repository was written during the event.
> It calls OpenIdea's search API ([openidea.world](https://openidea.world)), which existed before the hackathon and is **not** part of this submission. See [PARTNERS.md](PARTNERS.md) for exactly what each partner's product does here.

## What it does

| Input | Output |
|---|---|
| 💡 An idea | Is it buildable, what already exists, what's missing, plus starter code that runs |
| 📄 A research paper | A notebook that reproduces the paper's key result |
| 📷 A photo of hardware | Every part outlined, with a parts list, prices and datasheets |

Each result can be sent to the Open Idea platform: ideas open in **App Studio**, papers and parts lists save to a **Workspace**. Finished runs are kept in **History** (in your browser) and can be downloaded as Markdown.

Paper reproductions come with a **verdict**: Fireworks reads the printed output and says whether it supports the paper's claim, so "it runs" is never mistaken for "it reproduces".

Every run shows what it spent per provider. A **credit dashboard** at `/usage` tracks spend against the credit you were given and pauses new runs before it runs out. A shared **passcode** and a per-visitor **rate limit** protect a public deployment.

## How it works

```
idea / paper / photo
        │
        ▼
OpenIdea search (existing) ── papers, code, datasets, models, hardware
        │
        ▼
Fireworks ── ranks and trims the results
        │
        ▼
Muse Spark (Meta) ── reads, plans, writes code
        │
        ▼
in-browser sandbox ── runs the code; errors go to Fireworks to fix
        │
        ▼
working prototype ──▶ Open in Studio / Save to Workspace

photo ──▶ SAM 3 on Baseten ──▶ outlined parts ──▶ Fireworks + Muse Spark ──▶ parts list
```

Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Muse Spark** (Meta Model API): reasoning, paper reading, first-draft code
- **SAM 3** (Meta) on **Baseten**: part segmentation in hardware photos
- **Fireworks**: fast fix loop, result ranking, structured extraction
- **WebContainer** and **Pyodide**: sandboxes that run in the browser
- **Next.js 15**, TypeScript, Tailwind

## Run it locally

```bash
git clone https://github.com/Sony17/openidea-lab
cd openidea-lab
pnpm install
cp .env.example .env.local
pnpm dev
```

Every provider key is optional. With none set, the UI loads and each flow tells you which key it needs. `.env.example` documents every variable, including prices and credit for the dashboard, and `LAB_PASSCODE` for a shared deployment.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; during the hackathon window only `hackathon`-labelled work is merged. Security reports go to the address in [SECURITY.md](SECURITY.md).

## Related

- [Sony17/Ecosyz](https://github.com/Sony17/Ecosyz): the Open Idea platform (search, App Studio, Workspaces) that Lab extends.

## Licence

[MIT](LICENSE).

## Status

🚧 Work in progress during the hackathon.
