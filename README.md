# OpenClaw Office Sicilia

Operational workspace for the OpenClaw/Sitio Uno Sicilia office node.

This repository records the office-level documentation, onboarding notes, Hermes/Zeus
fleet tooling, and delegation contracts used to connect Sicilia with the Sitio Uno
agent network.

## Contents

- `SICILIA-NODE.md` - current Sicilia node state and known corrections.
- `HERMES-NODE.md` - Zeus/Hermes GCP node notes.
- `MIROFISH-NODE.md` - MiroFish simulator node notes.
- `docs/` - delegation contract, gateway research, branch registration roadmap,
  and implementation plans.
- `hermes-config/SOUL.md` - Zeus identity/persona reference used before the
  dedicated Hermes repo archival.
- `hermes-openclaw-tools/` - OpenClaw fleet MCP tooling snapshot.
- `onboard-sicilia-prompt.md` - onboarding plan/prompt for provisioning Sicilia.

## Separate Repositories

The MiroFish application lives in its own repository and is intentionally ignored
here:

- `SiteOneTech/mirofish-original-ai-forecast`

Do not vendor the nested MiroFish checkout into this repository.

## Secret Policy

This repo stores only templates, documentation, and environment variable names.
Do not commit actual API keys, Tailscale auth keys, gateway tokens, delegate
tokens, state databases, logs, or session history.

