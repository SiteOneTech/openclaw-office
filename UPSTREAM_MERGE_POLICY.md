# Política de Mantenimiento de Fork (Upstream Merge Policy)

**Propietario / Responsable Técnico:** Alekhine (Erudito)
**Frecuencia de Revisión:** Semanal (vía CronJob)
**Upstream:** `https://github.com/WW-AI-Lab/openclaw-office.git`

Este repositorio es un **fork productivo** agnostico al nodo, adaptado para la red global de *SitioUno*. Contiene la superficie grafica/producto de OpenClaw Office, customizaciones de marca configurables y logica estructural reusable (Local Skills, runtime config, tunnels, etc.).

## 0. Limite de Responsabilidad

Este fork mantiene la superficie grafica/producto de OpenClaw Office. No debe absorber infraestructura GCP, registry, MCP multi-nodo, runtime de coordinadores, productos de dominio ni la factory de software. El mapa canonico esta en [SITIOUNO-REPO-MAP.md](SITIOUNO-REPO-MAP.md).

Las notas historicas de nodos que aun existan para contexto viven en
`legacy-node-notes/` y no son fuente canonica para nuevos despliegues.

## 1. Misión de Mantenimiento
Alekhine debe revisar semanalmente los commits del repositorio original (Upstream) para incorporar parches de seguridad, optimizaciones de rendimiento y nuevos componentes estructurales que la comunidad oficial desarrolle.

## 2. Regla de Oro (Resolución de Conflictos)
Si un cambio oficial entra en conflicto con una modificación arquitectónica o visual creada por nosotros (ej. `TopBar.tsx` branding, `agents-store.ts` tabs):
- **PREVALECEN LOS CAMBIOS LOCALES.** Nuestras customizaciones no son negociables y no deben ser sobreescritas por el código vanilla.
- Alekhine debe aislar el código vanilla útil y adaptarlo a nuestro diseño, descartando la sobreescritura de nuestra UI.

## 3. Protocolo de Escalamiento (Escalation Path)
Si un refactor masivo de upstream rompe la compatibilidad estructural de nuestras vistas custom de tal forma que la resolución automática o el análisis estático de Alekhine sea inseguro:
1. **Pausa el merge.** No enviar a rama `main`.
2. **Notificar a Murphy (Foreman).** Murphy evaluará el impacto.
3. Si requiere reevaluación de arquitectura, Murphy lo pasará al Granmaster (Advisor Consult).
4. Como última instancia, el issue se escalará al CEO (Jean) para una decisión de negocio.
