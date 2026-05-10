# Contrato de delegación HQ → sucursal (v1)

| Campo | Valor |
| --- | --- |
| Versión de contrato | 1 |
| Fecha (UTC) | 2026-04-24 |
| Canónico (copia en gcloud-office) | `gcloud-office/docs/contract-branch-delegation-v1.md` (mismo contenido) |

## Objetivo

Un único **JSON** de petición/respuesta entre **Kaspar (cliente en HQ o proceso MCP)** y un **receptor** en el nodo de sucursal (p. ej. Sicilia) que, tras validar identidad, ejecuta un turno de `openclaw agent` con parámetros predefinidos. **No** transporta tráfico de proveedores LLM; el nodo continúa llamando a Anthropic/Gemini/OpenAI directamente.

---

## Transporte (v1 — elección fijada)

**Opción A — HTTPS (recomendada para PoC):** `POST https://<host-sucursal>/v1/delegate` (o path detrás de reverse proxy / Tailscale) con **TLS 1.2+** y autenticación **Bearer** (token de delegación, rotado por operador). Motivos: implementación mínima, baja latencia, idempotencia explícita en cuerpo. No se túnelean respuestas del LLM; solo señal de tarea/resultado.

*Opción B (cola / Pub+Sub) y C (híbrida) se documentan para evolución si el volumen o las desconexiones lo exigen.*

---

## Autenticación

- **Cabecera:** `Authorization: Bearer <DELEGATION_TOKEN>`  
- El token lo emite el operador por sucursal; HQ lo almacena en env/secret (nunca en `FLEET.yml`). Rotación: nuevo token + desactivar el anterior.
- *Futuro (v1.1):* firma HMAC de cuerpo + ventana de tiempo; **fuera de alcance v1**.

---

## Request JSON (POST /v1/delegate)

| Campo | Tipo | Requerido | Notas |
| --- | --- | --- | --- |
| `version` | string | sí | Debe ser `"1"`. |
| `task_id` | string | sí | UUID recomendado; clave de idempotencia. |
| `idempotency_key` | string | no | Si se omite, se usa `task_id`. Repetir misma tarea: mismo `task_id` → respuesta `idempotent_replay` o resultado cacheado 24h (definido por implementación). |
| `target` | object | sí | `branch` (e.g. `sicilia`), `agent_id` (e.g. `cesar`) — validado contra FLEET en HQ; en nodo, validado contra agentes reales. |
| `input` | string | sí | Texto de la tarea (Kaspar puede prefijar `TASK-ID` / `PHASE`). |
| `deadline_s` | integer | sí | 5..600, acorde a `openclaw` agent timeout. |
| `max_output_bytes` | integer | no | Tope de salida en carácteres/bytes (implementación nodo). |
| `async` | boolean | no | Si es `true`, el receptor responde rápido con `202 accepted` y ejecuta el turno en background. Recomendado para trabajos de Factory, OpenHands, QA o tareas de más de 30s. |
| `mode` | string | no | Alias operativo; `async`, `background`, `queue` y `queued` activan ejecución en background. |
| `project_id` | string | no | ID operativo cuando la tarea pertenece a un proyecto Factory. El receptor lo propaga al Kanban local. |
| `initiative_id` | string | no | ID de iniciativa estratégica; por defecto puede coincidir con `project_id`. |
| `metadata` | object | no | Metadata no sensible. Para proyectos Factory puede incluir `canonical_factory_project=true`, `repo_name`, `project_slug`, `preview_url_expected` y `stage_order`. |

**Ejemplo:**

```json
{
  "version": "1",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
  "target": { "branch": "sicilia", "agent_id": "cesar" },
  "input": "TASK-ID: 550e…\nPHASE: delegate.hq\n---\nResumí el estado del workspace.",
  "deadline_s": 120,
  "max_output_bytes": 262144,
  "async": true,
  "mode": "async",
  "project_id": "factory-example-001",
  "initiative_id": "factory-example-001",
  "metadata": {
    "canonical_factory_project": true,
    "repo_name": "factory-su-example",
    "preview_url_expected": "https://kidu.app/p/example/"
  }
}
```

---

## Response JSON (200/202)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `status` | string | `accepted` \| `ok` \| `error` \| `timeout` \| `rejected` \| `idempotent_replay` |
| `output` | string | Salida del agente (texto) |
| `stderr` | string | Opcional, si hubo flujo a stderr (no se incluyen secretos) |
| `duration_s` | number | |
| `metadata` | object | Claves libres **sin** credenciales (p. ej. `branch`, `agent_id`, `openclaw_exit_code`, `task_status_url`, `kanban_url`) |
| `error` | string | Si `status` es `error` / `rejected` |

Códigos HTTP: `202` tarea aceptada async; `200` cuerpo presente; `400` cuerpo inválido; `401/403` auth; `409` idempotencia conflictiva; `502` upstream agent falló; `504` timeout.

---

## Límites y seguridad

- Rate limit en receptor (p. ej. 30 req/min por IP/claim).
- Sin ejecución de shell arbitrario desde el JSON: solo el binario `openclaw` con allowlist de argumentos.
- Logs: `task_id`, `agent_id`, `duration_s`, nunca claves de API de LLM.

---

## Changelog

- **v1 (2026-04-24):** Primer cierre; transporte A (HTTPS + Bearer); sin HMAC aún.
