# Nodo MiroFish AI Forecast Simulator -- GCP OpenClaw Office

| Campo | Valor |
| --- | --- |
| Fecha | 2026-05-06 |
| Producto | MiroFish original AI Forecast |
| Repo | `https://github.com/SiteOneTech/mirofish-original-ai-forecast` |
| Commit desplegado | `b239fc2` |
| VM | `mirofish-simulator-01` |
| Proyecto GCP | `su-office-2030` |
| Zona | `us-central1-a` |
| Red | `openclaw-vpc` / `openclaw-subnet` |
| IP interna | `10.42.0.4` |
| Tailscale | `mirofish-simulator-01` / `100.119.34.35` |
| Acceso | IAP SSH, sin IP publica |

## Resumen

- Arquitectura elegida: VM privada, no Cloud Run. El producto usa carpetas persistentes, simulaciones largas y Tailscale; una VM encaja mejor que un contenedor stateless con un solo puerto.
- Runtime: usuario dedicado `mirofish`.
- Codigo: `/opt/mirofish/app`.
- Backend: Gunicorn + Flask en `127.0.0.1:5001`, servicio `mirofish-backend.service`.
- Frontend: build estatico de Vite servido por Nginx en puerto 80, con `/api` proxied al backend.
- Datos persistentes: `/opt/mirofish/app/backend/uploads`.
- Configuracion/secrets: `/etc/mirofish/mirofish.env` con permisos `0640 root:mirofish`.
- LLM: configurado con endpoint OpenAI-compatible de DeepSeek (`https://api.deepseek.com/v1`, modelo `deepseek-chat`) usando `DEEPSEEK_API_KEY` de Hermes/Zeus, sin imprimir el secreto.
- Zep: `ZEP_API_KEY` configurada en `/etc/mirofish/mirofish.env`; lectura y escritura validadas contra Zep Cloud con un graph temporal creado y eliminado.
- Tailscale: instalado, autorizado y online como `100.119.34.35`.

## URLs

- Desde VMs GCP OpenClaw/Hermes/HQ: `http://10.42.0.4/`
- Desde esta estacion por Tailscale: `http://100.119.34.35/`
- API interna: `http://10.42.0.4/api`
- Health: `http://10.42.0.4/health`
- API por Tailnet: `http://100.119.34.35/api`
- Health por Tailnet: `http://100.119.34.35/health`

## Verificacion realizada

```bash
gcloud compute ssh mirofish-simulator-01 --zone us-central1-a --tunnel-through-iap
sudo systemctl status mirofish-backend nginx --no-pager
curl -fsS http://127.0.0.1/health
curl -fsS http://127.0.0.1/api/graph/project/list
```

Desde Hermes:

```bash
python3 - <<'PY'
import urllib.request
for url in ["http://10.42.0.4/health", "http://10.42.0.4/api/graph/project/list"]:
    print(url, urllib.request.urlopen(url, timeout=10).read(500).decode())
PY
```

Resultados:

- `mirofish-backend`: activo.
- `nginx`: activo.
- `/health`: `{"service":"MiroFish Backend","status":"ok"}`.
- `/api/graph/project/list`: responde `success=true`.
- DeepSeek desde la VM: `MIROFISH_LLM_OK`.
- Zep desde la VM: `graph.list_all()` OK; `graph.create()` y `graph.delete()` OK con graph temporal `codex-smoke-*`.
- Tailscale desde la estacion: `http://100.119.34.35/`, `/health` y `/api/graph/project/list` responden HTTP 200.
- Firewall interno agregado: `openclaw-vpc-allow-private-http`, permite `10.42.0.0/24 -> tcp:80` solo a VMs `openclaw-private`.
- Hermes MCP inventory actualizado con servicio `mirofish`, `ui_url`, `api_base_url` y `health_endpoint`; probe OK desde Hermes.

## Operacion

- Si se rota `ZEP_API_KEY`, actualizar `/etc/mirofish/mirofish.env` y reiniciar:

  ```bash
  sudo systemctl restart mirofish-backend
  ```

- Si cambia la IP Tailnet, obtenerla con `sudo tailscale ip -4` en la VM y actualizar el inventario de Hermes.
