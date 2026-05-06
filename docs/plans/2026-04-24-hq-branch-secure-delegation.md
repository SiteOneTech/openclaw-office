# HQ ↔ Sucursal (Sicilia primero) — delegación remota segura (Implementation Plan)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que Kaspar (OpenClaw en HQ, GCP) delegue tareas a agentes de una sucursal **independiente** (Sicilia: gateway propio, proveedores LLM y tools propios) mediante un **canal de control** seguro, con **contrato fijo** (autenticación, idempotencia, timeouts, correlación) — sin compartir runtime de LLM ni acoplamientos “raros” entre nodos. Miami se conecta **después** como segunda prueba siguiendo la misma guía.

**Architecture:** (1) **FLEET.yml** (HQ) sigue siendo el manifiesto de visibilidad; (2) el servidor MCP de Kaspar (`kaspar-tools`) deja de asumir que todo `agent_id` resuelve con `openclaw agent` **local** en la misma VM cuando el agente es de rama: en su lugar invoca un **cliente de delegación** que hable con el **gateway** de la sucursal o con una **cola** aprobada; (3) en la sucursal, el gateway (o un **adapter** mínimo co-localizado) expone un **endpoint de tareas** autenticado, idempotente, con límites; (4) tráfico **LLM a proveedores** permanece directo desde la sucursal, no a través de HQ. Alternativa a la cola: **solo WebSocket/HTTPS** hacia un relay en GCP; el plan prefere **diseñar** la interfaz y luego elige cola vs llamada directa según riesgo y SRE.

**Tech Stack:** OpenClaw 2026.4.x, Python 3.11+ (MCP `kaspar-tools`), `FLEET.yml` (YAML v3+), red GCP (IAP, VPC, Tailscale o mTLS a definir), repositorio `gcloud-office` (HQ) y documentación/artefactos de nodo en `openclaw-office-sicilia` (Sicilia). Tests: `pytest` para módulo nuevo de cliente/contract, pruebas de humo con gateway local.

**Referencias de skill:** al ejecutar, combinar con `docs/ROADMAP-REGISTRO-SUCURSAL.md` y `onboard-sicilia-prompt.md`. `skill-dispatching-parallel-agents`: el trabajo **puede** dividirse en **dos líneas** paralelas (equipo/yo en rama *HQ* vs *Sucursal*) **solo** cuando no compartan el mismo PR inicial de contrato (evitar merge hell); si no, secuencial por fases (contrato → HQ → nodo).

---

## Fase 0 — Conformidad y descubrimiento (sin código de producción)

### Task 0.1: Inventariar API del gateway OpenClaw para “correr un turno de agente” remotamente

**Files (lectura):**
- Revisar: [OpenClaw gateway remote / CLI](https://docs.openclaw.ai/gateway/remote) y `openclaw gateway call --help` en un entorno con perfil.
- Revisar: `openclaw agent --help` (local) para mapear parámetros mínimos (agent id, timeout, prompt).

**Step 1:** En máquina de dev o Sicilia, ejecutar:
`openclaw --profile sicilia gateway call --help` (si existe) o documentar RPC disponibles vía `openclaw gateway call health` y enumerar métodos.
**Step 2:** Anotar en un documento de diseño (apéndice) qué RPC encaja con “un turno con prompt estructurado + task_id”.

**Expected:** 1–2 páginas de notas bajo sección "Appendix: Gateway JSON-RPC surface" o issue enlazada.

**Commit (opcional):** `docs: gateway rpc survey for remote delegation` (si el repo acepta anexos técnicos).

---

### Task 0.2: Fijar el contrato de delegación (v1) — esquema JSON

**Files:**
- Create: `gcloud-office/docs/contract-branch-delegation-v1.md` (o en `openclaw-office-sicilia/docs/contract-v1.md` si HQ repo no aplica aún) — el plan asume un único `contract-v1` en **ambos** lados.
- Estructura mínima del **request**:
  - `version`: `"1"`
  - `task_id`: string (UUID, idempotency key)
  - `idempotency_key`: igual a `task_id` o duplicado explícito
  - `target`: `{ "branch": "sicilia", "agent_id": "cesar" }`
  - `input`: string (cuerpo de la tarea, ya con TASK-ID/PHASE si se desea)
  - `deadline_s`: int
  - `max_output_bytes`: int opcional
- **Response**:
  - `status`: `ok` | `error` | `timeout` | `rejected` | `idempotent_replay`
  - `output`, `stderr?`, `duration_s`, `metadata` (sin secretos)
- **Auth:** cabecera `Authorization: Bearer <token>` o `X-Openclaw-Delegation: <HMAC>` (decidir en 0.3).

**Step 1:** Escribir el markdown del contrato.
**Step 2:** Revisar con otra mente o PR interno.
**Step 3:** Commit: `docs: add branch delegation contract v1`.

---

### Task 0.3: Elegir transporte: A) HTTPS reverse proxy a gateway sucursal, B) cola (Pub/Sub) + pull en sucursal, C) híbrido

**Criterio:** mínima superficie, auditabilidad, no tunelar tráfico LLM.

| Opción | Pros | Contras |
|--------|------|---------|
| A HTTPS+WS a sucursal | Latencia baja, síncrono | Requiere red confiable a IP/hostname fijo, TLS |
| B Cola | Desacopla, reintentos | Más operación, consumidor en sucursal |
| C Híbrido (sync para probe, cola para largas) | Flexible | Más código |

**Step 1:** Selección documentada en el mismo `contract-v1` (sección "Transport").

**Commit:** `docs: document transport choice for v1`.

---

## Fase 1 — Nodo Sucursal (Sicilia): receptor de delegación

### Task 1.1: Definir superficie a implementar (preferencia: micro-servicio `delegate-receiver` o script controlado bajo mismo usuario que el gateway)

**Files:**
- Create (en repo que elijáis, idealmente `gcloud-office` o módulo en `mcp-tools/`): `branch-inbox/delegate_receiver.py` — **o** anotar que se usa solo `openclaw gateway` con plugin future.

**Step 1:** Decidir: **no** correr lógica arbitraria: solo `POST /v1/delegate` que valide request y dispara `subprocess` con `openclaw --profile sicilia agent --agent <id> --prompt ...` en **localhost** (misma máquina que el gateway) — aislamiento: usuario dedicado, `systemd` unit separada, bind `127.0.0.1:PORT` y **nginx/Tailscale** hacia afuera.

**Step 2:** Esquemas de validación: `pydantic` o `jsonschema` en Python 3.11+.

**Step 3:** Tests unitarios con payload válido/ inválido.

**Files test:**
- Create: `tests/test_delegate_receiver_validation.py`

**Example test:**

```python
import json
from branch_inbox import validate_request  # ajustar import real

def test_rejects_missing_task_id():
    err = validate_request({})
    assert err is not None
```

**Run:** `pytest tests/test_delegate_receiver_validation.py -v`  
**Expected (before impl):** FAIL (import/validate missing).

**Commit:** `feat(sicilia): add delegate request validation` (después de implementar validate).

---

### Task 1.2: Integración local en Sicilia: binario + perfil

**Command (run en nodo Sicilia):**

```bash
export PATH="$HOME/.local/bin:$HOME/.npm-global/node_modules/.bin:$PATH"
openclaw --profile sicilia agent --help
```

**Step 1:** Asegurar que `delegate_receiver` (o el adapter) use **exactamente** el mismo `OPENCLAW_BIN` y `--profile sicilia` que en `~/.config/systemd/user/openclaw-gateway-sicilia.service`.
**Step 2:** Variable de entorno `DELEGATION_TOKEN` o lectura de SecretRef hacia un archivo 0600 (no en git).

**Commit:** `chore: wire delegate receiver to openclaw profile sicilia`.

---

### Task 1.3: Apertura hacia “canal seguro a GCP”

**Ops (documentado, no en código aún en esta fase):** Tailscale, Cloud VPN, o IAP TCP forwarding hacia un **bastion**; el plan solo lista **requisitos**: TLS, allowlist de IPs, rate limit, logging sin payload sensible.

**File:**
- Add section to `SICILIA-NODE.md` o nuevo `docs/SICILIA-NETWORK-INGRESS.md` con checklist.

**Commit:** `docs: describe secure ingress for Sicilia delegate endpoint`.

---

## Fase 2 — HQ: cliente de delegación + cambio de `delegate_to_agent`

**Files:**
- Modify: `gcloud-office/mcp-tools/kaspar-tools/server.py` (función `tool_delegate_to_agent` y utilidades)
- Create: `gcloud-office/mcp-tools/kaspar-tools/remote_delegate.py` (cliente HTTP/WS, timeouts, reintentos idempotentes)

### Task 2.1: Tabla de rutas: `agent_id` → `local | branch:sicilia | branch:miami`

**Step 1:** En `server.py`, tras cargar FLEET, derivar un mapa `agent_id` → `branch` si está bajo `branches.*.agents` y `branch` nulo o `hq` para `hq.agents`.
**Step 2:** Si `agent_id` es remoto, **no** llamar `subprocess` local; llamar `remote_delegate.invoke(...)` con URL tomada de env `BRANCH_SICILIA_DELEGATE_URL` + token vault/env.

**Test:**
- Create: `tests/test_routing_map.py` — dado un YAML mínimo, el mapa clasifica a `cesar` como `sicilia`.

**Run:** `pytest tests/test_routing_map.py -v`

**Commit:** `feat(kaspar-tools): route branch agents to remote delegate client`.

---

### Task 2.2: `remote_delegate.py` — POST con `task_id` idempotente

**Step 1:** `httpx` o `urllib.request` con timeout, cabecera auth.
**Step 2:** Manejar HTTP 202/200 con cuerpo JSON según `contract-v1`.
**Step 3:** Reintentar solo en errores de red (no 4xx lógico).

**Test:** mock HTTP con `respx` o `httpretty` (añadir a dev dependencies si aceptado).

**Commit:** `feat(kaspar-tools): add remote delegate http client v1`.

---

### Task 2.3: Despliegue en VM `openclaw-gateway-01`

**Ops:** variables en `~/.config/openclaw` o `systemd` del usuario `openclaw`: `BRANCH_SICILIA_DELEGATE_URL`, `DELEGATION_HMAC_SECRET` o Bearer.

**No commit de secretos** — solo plantilla: `gcloud-office/env/hq-delegate.env.example`

**File:**
- Create: `gcloud-office/env/hq-delegate.env.example`

**Commit:** `docs: add env template for remote delegation from HQ`.

---

## Fase 3 — Alineación FLEET y poda de Ollama (narrativa)

### Task 3.1: Añadir `branches.sicilia` con agentes reales (sin cicerone duplicado)

**File:**
- Modify: `gcloud-office/.../FLEET.yml` en workspace Kaspar (misma estructura que [roadmap](docs/ROADMAP-REGISTRO-SUCURSAL.md))

**Step 1:** Sincronizar `agent_id` con nodo (cesar, seneca, aurelio, …).
**Step 2:** Añadir `delegate_endpoint: https://.../v1/delegate` (campo informativo o consumido por script).

**Commit:** `feat(fleet): add sicilia branch and delegate metadata`.

---

### Task 3.2: Poda Ollama / Miami (cuando apliquéis política unificada)

**Files:**
- Modify: `FLEET.yml` — quitar o comentar modelos `ollama/...` para agentes de rama, ajustar `cost_policy` y `fleet_status` probe (en Task 2.4 separado si afecta Python).

**Commit:** `refactor(fleet): deprecate local ollama for branch workloads`.

---

## Fase 4 — Pruebas de integración y observabilidad

### Task 4.1: E2E “HQ → mock receiver” (sin tocar Sicilia aún)

**Step 1:** Contenedor o `pytest` con servidor HTTP mock en loopback.
**Step 2:** Llamar `remote_delegate` desde un test con credenciales fake.

**Commit:** `test: e2e remote delegate against mock server`.

---

### Task 4.2: E2E real Sicilia (PoC) — checklist manual

**Checklist (documento):**
1. Sucursal: receiver arriba, token fuerte, gateway saludable.
2. Red: túnel seguro a GCP o Tailscale.
3. HQ: env cargado, `openclaw` Kaspar con MCP reloaded.
4. Ejecución: desde sesión de Kaspar, invocar tool `delegate_to_agent` con `cesar` y prompt corto.
5. Ver logs en ambos lados, métricas en `escriba_log` / DB.

**File:**
- Create: `docs/plans/2026-04-24-hq-sicilia-manual-poc.md` (o sección al final de este plan)

**Commit:** `docs: add manual PoC checklist for HQ-Sicilia`.

---

## Fase 5 — Miami (post-PoC Sicilia)

### Task 5.1: Repetir patrón con guía de repo `local-workstation-node.md` o equivalente **solo** para red + receiver

**Inherit:** `contract-v1` sin cambios; otra rama FLEET `miami`, URL `BRANCH_MIAMI_DELEGATE_URL`, mismos límites de seguridad. **No** reintroducir Ollama en el contrato a menos que se decida otra operación de coste.

**Commit (cuando toque):** `feat(fleet): add miami remote delegate to match sicilia pattern`.

---

## Fase 6 (opcional) — Ajuste `tool_fleet_status` en Python

**File:**
- Modify: `tool_fleet_status` en `server.py` — para ramas `cloud-only`, reemplazar probe Ollama por `DELEGATE_HEALTH_URL` o ping HTTPS al receiver.

**Test:** `tests/test_fleet_status_sicilia_probe.py` con YAML fixture.

**Commit:** `fix(kaspar-tools): health probe for cloud-only branches`.

---

## Paralelización (referencia a skill dispatching-parallel-agents)

| Workstream A (HQ) | Workstream B (Sicilia) |
|-------------------|------------------------|
| `remote_delegate.py` + tests mock | `delegate_receiver` + validación + systemd |
| Cambios a `FLEET.yml` (tras acordar IDs) | Documentación de red/ingress |
| `hq-delegate.env.example` | Actualización `SICILIA-NODE.md` |

**Condición de sincronía:** congelar `contract-v1` antes de implementar A y B a la vez; si el contrato cambia a mitad, unificar con PR único o versión en URL `/v1` vs `/v2`.

---

## Orden mínimo recomendado (resumen de ejecución)

1. Fase 0.2 (contrato) + 0.3 (transporte) — **aprobado por ti**.
2. Fase 1.1–1.2 (receiver + tests en sucursal).
3. Fase 2.1–2.2 (cliente + enrutamiento en HQ).
4. Fase 4.1 (mock E2E).
5. Fase 4.2 (PoC real).
6. Fase 3 (FLEET + poda) puede adelantarse al paso 3–4 **si** los `agent_id` coinciden.

---

## Execution handoff (según writing-plans)

**Plan guardado en:** `docs/plans/2026-04-24-hq-branch-secure-delegation.md`. Opciones de ejecución:

1. **Subagente en esta sesión** — despacho por tarea con revisión entre tareas, iteración rápida (recomendado requerir sub-skill *executing-plans* si la tenéis en el entorno).
2. **Sesión aparte** — nueva sesión con *executing-plans*, ejecución por lotes y checkpoints.

**¿Cuál preferís?**

---

*Fecha de plan: 2026-04-24 · Ajustar fechas/IDs de rama al implementar.*
