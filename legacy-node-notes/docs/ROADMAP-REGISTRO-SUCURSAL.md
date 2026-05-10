# Roadmap — registro y operación de una sucursal (nodo OpenClaw)

| Campo | Valor |
| --- | --- |
| Versión | 1.0.2 |
| Fecha (UTC) | 2026-05-05 |
| Alcance | Patrón multi-sucursal con HQ en GCP (Kaspar) y nodos **independientes** (solo LLM en la nube) |
| GCP (referencia) | Proyecto `su-office-2030`, VM `openclaw-gateway-01` en `us-central1-a`. Para Cloud SQL: API **Admin** `sqladmin.googleapis.com` (la `sql-component` no sustituye a Admin). Registro: Terraform `enable_cloudsql` y `KASPAR_REGISTRY_DSN` según `gcloud-office/env/kaspar-registry.env.example`. |

## Changelog

- **1.0.2 (2026-05-05):** Aclara autoridad de `branch_label`, diferencia entre registry SQL, FLEET y ENV local generado; añade troubleshooting para Miami/nodos nuevos cuando el env no carga.
- **1.0.1 (2026-04-25):** Tabla de referencia de proyecto y API SQL; alineado con repositorio `gcloud-office` (Terraform, env de registro).
- **1.0.0 (2026-04-24):** Primer documento: roles Gateway vs MCP, canal de control, FLEET, checklist de una nueva rama, descarte de Ollama en sucursal.

---

## 1. Aclaración: Gateway, MCP y “quién habla con quién”

- **OpenClaw Gateway (por sucursal):** servicio de tu nodo (p. ej. `ws://127.0.0.1:18792` en loopback) que concentra sesiones de agentes, Office, autenticación con token, etc. **Cada sucursal tiene el suyo**; es el *runtime* local del nodo.
- **MCP (Model Context Protocol):** protocolo de **herramientas** que el modelo usa (stdio o transporte análogo). **No sustituye al gateway.**
- **Servidor MCP de Kaspar (`kaspar-tools` / similar en HQ):** vive en el entorno de **Kaspar (HQ)** y le da herramientas a **ese** orquestador (`delegate_to_agent`, `fleet_status`, etc.). Eso **no** reemplaza la necesidad de un **mecanismo concreto** para que esas tools ejecuten trabajo **en otra máquina** (hoy el código de delegación local corre `openclaw agent` en el mismo host; la **opción 1** del pilar B sería: implementar en esa tool un **cliente** hacia el **gateway** de la sucursal, o un bus intermedio).
- **Conclusión para tu pregunta 1:** Exponer **cada** sucursal con un **gateway seguro** hacia un canal controlado hacia tu GCP (VPN, Tailscale, IAP+SSH, mTLS, etc.) es razonable a nivel **infra**; **sí hace falta** definir **cómo** Kaspar (en HQ) invoca tareas allí. Eso puede ser:
  - **A)** Llamada remota al API/WebSocket del gateway de sucursal (según exponga el producto), **o**
  - **B)** Un servicio intermedio mínimo (cola, relay) **sin** mezclar con el tráfico de LLM a Anthropic/Gemini.
  El gateway **sí** es el punto lógico de “donde viven” los agentes de esa sucursal; el **MCP de Kaspar** es la capa de “herramientas de orquestación” en HQ que **puede** llamar a esos destinos **si** lo implementáis explícitamente. No asumáis que, sin código/contrato, el gateway y el MCP de otra instancia se “alinean” solos.

---

## 2. Visión: nodos independientes + canal de control con Kaspar

- **Independencia de nodo:** configuración, `openclaw.json` por perfil, secretos, modelos y Office **por sucursal**; el HQ **no** debe requerir dependencia *runtime* compartida (como vuestro already doc de Sicilia).
- **Canal de control unico (conceptual):** un **flujo fijado** (herramientas de Kaspar + `FLEET.yml` + políticas) por el que Kaspar **ve** qué ramas existen, **prioriza** y **delega** según carga, coste y especialización.
- Ese “canal” puede materializarse como **FLEET + métricas + (futuro) remoting seguro**; no implica mezclar tráfico de **proveedores LLM** con el túnel de **control** (mantener tráfico LLM directo a la nube, como en Sicilia).

---

## 3. Descarte de Ollama en sucursal (p. ej. Miami)

- **Criterio:** modelos locales con rendimiento inadecuado → **no** construir puentes `ollama_bridge`, ni FLEET que sugiera `ollama/...` como “recurso preferido” de esa rama, ni probes de “online” basados en Ollama.
- **Acciones típicas (cuando toque editar FLEET/policies en el repo de HQ, no en este archivo):**  
  - Sustituir en agentes de rama por **identificadores de modelo cloud** alineados con vuestro catálogo.  
  - Ajustar `cost_policy` / `prefer` para dejar de priorizar `local (ollama via …)`.  
  - Ajustar `fleet_status` (en código) para **no** usar solo el puente Ollama como señal de “rama online” para esas sucursales (health vía Office/gateway, ping seguro, etc.).

Esto deja a Miami u otras **como nodo de solo proveedores LLM** iguales en forma a Sicilia, salvo recursos reales (GPU desaprovechada queda documentada, no forzáis GPU para el stack LLM).

---

## 4. Patrón fijo: registrar una **nueva** sucursal (checklist)

Usad esto como **roadmap** cada vez que suméis una tercera o cuarta rama. Orden sugerido:

| Fase | Qué se hace | Dónde / artefacto |
| --- | --- | --- |
| A | Definir `node_id` único, nombres de agentes y convención de naming (evitar colisión con otras ramas) | `FLEET.yml` (repo HQ / workspace Kaspar) |
| B | Onboarding del nodo: perfil OpenClaw dedicado, gateway loopback, Office, `SecretRef` a `.env` / UI, **sin** Ollama si la política es cloud-only | Nodo (documentación tipo `onboard-sicilia-prompt.md` por rama) |
| C | Conectar “visibilidad” a Kaspar: entrada en `branches.<id>` con agentes, límites, `credentials_scope` simbólico | `FLEET.yml` |
| D | (Cuando el remoting esté) Implementar/validar la **línea de delegación** HQ → nodo (API gateway, cola, o SSH con allowlist) | Código `kaspar-tools` + red |
| E | Aprobación de **devices** / identidad hacia el gateway de HQ **solo** si vuestro diseño de pairing lo pide; no mezclar con LLM | Procedimientos gcloud/SSH en VM HQ |
| F | Probar: `fleet_status` refleja la rama; prueba de delegación end-to-end; logs de `metrics` | Operación + monitorización |
| G | Documentar excepciones (coste, horario, tareas críticas → council en HQ) | `PLAYBOOK` / `routing_rules` en FLEET |

**Plantilla mínima de bloque `branches.<nueva>` (conceptual, no copy-paste ciego):**  
`node_id`, `display_name`, `agents` (id → `model` cloud + `role`), `max_concurrent_tasks`, `credentials_scope` informativo, notas de hardware (p. ej. `gpu: null`).

---

## 5. Autoridad de etiquetas, registry y ENV local

Esta sección evita la confusión vista al alinear Miami: hay **tres nombres parecidos**, pero tienen autoridad y uso distintos.

| Concepto | Fuente canónica | Se guarda en DB | Se materializa en ENV | Uso |
| --- | --- | --- | --- | --- |
| `branch_id` / `node_id` | Clave `branches.<id>` y `node_id` en `FLEET.local.yml` | Sí, como `branch_nodes.branch_id` / `node_id` | No, salvo variables operativas como `OPENCLAW_BRANCH` | Identidad técnica: `miami`, `sicilia`; debe coincidir con `target.branch`, `DELEGATE_BRANCH`, perfil OpenClaw y nombres de servicios. |
| `display_name` | `branches.<id>.display_name` en FLEET | Sí, como `branch_nodes.display_name` | Sí, como `VITE_BRANCH_LABEL` en `.env.production` generado | Nombre humano canónico de la sucursal. El neon debe mostrar `SITIOUNO OFFICE - {DISPLAY_NAME}`, por ejemplo `SITIOUNO OFFICE - MIAMI`. |
| `branch_label` visual de Office | Alias legado en `branches.<id>.office.branch_label` | Sí, dentro de `branch_nodes.metadata.office.branch_label` si existe | Solo compatibilidad | Debe coincidir con `display_name`; no usar `Sucursal Miami` si `display_name` es `Miami`. |
| `KASPAR_BRANCH_COORDINATOR_LABEL` | ENV del MCP local de sucursal | No | Sí, en el entorno del MCP | Texto usado solo en `advisor_consult` para decir quién consulta al asesor; no cambia la UI ni el registry. |

Flujo correcto para la etiqueta visual:

1. El nodo define en `FLEET.local.yml`:

   ```yaml
   branches:
     miami:
       display_name: "Miami"
       node_id: miami
       coordinator_agent_id: murphy
       office:
         title: "SitioUno Office"
         branch_label: "Miami" # opcional/legado; debe coincidir con display_name
   ```

2. El nodo publica ese bloque al registry:

   ```bash
   python3 ~/gcloud-office/scripts/publish_branch_registry.py \
     --branch miami \
     --fleet ~/openclaw-workspaces/murphy/FLEET.local.yml \
     --metrics-db ~/.openclaw-miami/metrics/metrics.db \
     --env ~/.config/kaspar-registry.env
   ```

3. El nodo vuelve a leer desde SQL/registry y genera el env local del Office:

   ```bash
   python3 ~/gcloud-office/scripts/sync_node_from_registry.py \
     --branch miami \
     --env ~/.config/kaspar-registry.env \
     --office-env ~/openclaw-workspaces/murphy/openclaw-office/.env.production
   ```

4. El Office custom se reconstruye/reinicia para que Vite compile:

   ```bash
   cd ~/openclaw-workspaces/murphy/openclaw-office
   npm install --no-audit --no-fund
   npm run build --if-present
   ```

**Regla:** no editar `VITE_BRANCH_LABEL` a mano como fuente de verdad. Es un artefacto generado desde el registry. Si el label no aparece, revisar publicación/sincronización antes de tocar UI.

### Si el ENV "no carga"

Los scripts de registry cargan el archivo indicado con `--env`; por defecto usan `~/.config/kaspar-registry.env`. Para nodos fuera de VPC (Miami/Sicilia), ese archivo debe contener:

```bash
KASPAR_REGISTRY_BASE_URL=https://fleet-registry-api-REPLACE_ME.run.app
KASPAR_REGISTRY_API_TOKEN=replace-with-node-or-bootstrap-registry-token
KASPAR_REGISTRY_ACTOR=capablanca
KASPAR_REGISTRY_SOURCE=miami
```

Notas importantes:

- `KASPAR_REGISTRY_DSN` es para HQ/Cloud Run o entornos con acceso directo a Cloud SQL; un nodo físico normalmente usa `KASPAR_REGISTRY_BASE_URL` + `KASPAR_REGISTRY_API_TOKEN`.
- Si el script imprime `registry API env missing`, el archivo no existe, no se pasó con `--env`, no tiene esas variables, o el proceso ya tenía variables vacías/exportadas que el loader no sobrescribió.
- `sync_node_from_registry.py` usa `os.environ.setdefault`; si hay una variable incorrecta ya exportada, el archivo no la reemplaza. Usar una shell limpia o ejecutar `unset KASPAR_REGISTRY_BASE_URL KASPAR_REGISTRY_API_TOKEN` antes de cargar.
- El env de proveedores LLM (`~/.config/openclaw/providers.env`) es separado y no resuelve `branch_label`.
- El env del receptor (`~/.config/<branch>-delegate-receiver.env`) es separado y no resuelve `branch_label`.

---

## 6. Referencias cruzadas

- `onboard-sicilia-prompt.md` en este repo — ejemplo concreto de nodo **Sicilia** (sin GPU, reglas y puertos).  
- **Contrato de delegación v1 (HQ ↔ sucursal):** `docs/contract-branch-delegation-v1.md` (mismo texto en gcloud-office).  
- **Plan de implementación:** `docs/plans/2026-04-24-hq-branch-secure-delegation.md`  
- Repositorio de oficina **gcloud-office:** `FLEET.yml` canónico en workspace Kaspar, `mcp-tools/kaspar-tools/server.py` (comportamiento actual de `delegate`, `node_exec`, `fleet_status`).  
- OpenClaw: [docs.openclaw.ai](https://docs.openclaw.ai) (gateway, perfiles, secretos, MCP).

---

*Este documento se versiona con el repositorio; al añadir una sucursal real, actualizar versión, fecha y Changelog con el identificador de rama (p. ej. `sicilia-2026-Q2`).*
