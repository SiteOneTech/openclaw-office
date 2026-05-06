# Prompt canónico — Onboarding sucursal Sicilia

Pegá al agente IA que corre en la workstation de Sicilia el bloque entre `---START PROMPT---` y `---END PROMPT---`. Después seguí las **Notas para el operador** al final del archivo.

Esta sucursal **no tiene GPU** → todos los agentes usan modelos cloud (Anthropic / OpenAI / Google).

> **Nota de alineación 2026-05-05:** este prompt conserva el onboarding original de Sicilia, pero el patrón actual validado para nodos nuevos está en `~/gcloud-office/README-NODOS-IA.md` y `~/gcloud-office/openclaw-office/docs/09-RUNBOOK-NUEVOS-NODOS.md`. Para Miami u otra sucursal, usar esos runbooks como fuente principal. En particular:
>
> - La etiqueta visual del Office (`VITE_BRANCH_LABEL`) viene de `branches.<branch>.office.branch_label` en `FLEET.local.yml`, se publica al registry SQL y se genera en `.env.production` con `sync_node_from_registry.py`.
> - `KASPAR_BRANCH_COORDINATOR_LABEL` no es la etiqueta del Office; solo nombra al coordinador dentro del prompt de `advisor_consult`.
> - En OpenClaw 2026.4.21, los proveedores LLM deben quedar en un env local `0600` cargado por los servicios; no asumir que un `.env` vacío basta para arrancar si hay `SecretRef` activos.
> - Para nodos fuera de VPC, `~/.config/kaspar-registry.env` debe contener `KASPAR_REGISTRY_BASE_URL` y `KASPAR_REGISTRY_API_TOKEN`; si falta, `publish_branch_registry.py` / `sync_node_from_registry.py` reportan `registry API env missing`.

---START PROMPT---

Sos un agente DevOps. Tu tarea: registrar esta workstation como la sucursal **Sicilia** de un sistema OpenClaw Office distribuido. HQ-Cloud ya existe en GCP; vos solo montás este nodo como OpenClaw **independiente**, sin dependencias runtime con HQ.

## Arquitectura — reglas duras no-negociables

1. **Esta sucursal es un OpenClaw completamente independiente.** No hay dependencia runtime con HQ-Cloud.
2. HQ solo se usa para: (a) aprobar pairing del device, (b) permitirle a Kaspar (el orquestador de HQ) invocar estos agentes via su MCP tool `delegate_to_agent`.
3. **NO configurés `agents.defaults.cliBackends.claude-cli`** — bug conocido en OpenClaw 2026.4.20 que spawna un subprocess Claude CLI de ~500MB por turn y causa latencias de 120s+.
4. **NO instales Ollama**. Sicilia no tiene GPU; todos los agentes usan providers cloud.
5. **NO creés reverse tunnels** entre HQ y esta sucursal. Tráfico LLM debe ir directo al provider cloud.
6. Seguí la documentación oficial: <https://docs.openclaw.ai>.

## Contexto HQ-Cloud (ya existente)

- VM: `openclaw-gateway-01`, proyecto GCP `su-office-2030`, zona `us-central1-a`
- Gateway en loopback `:18789` de esa VM, user service `openclaw`
- Coordinador de HQ: **Kaspar** (modelo `anthropic/claude-opus-4-6`)

## Inputs que necesitás del operador (pedí todo en una respuesta, antes de empezar)

1. **gcloud autenticado** con cuenta que tenga acceso al proyecto `su-office-2030`: verificá con `gcloud auth list`. Si no, que corra `gcloud auth login`.
2. **gh CLI autenticado** para clonar el repo privado: verificá con `gh auth status`. Si no, que corra `gh auth login`.

**API keys cloud**: el operador NO te las pasa por chat. Las va a cargar después vía la interfaz Office UI (Settings → AI Providers). Vos solo dejás los providers registrados; las keys se cargan en la UI.

## Pasos — idempotentes, en orden

### Paso 0 · Pre-requisitos del sistema
```bash
which node && node -v   # >= 20
which python3 && python3 --version   # >= 3.11
which gcloud
which git
```
Si falta alguno, instalarlo con el package manager del OS antes de seguir.

### Paso 1 · Instalar OpenClaw CLI (oficial)
```bash
# Método oficial recomendado por docs.openclaw.ai/install
npm install --prefix ~/.npm-global openclaw@latest
```
Agregar al final de `~/.bashrc` (o `~/.zshrc`) y volver a cargar:
```bash
export PATH="$HOME/.local/bin:$HOME/.npm-global/node_modules/.bin:$PATH"
```
```bash
source ~/.bashrc
openclaw --version   # debe imprimir 2026.4.x
```

### Paso 2 · Clonar el repo de la oficina
```bash
cd ~
gh repo clone sitiouno/gcloud-office
# Alternativa si gh no está: git clone https://github.com/sitiouno/gcloud-office.git
cd gcloud-office
ls agent-templates mcp-tools docs
```
Ese repo (privado, org `sitiouno`) provee: `agent-templates/` (templates SOUL/AGENTS/IDENTITY reutilizables) y `mcp-tools/kaspar-tools/server.py` (el MCP server multi-branch).

### Paso 3 · Profile `sicilia` aislado (alineado con docs.openclaw.ai/gateway/configuration-reference)
```bash
openclaw --profile sicilia config set gateway.mode local
openclaw --profile sicilia config set gateway.port 18792
openclaw --profile sicilia config set gateway.bind loopback
openclaw --profile sicilia config set agents.defaults.timeoutSeconds 300
openclaw --profile sicilia config set agents.defaults.skipBootstrap true
openclaw --profile sicilia config set agents.defaults.contextInjection continuation-skip
openclaw --profile sicilia config set agents.defaults.heartbeat --strict-json '{"every":"30m","activeHours":{"start":"00:00","end":"23:59"}}'
openclaw --profile sicilia config set plugins.entries.openrouter.enabled false
openclaw --profile sicilia config set plugins.entries.litellm.enabled false
openclaw --profile sicilia config validate
```

### Paso 4 · Registrar providers cloud
```bash
python3 <<'PY'
import json
from pathlib import Path
p = Path.home() / ".openclaw-sicilia" / "openclaw.json"
d = json.loads(p.read_text())
providers = d.setdefault("models", {}).setdefault("providers", {})
providers["anthropic"] = {
    "apiKey": {"source": "env", "provider": "default", "id": "ANTHROPIC_API_KEY"},
    "baseUrl": "https://api.anthropic.com",
    "api": "anthropic",
}
providers["openai"] = {
    "apiKey": {"source": "env", "provider": "default", "id": "OPENAI_API_KEY"},
    "baseUrl": "https://api.openai.com",
    "api": "openai",
}
providers["google"] = {
    "apiKey": {"source": "env", "provider": "default", "id": "GOOGLE_API_KEY"},
    "baseUrl": "https://generativelanguage.googleapis.com",
    "api": "google",
}
p.write_text(json.dumps(d, indent=2) + "\n")
print("ok")
PY
openclaw --profile sicilia config validate
```

### Paso 5 · Preparar env de proveedores

El patrón actual es mantener las API keys fuera de `openclaw.json`, en un archivo local `0600` cargado por systemd. Si las keys todavía no existen, crear placeholders no secretos solo para que el servicio valide; el operador debe reemplazarlos fuera de git.

```bash
mkdir -p ~/.config/openclaw ~/.openclaw-sicilia
umask 077
touch ~/.openclaw-sicilia/.env
chmod 600 ~/.openclaw-sicilia/.env
touch ~/.config/openclaw/providers.env
chmod 600 ~/.config/openclaw/providers.env
```

Los providers del Paso 4 quedan configurados con `SecretRef` leyendo `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`. En el patrón validado, `openclaw-gateway-<branch>.service` carga `~/.config/openclaw/providers.env`; `~/.openclaw-<branch>/.env` puede quedar como stub, pero no debe ser la única fuente si systemd no la carga.

### Paso 6 · Registrar agentes

**⇣ TABLA DE AGENTES (editá solo esto si querés cambiar nombres, roles o modelos) ⇣**

| ID técnico | Nombre visible | Rol | Modelo |
|---|---|---|---|
| `cesar` | Cesar | coordinador (**default**) | `anthropic/claude-sonnet-4-6` |
| `seneca` | Seneca | advisor / planner | `google/gemini-3.1-pro-preview` |
| `cicerone` | Cicerone | coder preciso | `anthropic/claude-haiku-4-5` |
| `aurelio` | Marco Aurelio | reasoner profundo | `anthropic/claude-sonnet-4-6` |
| `tacito` | Tacito | generalista | `anthropic/claude-haiku-4-5` |
| `ovidio` | Ovidio | triage rápido / multimodal | `google/gemini-3.1-flash` |
| `plinio` | Plinio | long-context / análisis | `google/gemini-3.1-pro-preview` |

Emojis sugeridos (editables): cesar=♔ · seneca=📜 · cicerone=✒️ · aurelio=🧠 · tacito=📯 · ovidio=⚡ · plinio=📚

Ejecutá este bloque (reemplazá la tabla si editaste):
```bash
mkdir -p ~/openclaw-workspaces/{cesar,seneca,cicerone,aurelio,tacito,ovidio,plinio}

# Coordinador (default)
openclaw --profile sicilia agents add cesar --model anthropic/claude-sonnet-4-6 \
  --non-interactive --workspace ~/openclaw-workspaces/cesar
openclaw --profile sicilia agents set-identity --agent cesar --name "Cesar" --emoji "♔" --theme claw

# Advisor
openclaw --profile sicilia agents add seneca --model google/gemini-3.1-pro-preview \
  --non-interactive --workspace ~/openclaw-workspaces/seneca
openclaw --profile sicilia agents set-identity --agent seneca --name "Seneca" --emoji "📜" --theme knot

# Workers
openclaw --profile sicilia agents add cicerone --model anthropic/claude-haiku-4-5 \
  --non-interactive --workspace ~/openclaw-workspaces/cicerone
openclaw --profile sicilia agents set-identity --agent cicerone --name "Cicerone" --emoji "✒️" --theme claw

openclaw --profile sicilia agents add aurelio --model anthropic/claude-sonnet-4-6 \
  --non-interactive --workspace ~/openclaw-workspaces/aurelio
openclaw --profile sicilia agents set-identity --agent aurelio --name "Marco Aurelio" --emoji "🧠" --theme claw

openclaw --profile sicilia agents add tacito --model anthropic/claude-haiku-4-5 \
  --non-interactive --workspace ~/openclaw-workspaces/tacito
openclaw --profile sicilia agents set-identity --agent tacito --name "Tacito" --emoji "📯" --theme claw

openclaw --profile sicilia agents add ovidio --model google/gemini-3.1-flash \
  --non-interactive --workspace ~/openclaw-workspaces/ovidio
openclaw --profile sicilia agents set-identity --agent ovidio --name "Ovidio" --emoji "⚡" --theme claw

openclaw --profile sicilia agents add plinio --model google/gemini-3.1-pro-preview \
  --non-interactive --workspace ~/openclaw-workspaces/plinio
openclaw --profile sicilia agents set-identity --agent plinio --name "Plinio" --emoji "📚" --theme claw
```

### Paso 7 · Marcar Cesar como default y eliminar `main`
```bash
python3 <<'PY'
import json
from pathlib import Path
p = Path.home() / ".openclaw-sicilia" / "openclaw.json"
d = json.loads(p.read_text())
for a in d["agents"]["list"]:
    a.pop("default", None)
    if a["id"] == "cesar":
        a["default"] = True
# eliminar main (OpenClaw lo crea por defecto; con Cesar default no hace falta)
d["agents"]["list"] = [a for a in d["agents"]["list"] if a["id"] != "main"]
p.write_text(json.dumps(d, indent=2) + "\n")
print("ok")
PY
openclaw --profile sicilia agents list   # cesar debe aparecer (default)
```

### Paso 8 · Poblar workspaces (SOUL / AGENTS / IDENTITY + BOOTSTRAP neutro)

Copiá los templates base del repo — adaptá nombres y modelos. Si el operador tiene templates específicos (ej. para "Cesar" con su personalidad), que los coloque en `agent-templates/cesar/` del repo antes de correr esto.

```bash
REPO=~/gcloud-office
for agent in cesar seneca cicerone aurelio tacito ovidio plinio; do
  # BOOTSTRAP.md neutro (evita el template default de OpenClaw que dice "Hey. I just came online")
  cat > ~/openclaw-workspaces/$agent/BOOTSTRAP.md <<'MD'
# BOOTSTRAP.md
Tu identidad está en IDENTITY.md / SOUL.md / AGENTS.md de este workspace. Leélos si hace falta y respondé al operador directo. No actuás como recién despertado.
MD
  # Templates de identidad si existen en el repo
  for f in AGENTS.md SOUL.md IDENTITY.md; do
    [ -f "$REPO/agent-templates/$agent/$f" ] && cp "$REPO/agent-templates/$agent/$f" ~/openclaw-workspaces/$agent/$f
  done
done
ls ~/openclaw-workspaces/cesar/
```

### Paso 9 · MCP server local (`sicilia-tools`)
```bash
mkdir -p ~/.local/share/openclaw-mcp/sicilia-tools ~/.openclaw-sicilia/metrics
cp ~/gcloud-office/mcp-tools/kaspar-tools/server.py ~/.local/share/openclaw-mcp/sicilia-tools/server.py
chmod 755 ~/.local/share/openclaw-mcp/sicilia-tools/server.py

# Inicializar metrics.db (schema append-only)
python3 <<PY
import sqlite3
db = "$HOME/.openclaw-sicilia/metrics/metrics.db".replace("\$HOME", "$HOME")
con = sqlite3.connect(db)
con.executescript("""
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, event_type TEXT NOT NULL,
  task_id TEXT, branch TEXT, agent TEXT, duration_s REAL, tokens_in INTEGER,
  tokens_out INTEGER, cost_usd REAL, success INTEGER, notes TEXT);
CREATE INDEX IF NOT EXISTS ix_events_ts ON events(ts);
""")
con.commit(); con.close()
PY

# Registrar MCP server en profile
openclaw --profile sicilia mcp set sicilia-tools '{
  "command": "python3",
  "args": ["'$HOME'/.local/share/openclaw-mcp/sicilia-tools/server.py"],
  "env": {
    "KASPAR_SERVER_MODE": "sicilia",
    "KASPAR_FLEET_PATH": "'$HOME'/openclaw-workspaces/cesar/FLEET.local.yml",
    "KASPAR_METRICS_DB": "'$HOME'/.openclaw-sicilia/metrics/metrics.db",
    "KASPAR_TOOLS_LOG": "'$HOME'/.openclaw-sicilia/metrics/sicilia-tools.log",
    "KASPAR_ADVISOR_AGENT": "seneca",
    "OPENCLAW_PROFILE": "sicilia",
    "OPENCLAW_BIN": "'$(which openclaw)'"
  }
}'
```
Notas técnicas:
- `KASPAR_SERVER_MODE="sicilia"` (o `miami` / `branch`) activa el modo **sucursal**: sin `council`/`shadow`, con `advisor_consult` hacia el agente de `KASPAR_ADVISOR_AGENT` (en Sicilia: **seneca**).
- `KASPAR_BRANCH_COORDINATOR_LABEL` (opcional) fija el nombre en el prompt al invocar al asesor; por defecto: Cesar en `sicilia`, Murphy en `miami`. **No** controla la etiqueta visual del Office.
- La etiqueta visual del Office se define en `FLEET.local.yml` bajo `branches.<branch>.office.branch_label`, se publica con `publish_branch_registry.py`, se lee desde SQL con `sync_node_from_registry.py` y termina como `VITE_BRANCH_LABEL` en `.env.production`.
- Registro de flota (opcional): en el `mcp set` añadí `KASPAR_REGISTRY_BASE_URL` (URL de Cloud Run) y `KASPAR_REGISTRY_API_TOKEN` (Secret `fleet-registry-api-token`) **solo** si no usás DSN; ver en el clon de **gcloud-office**: `scripts/deploy-fleet-registry-api.sh`, `env/kaspar-registry.env.example` y el índice de documentación en `openclaw-office/docs/INDEX.md`.
- Si el operador no tiene `FLEET.local.yml` de Sicilia todavía, crealo con una estructura mínima:
```bash
cat > ~/openclaw-workspaces/cesar/FLEET.local.yml <<'YML'
version: 1
branch: sicilia
hq:
  name: "Sicilia (local)"
  agents:
    cesar:      {role: branch-coordinator, model: anthropic/claude-sonnet-4-6}
    seneca:     {role: branch-advisor,     model: google/gemini-3.1-pro-preview}
branches:
  sicilia:
    display_name: "Sicilia"
    node_id: sicilia
    agents:
      cicerone: {model: anthropic/claude-haiku-4-5, role: coder}
      aurelio:  {model: anthropic/claude-sonnet-4-6, role: reasoner}
      tacito:   {model: anthropic/claude-haiku-4-5, role: generalist}
      ovidio:   {model: google/gemini-3.1-flash,    role: triage}
      plinio:   {model: google/gemini-3.1-pro-preview, role: long-context}
YML
```

### Paso 10 · Systemd user units (gateway + Office)
```bash
# Gateway service (carga .env con las API keys)
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/openclaw-gateway-sicilia.service <<'UNIT'
[Unit]
Description=OpenClaw Gateway local (Sicilia)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=HOME=%h
Environment=PATH=%h/.npm-global/node_modules/.bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=%h/.openclaw-sicilia/.env
ExecStart=/usr/bin/env openclaw --profile sicilia gateway --port 18792 --bind loopback
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now openclaw-gateway-sicilia.service

# Esperar a que el gateway levante y escribir token para el Office
until ss -tln 2>/dev/null | grep -q ":18792 "; do sleep 1; done

# Instalar Office UI oficial
npm install --prefix ~/.npm-global @ww-ai-lab/openclaw-office@latest

# Extraer token del gateway para el Office
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.openclaw-sicilia/openclaw.json'))['gateway']['auth']['token'])")
mkdir -p ~/.config/openclaw
umask 077
printf 'OPENCLAW_GATEWAY_TOKEN=%s\n' "$TOKEN" > ~/.config/openclaw/office-sicilia.env

# Office service
cat > ~/.config/systemd/user/openclaw-office-sicilia.service <<'UNIT'
[Unit]
Description=OpenClaw Office local — Sicilia
After=openclaw-gateway-sicilia.service
Requires=openclaw-gateway-sicilia.service

[Service]
Type=simple
Environment=HOME=%h
Environment=PATH=%h/.npm-global/node_modules/.bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=%h/.config/openclaw/office-sicilia.env
ExecStart=/usr/bin/env openclaw-office --host 127.0.0.1 --port 5183 --gateway ws://127.0.0.1:18792
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now openclaw-office-sicilia.service
```

### Paso 11 · Validación
```bash
# Agentes registrados — debe listar 7: cesar (default), seneca, cicerone, aurelio, tacito, ovidio, plinio
openclaw --profile sicilia agents list

# Proveedores con auth OK
openclaw --profile sicilia models status | head -40

# Puertos
ss -tln | grep -E ":18792|:5183"

# Office responde
curl -fsS http://127.0.0.1:5183/ -o /dev/null -w "sicilia office: HTTP %{http_code}\n"

# Diagnóstico completo
openclaw --profile sicilia doctor
```

El operador debería poder abrir `http://127.0.0.1:5183/` y ver a **Cesar** como agente default.

### Paso 12 · Reportar al operador
Cuando termines los pasos 1–11, avisale al operador:

> **Sicilia onboarded OK.** Gateway `:18792`, Office `http://127.0.0.1:5183`, 7 agentes registrados (Cesar default, Seneca advisor, + 5 workers cloud). Providers: Anthropic + OpenAI + Google con SecretRef a `.env`. MCP `sicilia-tools` activo. Falta: (a) pairing del device de Sicilia contra HQ (ver instrucciones del operador), (b) actualizar `FLEET.yml` de Kaspar en HQ para agregar `branches.sicilia`.

## Si algo falla — troubleshooting
- Config inválido: `openclaw --profile sicilia config validate`
- Gateway no arranca: `journalctl --user -u openclaw-gateway-sicilia.service -n 50 --no-pager`
- Office timeout: verificar que `$OPENCLAW_GATEWAY_TOKEN` en `office-sicilia.env` coincida con `gateway.auth.token` en `openclaw.json`
- Agentes no responden: probablemente falta una API key — verificá `~/.openclaw-sicilia/.env` y `openclaw --profile sicilia models status`
- "main cannot be deleted": ya lo resolvimos en Paso 7 editando el JSON directo; no correr `agents delete main`

Referencias oficiales:
- <https://docs.openclaw.ai/install>
- <https://docs.openclaw.ai/gateway/configuration-reference>
- <https://docs.openclaw.ai/cli/agents>
- <https://docs.openclaw.ai/gateway/secrets>

---END PROMPT---

## Notas para el operador (vos)

### Antes de pegar el prompt al agente de Sicilia

1. **gh CLI autenticado** en Sicilia con cuenta que tenga acceso a `sitiouno/gcloud-office` (privado). Si no, que corra `gh auth login` antes.
2. **Workstation Sicilia** con SSH funcional, un agente IA instalado (Claude Code, Codex, Cursor), y acceso internet para `npm install` y calls a providers cloud.
3. **API keys cloud**: las cargás vos directo en la UI del Office (`http://127.0.0.1:5183/` → Settings → AI Providers) **después** que el agente termine los 11 pasos. No se las pases por chat.

### Mientras el agente trabaja — preparar el pairing en HQ

El agente de Sicilia, cuando termine el Paso 10 y arranque el gateway, intentará pairear su device contra HQ (siempre que hayas puesto el token de HQ en su entorno; si no usás HQ hook desde el inicio, el pairing es solo al agregar Sicilia al FLEET de Kaspar).

Si querés que Kaspar pueda invocar agentes de Sicilia via `delegate_to_agent`, aprobá el pairing desde HQ:
```bash
gcloud compute ssh openclaw-gateway-01 --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo -u openclaw -H bash -lc "PATH=/home/openclaw/.npm-global/bin:\$PATH openclaw devices approve --latest"'
```

### Después que Sicilia termine — sumar Sicilia al FLEET de Kaspar

Editá `agent-templates/agent-0/FLEET.yml` en tu repo local, agregando bajo `branches:`:
```yaml
  sicilia:
    display_name: "Sicilia"
    node_id: sicilia
    hardware: {gpu: null, note: "cloud-only workers"}
    agents:
      cesar:    {role: branch-coordinator, model: anthropic/claude-sonnet-4-6}
      seneca:   {role: branch-advisor,     model: google/gemini-3.1-pro-preview}
      cicerone: {role: coder,              model: anthropic/claude-haiku-4-5}
      aurelio:  {role: reasoner,           model: anthropic/claude-sonnet-4-6}
      tacito:   {role: generalist,         model: anthropic/claude-haiku-4-5}
      ovidio:   {role: triage,             model: google/gemini-3.1-flash}
      plinio:   {role: long-context,       model: google/gemini-3.1-pro-preview}
```
Y pushealo al workspace de Kaspar en HQ:
```bash
tar czf /tmp/fleet.tgz -C agent-templates/agent-0 FLEET.yml
gcloud compute scp --tunnel-through-iap --zone=us-central1-a /tmp/fleet.tgz openclaw-gateway-01:/tmp/
gcloud compute ssh openclaw-gateway-01 --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo -u openclaw -H bash -lc "cd /srv/openclaw/agents/kaspar/workspace && tar xzf /tmp/fleet.tgz && rm /tmp/fleet.tgz"'
```
Eso le da a Kaspar visibilidad sobre Sicilia para poder delegar agentes vía MCP tools.

### Convenciones de naming para próximas sucursales

| Sucursal | Naming sugerido | Ejemplo coordinador / advisor |
|---|---|---|
| Miami | chess players | Murphy / Granmaster |
| Sicilia | romanos / italianos | Cesar / Seneca |
| Tokio | dioses griegos | Hermes / Apolo |
| Sydney | nórdicos | Odin / Loki |
| Toronto | emperadores bizantinos | Justiniano / Basilio |
| Cape Town | egipcios | Ra / Thoth |

Cada sucursal mantiene su set aislado para que no haya colisión de IDs técnicos entre nodos.
