# Security

OpenIdea Lab runs model-generated code. That is the point of the product and also the main
risk, so please read this before reporting.

## Reporting a vulnerability

Email security@openidea.world. Do not open a public issue. Include steps to reproduce and
what you believe the impact is. We acknowledge within three days and aim to fix critical
issues within two weeks.

## What counts

- Generated code escaping its sandbox (browser WebContainer or Pyodide) or reaching the
  Lab server, another user's data, or provider keys.
- Provider keys (Meta, Fireworks, Baseten, OpenIdea) leaking to the client bundle or logs.
- Prompt injection through a paper PDF, a search result or an image that causes Lab to
  call a provider or the platform in a way the user did not ask for.
- Anything in the hand-off to openidea.world (Studio import, Save to Workspace) that lets
  one user write into another user's project or workspace.

## What does not

- Bugs in the generated prototype itself. The user is told it is model-written.
- Rate-limit exhaustion of your own API keys in a self-hosted deployment.

## Supported versions

Only `main` and the current deployment at https://lab.openidea.world.
