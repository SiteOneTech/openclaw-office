# Nodo Hermes Agent -- GCP OpenClaw Office

| Campo | Valor |
| --- | --- |
| Fecha | 2026-05-06 |
| Producto | Hermes Agent v0.12.0 |
| Repo | `https://github.com/NousResearch/hermes-agent` |
| VM | `hermes-agent-01` |
| Proyecto GCP | `su-office-2030` |
| Zona | `us-central1-a` |
| Red | `openclaw-vpc` / `openclaw-subnet` |
| IP interna | `10.42.0.3` |
| Acceso | IAP SSH, sin IP publica |

## Resumen

- VM privada creada con `e2-standard-4`, disco balanceado de 80 GB y tag `openclaw-private`.
- Usuario runtime dedicado: `hermes`.
- Codigo: `/home/hermes/.hermes/hermes-agent`.
- Configuracion: `/home/hermes/.hermes/config.yaml`.
- Secretos: `/home/hermes/.hermes/.env` con permisos `600` y sin valores en git.
- Proveedor principal: Anthropic, modelo `claude-sonnet-4-6`.
- Backend de terminal: Docker, cwd interno `/workspace`, contenedor persistente.
- Gateway systemd: `hermes-gateway.service`, instalado como servicio de usuario `hermes` con linger habilitado. Esto permite que el dashboard reinicie el gateway sin root.
- Dashboard systemd: `hermes-dashboard.service`, escuchando en `0.0.0.0:9119` dentro de una VM sin IP publica. Acceso operativo por Tailscale: `http://100.90.65.123:9119`.
- Tailscale: instalado (`1.96.4`) y unido al tailnet como `hermes-agent-01`.
- MiniMax: configurado y validado como proveedor de inferencia.
- DeepSeek: `DEEPSEEK_API_KEY` configurada en `.env`, validada por CLI (`DEEPSEEK_OK`, `DEEPSEEK_OK_2`) y registrada como fallback: primary MiniMax → fallback `deepseek-chat`. `hermes-gateway.service` reiniciado para tomar el fallback.

## Verificacion realizada

```bash
gcloud compute ssh hermes-agent-01 --zone=us-central1-a --tunnel-through-iap
sudo systemctl status hermes-gateway.service --no-pager
sudo -iu hermes hermes doctor
sudo -iu hermes hermes -z "Reply exactly: HERMES_OK" --provider anthropic --model claude-sonnet-4-6
sudo -iu hermes hermes -z "Use the terminal tool to run: pwd && printf HERMES_TERMINAL_OK. Then reply with only the terminal output." --provider anthropic --model claude-sonnet-4-6 --toolsets terminal --yolo
```

Resultados:

- `hermes doctor`: Python, Docker, Node, browser tools, Anthropic API, skills y memoria local OK.
- Prueba LLM: `HERMES_OK`.
- Prueba terminal/Docker: `/workspace` + `HERMES_TERMINAL_OK`.
- Servicios activos: `hermes-gateway` user service, `hermes-dashboard`, `docker`, `tailscaled`.
- Dashboard: `http://100.90.65.123:9119`.
- Boton `Restart Gateway` validado desde la API del dashboard: `gateway-restart.log` muestra `User service restarted`.
- Chat UI por navegador validado desde la estacion por Tailscale: WebSockets `/api/events`, `/api/ws` y `/api/pty` conectan correctamente.
- MiniMax validado por CLI: `hermes -z "Responde exactamente: MINIMAX_OK" --provider minimax -m MiniMax-M2.7 --ignore-rules`.
- `hermes skills list` ejecutado para inicializar Skills Hub.
- Telegram validado con bot `Zeus_SU_bot`: token OK, API Telegram alcanzable desde la VM, sin webhook publico, gateway conectado en polling mode.
- Telegram home channel configurado al DM autorizado para notificaciones y envios por `send_message`.
- Identidad estable configurada en `/home/hermes/.hermes/SOUL.md`: Hermes se presenta como asistente IA dentro de la infraestructura de `SitioUno GCP`.
- MCP `openclaw-office` instalado y habilitado para `cli` y `telegram`.
- Herramientas MCP disponibles: `openclaw_identity`, `openclaw_list_offices`, `openclaw_office_status`, `openclaw_tailnet_status`, `openclaw_delegate_task`, `openclaw_delegation_runbook`.
- Registro de oficinas en `/home/hermes/.hermes/openclaw-tools/openclaw-fleet.yaml`: `hq`, `sicilia`, `miami`.
- Servicio simulator registrado en el mismo inventario MCP: `mirofish` → UI/API Tailnet `http://100.119.34.35/`, health OK desde Hermes. Ver `MIROFISH-NODE.md`.
- Delegacion real Hermes -> Sicilia/Cesar validada por `branch-delegation-v1`: salida `SICILIA_OK`.

## Notas operativas

- En el navegador local, `localhost` apunta a la estacion local, no a la VM. Usar `http://100.90.65.123:9119` salvo que se cree un tunel SSH explicito.
- Para ejecutar diagnostico desde la UI/terminal de Hermes, usar `hermes doctor` sin `sudo`. El usuario runtime `hermes` no tiene password interactivo para sudo.
- En Hermes Agent v0.12.0 el primer arranque del chat puede recompilar el TUI si falta el artefacto esperado `ui-tui/packages/hermes-ink/dist/ink-bundle.js`. Se corrigio creando un symlink al artefacto generado `entry-exports.js`; despues de esto `_make_tui_argv` queda en ~0.03s y el PTY del chat abre normalmente.
- `doctor` puede mostrar `anthropic (HTTP 404)` aunque `Anthropic API` este OK; es un chequeo duplicado del doctor tratando Anthropic como endpoint OpenAI-compatible. No bloquea Hermes ni MiniMax.
- El unico issue pendiente de `doctor` es generico: configurar llaves opcionales si se quiere full tool access (`GITHUB_TOKEN`, `OPENROUTER_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, etc.).
- Telegram no necesita entrada publica en esta instalacion: el gateway usa polling hacia `api.telegram.org`. Solo necesita salida HTTPS. Si se cambia a webhook mode (`TELEGRAM_WEBHOOK_URL`), ahi si haria falta URL publica o tunel.
- Telegram `/start` no era comando nativo de Hermes v0.12.0; se agrego `quick_commands.start` como alias a `/help`.
- La identidad de Hermes no debe depender de memoria conversacional; se fija en `SOUL.md`. Las preferencias aprendidas/memorias son complementarias, no fuente de identidad operativa.
- `openclaw-office` guarda endpoints y agentes, pero nunca tokens. Tokens de delegacion viven en `/home/hermes/.hermes/.env` como `OPENCLAW_<OFICINA>_DELEGATE_TOKEN`.
- Sicilia esta operativa para delegacion. Miami esta visible por Tailscale y tiene endpoint descubierto, pero queda pendiente registrar agentes y configurar `OPENCLAW_MIAMI_DELEGATE_TOKEN`.

## Pendiente

- Agregar token/agentes de Miami cuando se quiera habilitar delegacion real hacia esa oficina.
- Si se suman nuevas oficinas, agregarlas a `openclaw-fleet.yaml`, setear token en `.env`, reiniciar gateway/dashboard y probar `openclaw_office_status` + `openclaw_delegate_task(dry_run=true)`.
