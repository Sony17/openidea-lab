# OpenIdea Lab

OpenIdea Lab turns an idea, a research paper, or a photo of hardware into a working prototype, powered by Muse Spark and SAM 3.

> **Built during the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026), Startup track.**
> Everything in this repository was written during the event.
> It calls OpenIdea's search API ([openidea.world](https://openidea.world)), which existed before the hackathon and is **not** part of this submission.

## What it does

| Input | Output |
|---|---|
| 💡 An idea | Is it buildable, what already exists, what's missing, plus starter code that runs |
| 📄 A research paper | A notebook that reproduces the paper's key result |
| 📷 A photo of hardware | Every part outlined, with a parts list, prices and datasheets |

## How it works

```
idea / paper / photo
        │
        ▼
OpenIdea search (existing) ── papers, code, datasets, models, hardware
        │
        ▼
Muse Spark (Meta) ── reads, plans, writes code
        │
        ▼
Modal sandbox ── runs the code, errors go back to Muse Spark to fix
        │
        ▼
working prototype

photo ──▶ SAM 3 on a Modal GPU ──▶ outlined parts ──▶ Muse Spark ──▶ parts list
```

## Stack

- **Muse Spark**: reasoning, paper reading, code generation
- **SAM 3**: part segmentation in hardware photos
- **Modal**: code sandbox + GPU for SAM 3

## Status

🚧 Work in progress during the hackathon.
