# Branch Kanban Backend

The `/kanban` page is a UI surface. Its operational backend lives in the
`gcloud-office` repo as the branch delegate receiver:

```text
Browser -> openclaw-office /api/branch-kanban -> delegate_receiver /v1/kanban
Browser -> openclaw-office /api/branch-report -> delegate_receiver /v1/delegate
```

Canonical backend files:

- `gcloud-office/mcp-tools/branch_inbox/delegate_receiver.py`
- `gcloud-office/mcp-tools/branch_inbox/kanban.py`
- `gcloud-office/mcp-tools/branch_inbox/workboard/`
- `gcloud-office/docs/openclaw-branch-kanban.md`

## Required Branch Runtime

Each branch must run a delegate receiver service:

```bash
systemctl --user status openclaw-delegate-<branch>.service
```

The receiver env file must provide the base URL and token:

```bash
~/.config/<branch>-delegate-receiver.env
```

Expected keys:

```bash
DELEGATION_TOKEN=<secret>
DELEGATE_BIND=<tailscale-ip>
DELEGATE_PORT=8780
DELEGATE_BRANCH=<branch>
OPENCLAW_PROFILE=<branch>
```

The `openclaw-office` process discovers that file automatically when it runs as
the same user and branch profile. Otherwise set:

```bash
OPENCLAW_BRANCH_RECEIVER_ENV=/home/<user>/.config/<branch>-delegate-receiver.env
```

or provide equivalent values:

```bash
OPENCLAW_BRANCH_API_BASE_URL=http://100.x.y.z:8780
OPENCLAW_BRANCH_DELEGATE_TOKEN=<same-secret-as-DELEGATION_TOKEN>
```

## Validation

From the branch machine:

```bash
curl -fsS http://127.0.0.1:<office-port>/api/branch-kanban
curl -fsS http://127.0.0.1:<office-port>/api/branch-report
```

If the UI shows `Branch Kanban is not configured`, the frontend loaded but
`openclaw-office` did not find the branch receiver URL or token. Check:

```bash
systemctl --user cat openclaw-office-<branch>.service
journalctl --user -u openclaw-office-<branch>.service -n 80 --no-pager
systemctl --user status openclaw-delegate-<branch>.service
```

## Node Registration and Zeus/Hermes

This UI does not make a branch visible to Zeus by itself. Zeus runs on Hermes
and uses the `openclaw-office` MCP server from `gcloud-office`.

For Zeus to see and use a branch, the branch must provide:

- Tailscale identity: hostname `openclaw-<branch>` and a `100.x.y.z` IP.
- HQ registry entry via `gcloud-office/scripts/publish_branch_registry.py`.
- Delegate receiver at `http://100.x.y.z:8780/v1/delegate`.
- Branch report support: `GET /v1/delegate`.
- Branch Kanban support: `GET /v1/kanban`.
- Shared delegation token configured in Zeus as
  `OPENCLAW_<BRANCH>_DELEGATE_TOKEN`.

Zeus combines:

- Live HQ registry: `http://openclaw-hq:8781/v1/branches`.
- Stable Hermes inventory: `~/.hermes/openclaw-tools/openclaw-fleet.yaml`.
- Secrets in Hermes: `~/.hermes/.env`.

Expected validation from Zeus:

```text
openclaw_registry_branches()
openclaw_list_offices(include_live=true)
openclaw_branch_report("<branch>")
openclaw_delegate_task("<branch>", "<coordinator>", "Responde exactamente: OK_<BRANCH>", dry_run=true)
openclaw_delegate_task("<branch>", "<coordinator>", "Responde exactamente: OK_<BRANCH>")
```

Troubleshooting:

- Visible in Tailscale but missing in Zeus: publish/update the HQ registry.
- Agents visible but `token_configured=false`: add the Hermes env token.
- `GET /v1/delegate` returns `501`: branch receiver is old; update `branch_inbox`.
- POST returns `401`: receiver is alive but token mismatch.
- POST times out: receiver accepted the task but local agent/gateway did not finish.

Canonical runbooks:

- `gcloud-office/docs/openclaw-branch-kanban.md`
- `gcloud-office/openclaw-office/docs/09-RUNBOOK-NUEVOS-NODOS.md`
