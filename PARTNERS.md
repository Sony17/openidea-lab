# Partner technology used in this project

Built for the Meta Global AI Developer Hackathon, Startup track (26 Oct – 4 Nov 2026).
This page says exactly what each partner's product does here and where in the code it is
called, so a judge can verify it in one click.

| Partner | Product | What it does in Lab | Code |
|---|---|---|---|
| **Meta** | Muse Spark (Meta Model API) | Reads the paper or idea, plans the reproduction, writes the first version of the code | [`lib/muse.ts`](lib/muse.ts) |
| **Meta** | SAM 3 | Outlines every part in a hardware photo | [`baseten/sam3/`](baseten/sam3/) (deployment), [`lib/baseten-sam3.ts`](lib/baseten-sam3.ts) (client) |
| **Baseten** | GPU model hosting | Serves SAM 3 behind an HTTPS endpoint | [`baseten/sam3/`](baseten/sam3/) |
| **Fireworks** | Fast open-model inference | The fix loop (patches errors the sandbox reports), ranks search results before Muse Spark sees them, turns masks and labels into a parts-list JSON | [`lib/fireworks.ts`](lib/fireworks.ts) |

## What is NOT part of the submission

- **OpenIdea search** at openidea.world existed before the event. Lab calls its public API
  through [`lib/openidea.ts`](lib/openidea.ts) and nothing more.
- **App Studio** and **Workspaces** on openidea.world are pre-existing. Lab hands results
  to them by deep link ([`lib/handoff.ts`](lib/handoff.ts)); it does not contain them.

## Modal

Modal was in the original design as the code sandbox and SAM 3 GPU. Credits were not
available during the event, so SAM 3 moved to Baseten and the sandboxes run in the browser
(WebContainer for JavaScript, Pyodide for Python). If Modal becomes available, it replaces
only the browser runners; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
