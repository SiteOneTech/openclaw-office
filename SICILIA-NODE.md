# Nodo OpenClaw — Sicilia (estado de instalación)

| Campo   | Valor        |
| ------- | ------------ |
| Versión | 1.0.1        |
| Fecha   | 2026-05-05   |
| Perfil  | `sicilia`    |
| OpenClaw CLI | 2026.4.21 |

## Resumen

- **Perfil aislado:** `~/.openclaw-sicilia/` (sin dependencia runtime con HQ).
- **Gateway:** `ws://127.0.0.1:18792` (loopback), servicio `openclaw-gateway-sicilia.service` (systemd user).
- **Office UI:** `http://127.0.0.1:5183/`, servicio `openclaw-office-sicilia.service`.
- **Agentes (6):** Cesar (default), Seneca, Marco Aurelio, Tacito, Ovidio, Plinio — sin `main`. El agente **cicerone** se eliminó localmente para no confundir con el asesor **Cicerón** de HQ.
- **Repo compartido:** `~/gcloud-office` (clone de `sitiouno/gcloud-office`).
- **MCP:** `sicilia-tools` → `~/.local/share/openclaw-mcp/sicilia-tools/server.py` + `FLEET.local.yml` en workspace de Cesar.
- **Restricciones del prompt canónico:** no `agents.defaults.cliBackends.claude-cli`, no Ollama, no túneles; **cumplido** (config sin `cliBackends`).

## Claves de API (operador)

En **OpenClaw 2026.4.21** el gateway **no inicia** si los `SecretRef` a `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` están vacíos. Se dejaron **marcadores no secretos** en `~/.openclaw-sicilia/.env` para que resuelva y el servicio arranque; el operador debe **sustituirlos** por claves reales (idealmente vía **Settings → AI Providers** en el Office) y reiniciar el gateway si hace falta.

## Diferencias respecto a `onboard-sicilia-prompt.md` (errata)

1. **Paso 4 (providers):** el script Python del prompt usa `"api": "anthropic"` y listas de modelos inexistentes; el esquema actual exige `api` tipo `anthropic-messages` / `openai-responses` / `google-generative-ai`, arreglo `models: [...]` y `secrets.providers.default` para env. La configuración aplicada está en `~/.openclaw-sicilia/openclaw.json` y valida con `openclaw --profile sicilia config validate`.
2. **Paso 10 (systemd):** el `ExecStart` debe usar `gateway run` (no solo `gateway …`). `node` no está en `/usr/bin` (solo **nvm**); las units incluyen `PATH` con `~/.nvm/versions/node/v22.22.2/bin` y `ExecStart` con ruta absoluta a los binarios en `~/.npm-global/`.
3. **`.env` vacío:** ver sección "Claves de API" arriba; el prompt asumía gateway sin claves, pero esta versión falla en resolución de secretos.
4. **Templates:** en `gcloud-office` no existen `agent-templates/cesar|seneca|…`; se copiaron archivos desde `agent-templates/ciceron` al workspace de **cicerone** como respaldo. La identidad mostrada de Cicerone puede reflejar el template (p. ej. "Cicerón" en `IDENTITY.md`); ajustar en repo si se desea alineación exacta con nombres del prompt.
5. **`curl`:** no está instalado en el sistema; comprobación HTTP de Office hecha con Python (`urllib`).

## Comandos útiles

```bash
systemctl --user status openclaw-gateway-sicilia.service
journalctl --user -u openclaw-gateway-sicilia.service -n 50 --no-pager
openclaw --profile sicilia agents list
openclaw --profile sicilia doctor
```

## Delegación HQ → Sicilia (v1) — operativo en esta máquina

- **Receptor HTTP:** `systemctl --user status openclaw-delegate-sicilia.service` — `POST http://127.0.0.1:8780/v1/delegate` (contrato v1, token en `~/.config/sicilia-delegate-receiver.env`, permisos 600).
- **Túnel hacia la VM:** `systemctl --user status sicilia-hq-delegate-tunnel.service` — en `openclaw-gateway-01`, `127.0.0.1:18780` reenvía a este receptor (IAP + SSH reverse). Sin el túnel, Kaspar en HQ no alcanza el nodo.
- **En la VM:** `FLEET.yml` de Kaspar incluye `branches.sicilia`; MCP carga `hq-delegate.env` vía `run-kaspar-mcp.sh` (mismo token que el receptor).

## Branding de Office y etiquetas de sucursal

La etiqueta visual de la sucursal **no** se define manualmente en el Office ni por `KASPAR_BRANCH_COORDINATOR_LABEL`.

Fuente canónica:

```yaml
branches:
  sicilia:
    display_name: "Sicilia"
    node_id: sicilia
    office:
      title: "SitioUno Office"
      branch_label: "Sucursal Sicilia"
```

Flujo aplicado:

1. `FLEET.local.yml` define `branches.sicilia.office.branch_label`.
2. `publish_branch_registry.py` publica ese bloque a `branch_nodes.metadata.office` en el registry.
3. `sync_node_from_registry.py` lee el registry y genera `.env.production` para el Office custom:

   ```bash
   VITE_OFFICE_TITLE=SitioUno Office
   VITE_BRANCH_LABEL=Sucursal Sicilia
   ```

4. El Office custom debe reconstruirse/reiniciarse para que Vite compile esos valores.

Variables separadas que suelen confundirse:

- `KASPAR_BRANCH_COORDINATOR_LABEL`: solo cambia el texto del prompt de `advisor_consult`; por defecto `Cesar` en Sicilia y `Murphy` en Miami.
- `KASPAR_REGISTRY_BASE_URL` y `KASPAR_REGISTRY_API_TOKEN`: permiten publicar/leer el registry desde nodos fuera de VPC.
- `~/.config/openclaw/providers.env`: contiene API keys LLM; no controla la etiqueta del Office.
- `~/.config/sicilia-delegate-receiver.env`: controla receptor de delegación; no controla la etiqueta del Office.

## Pendiente (operador / HQ)

- (a) Pairing del device de Sicilia contra HQ y aprobación en VM `openclaw-gateway-01` (ver prompt canónico).
- Sustituir placeholders en `~/.openclaw-sicilia/.env` por API keys reales.
- Si el túnel SSH se cae (reboot, red), `systemctl --user restart sicilia-hq-delegate-tunnel.service`.

---

*Changelog: 1.0.1 — aclara fuente de `branch_label`, registry y ENV generado. 1.0.0 — registro inicial post-onboard automatizado.*
