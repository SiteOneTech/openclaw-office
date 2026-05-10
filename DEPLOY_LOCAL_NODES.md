# Protocolo de Despliegue UI y Sincronización de Nodos Locales

**Versión:** 1.2.0  
**Fecha:** 2026-05-09  
**Control de versión:** cambios deben entrar por commit en `sitiouno/openclaw-office` y desplegarse por `pull`/build local en cada nodo.

## Changelog

- `1.2.0` - Añade descubrimiento y registro automático de túneles locales hacia el registry de HQ.
- `1.1.0` - Formaliza que el runtime local no es fuente de verdad y documenta el registro local de túneles.
- `1.0.0` - Define responsabilidades iniciales de despliegue local y sincronización de skills.

Este documento establece las reglas para desplegar **este frontend** en nodos locales. La infraestructura del nodo, registry, MCP, VPN y contratos de delegación se mantienen en `sitiouno/gcloud-office`.

Ver tambien: [SITIOUNO-REPO-MAP.md](SITIOUNO-REPO-MAP.md).

## 1. Responsabilidad Estricta
Ningún agente DevOps local debe intentar conectarse por SSH, Bastion o VPN para hacer despliegues en infraestructura externa (HQ u otros nodos). Cada nodo debe tener su propio agente vigilante que haga un `pull` de este repositorio y compile los binarios localmente.

## 2. Sincronización de Skills Locales
La carpeta `/local-skills` dentro de este repositorio actúa como el canal de distribución para custom skills entre sucursales.
- **Acción requerida (DevOps Local):** Monitorear esta carpeta. Si hay cambios o nuevos skills, el agente debe copiarlos al directorio global local del nodo (`~/.local/npm-global/lib/node_modules/openclaw/skills/` o equivalente) para que OpenClaw los registre en el Gateway.
- Si un agente en un nodo crea un skill útil, el DevOps de ese nodo debe hacerle commit y push hacia esta carpeta `/local-skills` para compartirlo con el ecosistema.

## 3. Fuente Canónica del Runtime

El runtime local (`http://127.0.0.1:5183/`, `dist/`, servicios `systemd`, o instalaciones npm locales) nunca debe tratarse como fuente de verdad. Si un cambio aparece en runtime pero no está en este repositorio, ese nodo está en estado divergente.

Flujo obligatorio:

1. Crear o modificar el código en un clon de `sitiouno/openclaw-office`.
2. Ejecutar validaciones locales (`pnpm typecheck`, `pnpm build` y las pruebas disponibles).
3. Hacer commit y push al repositorio.
4. En cada nodo, actualizar por `git pull --ff-only` o por el script DevOps local que compile desde el repo.
5. Mantener fuera del repo solo archivos de configuración local, secretos y estado efímero.

## 4. Túneles Locales

La UI puede mostrar la pestaña `Tunnels` dentro de `Setup GCP`, pero las definiciones de túneles son configuración local del nodo. No se deben hardcodear proyectos, VMs, puertos privados ni rutas específicas de una sucursal dentro de React.

El Platform Service lee las definiciones desde `~/.openclaw-office/tunnels.json` o desde la ruta indicada por `OPENCLAW_TUNNELS_FILE`. El formato base está en `examples/tunnels.local.example.json`.

El nodo registra automáticamente esa lista en HQ al iniciar y durante la reconciliación periódica del Platform Service. El botón `Discover & register` fuerza la misma operación bajo demanda. Variables esperadas:

```bash
OPENCLAW_BRANCH_ID=<branch>
KASPAR_REGISTRY_BASE_URL=http://openclaw-hq:8781
OPENCLAW_TUNNELS_AUTO_REGISTER=1
```

La DB es el inventario canónico publicado por cada nodo. Si un túnel ya no existe en el registro local del nodo, la siguiente publicación lo elimina del inventario de ese branch en HQ. Secrets, tokens y passwords nunca deben ir dentro de la definición del túnel.
