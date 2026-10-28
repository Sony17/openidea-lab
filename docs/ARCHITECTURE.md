# Architecture

Lab is a Next.js app deployed at https://lab.openidea.world. It is a client of the Open Idea
platform: it reads from the platform's search API and writes results back into Studio and
Workspaces by deep link. It contains no platform code.

## The three flows

```
                 ┌──────────────────────────────────────────────┐
  input ───────► │ OpenIdea search (existing API)               │
                 │ papers · code · datasets · models · hardware │
                 └──────────────────────┬───────────────────────┘
                                        │ raw results
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │ Fireworks: rank and trim to what matters     │
                 └──────────────────────┬───────────────────────┘
                                        │ context
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │ Muse Spark: read · plan · write first draft  │
                 └──────────────────────┬───────────────────────┘
                                        │ files
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
  💡 Idea                       📄 Paper                      📷 Photo
  WebContainer runs the app     Pyodide runs the notebook     SAM 3 on Baseten outlines parts
  errors ─► Fireworks fixes     errors ─► Fireworks fixes     Fireworks labels + parts JSON
  ─► "Open in Studio"           ─► "Save to Workspace"        Muse Spark adds datasheets/prices
                                                              ─► "Save to Workspace"
```

## Why each piece is where it is

**Muse Spark writes the first draft; Fireworks fixes it.** The first draft needs the most
reasoning: read a paper, decide which result is reproducible on small data, pick a plan. The
fix loop runs several times per build and needs speed and low cost more than depth. Two models,
two jobs.

**Sandboxes run in the browser.** Modal was the original sandbox and its credits were not
available. A WebContainer (JavaScript) and Pyodide (Python) run on the user's machine, cost
nothing per run, and give the agent real runtime errors, which is the thing the platform's
own build gate lacks. The limit is honest: no GPU, no heavy PyTorch. Paper reproductions
target one figure or table on a small sample, and the UI says so.

**SAM 3 on Baseten.** Segmentation needs a GPU. Baseten serves a model behind an HTTPS
endpoint with scale-to-zero; `baseten/sam3/` is the Truss config. Cold starts are 30–90 s,
so the UI shows a warming state instead of a spinner.

**One file per provider.** `lib/muse.ts`, `lib/fireworks.ts`, `lib/baseten-sam3.ts`,
`lib/openidea.ts`. Each exports plain functions. Nothing else imports an SDK. Swapping a
provider, or adding Modal later, is one file.

**The knowledge graph grounds the plan.** The platform keeps a Neo4j graph of
`(Resource)-[:MENTIONS]->(TECH | ORG | PERSON)`. After search, Lab asks for the one-hop
neighbourhood of the results (`lib/graph.ts`), draws it (resources left, shared entities
right, sized by how many results mention them) and hands Muse Spark a short paragraph:
"technologies these resources share: …". The exists/missing answer then names real nodes.
If the graph is down or knows none of the results, the flow continues without it.

**Open Resources links in.** Every result on openidea.world/openresources can carry a
"Build this" link to `lab.openidea.world/idea?q=<title>` or `/paper?q=…`; the flow pages
read `?q=` and pre-fill. That is the Research → Build bridge the platform lacked.

**Hand-off by deep link.** `lib/handoff.ts` builds the "Open in Studio" and "Save to
Workspace" URLs and posts files to the platform's `/api/v1/studio/projects`. Lab never
stores the user's project; the platform does.

## Repository layout

```
app/                     Next.js App Router
  page.tsx               the three entry cards
  idea/  paper/  photo/  one route per flow
  api/lab/…              thin routes; all logic is in lib/
  graph-view.tsx         SVG picture of the subgraph
lib/
  openidea.ts            platform search client
  graph.ts               knowledge-graph client + prompt helper
  muse.ts                Muse Spark client
  fireworks.ts           fix loop, ranking, structured extraction
  baseten-sam3.ts        SAM 3 client
  runner/
    webcontainer.ts      JS sandbox
    pyodide.ts           Python sandbox
  handoff.ts             links back to the platform
baseten/sam3/            Truss deployment for SAM 3
demo/                    recorded inputs and outputs for each flow
docs/                    this file and friends
```

## Running it yourself

Every provider key in `.env.example` is optional. With none set, the UI loads and each flow
reports which key it needs. With only `OPENIDEA_API_KEY`, search works and the model steps
show their prompts without calling anything, which is how UI work is done without spending.

## If Modal becomes available

Add `lib/runner/modal.ts` with the same interface as the two browser runners. Paper flows
gain real GPU Python; idea flows gain a per-user microVM with `npm install`. Nothing else
changes.
