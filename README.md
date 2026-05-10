# OpenClaw Office

OpenClaw Office is the SitioUno graphical/product fork of the OpenClaw Office
frontend. It provides the reusable office UI surface used by local node
implementations, without making any single node the source of truth.

This repository owns:

- React/Vite source for the visual office, console, chat workspace, and related
  frontend services.
- Office assets, i18n, tests, CLI/service helpers, and local app packaging.
- Product-level integration surfaces such as local tunnels, Branch Kanban UI,
  setup/admin views, and runtime configuration hooks.

This repository should stay node-agnostic. Sicilia, Miami, Hermes/Zeus,
MiroFish, and Factory deployments are implementations or consumers of this
office surface, not the identity of this fork.

## Domain Boundaries

See [SITIOUNO-REPO-MAP.md](SITIOUNO-REPO-MAP.md) for the canonical ownership
map. In short:

- UI/product changes to OpenClaw Office belong here.
- Infrastructure, registry, MCP routing, fleet configuration, node runbooks, and
  per-node secrets belong in `gcloud-office`.
- Software Factory capabilities belong in `sitiouno-software-factory-ai`.
- Hermes/Zeus runtime implementation belongs in `hermes-agent`.
- MiroFish product code belongs in `mirofish-original-ai-forecast`.

## Running From Source

Requirements:

- Node.js 22+
- pnpm

```bash
pnpm install
pnpm dev
```

For production validation:

```bash
pnpm build
```

## Local Runtime Configuration

Node-specific values should come from local configuration, the fleet registry,
or environment variables. Do not hardcode branch names, agent inventories,
provider credentials, tunnel endpoints, or node identities in React source.

Useful references:

- [README.en.md](README.en.md) - upstream product documentation.
- [NODE_ONBOARDING.md](NODE_ONBOARDING.md) - Office UI onboarding expectations
  for nodes.
- [KANBAN-BACKEND.md](KANBAN-BACKEND.md) - Branch Kanban integration contract.

## Secret Policy

This repo stores only templates, documentation, and environment variable names.
Do not commit actual API keys, Tailscale auth keys, gateway tokens, delegate
tokens, state databases, logs, or session history.
