# Apéndice — Superficie `openclaw gateway call` (OpenClaw 2026.4.21)

**Contexto:** Encaje con «un turno de agente remoto» vía delegación HTTP (ver `contract-branch-delegation-v1.md`). La delegación **no** depende de este RPC para el PoC: el receptor en la sucursal invoca `openclaw agent` en **localhost**.

## Comando

```text
openclaw gateway call [options] <method>
```

**Métodos citados en la ayuda (placeholders):** `health`, `status`, `system-presence`, `cron.*` (y otros según versión).

**Opciones relevantes:** `--url <WebSocket URL>`, `--token <token>`, `--params <json>`, `--timeout <ms>`, `--json`.

## Conclusión para el plan

- **Salud / presencia:** útil para **probes** y monitoreo (`health`, `status`) desde HQ o scripts.
- **Ejecución de un turno completo de agente** con prompt estructurado: en la versión inspeccionada, el flujo documentado para operadores sigue siendo **`openclaw agent`** (local o vía subprocess en el nodo). El **contrato v1** delega en el **receptor HTTP** que encapsula esa invocación.
- Si en versiones futuras el gateway expone un RPC explícito tipo `agent.run` con los mismos parámetros, el receptor podría migrar de `subprocess` a `gateway call` **interno** en loopback.

**Revisión:** 2026-04-24 · CLI `openclaw` 2026.4.21.
