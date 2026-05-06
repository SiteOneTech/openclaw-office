# Batería de trabajo: agentes, skills y referencias técnicas

| Campo            | Valor        |
| ---------------- | ------------ |
| Versión          | 1.0.0        |
| Fecha (UTC)      | 2026-04-23   |
| Proyecto / ámbito| openclaw-office-sicilia |

## Changelog

- **1.0.0 (2026-04-23):** Primer registro: skills instalados vía `npx skills`, referencias oficiales (GCP, GitHub, Anthropic, OpenClaw) y notas de seguridad y CLI.

---

## 1. Herramientas de línea de comandos (entorno)

| Herramienta   | Uso en esta batería |
| ------------- | -------------------- |
| `npx skills`  | Instalar/actualizar Agent Skills (skills.sh) en `~/.agents/skills` con enlace a Claude Code / Cursor, etc. |
| `gcloud`      | Google Cloud: proyectos, IAM, cómputo, red, GKE, Secret Manager, etc. |
| `gh`          | **Versión local ~2.89:** el subcomando `gh skill` (mercado de skills GitHub) exige `gh` **≥ 2.90**. Actualizar: `gh upgrade` o paquetes del SO. |
| `git`         | Control de versiones. |
| `npx openclaw`| CLI OpenClaw (ver `npx openclaw --help`). |

Comandos típicos de skills:

```bash
npx skills find "<término>"
npx skills add <owner/repo@nombre-skill> -g -y
npx skills check && npx skills update
```

**Nota de seguridad:** las skills no están “certificadas” de forma global; `skills.sh` puede mostrar análisis (p. ej. Snyk). Revisa el `SKILL.md` de fuentes desconocidas antes de dejarlo en producción.

---

## 2. Skills instalados (curación por dominio)

Instalación global: `~/.agents/skills/` (soporte multicliente) y enlace a Claude Code, según el instalador.

### Google Cloud Platform (cómputo, red, recetas, desarrollo)

| Origen (repo) | Skill | Enfoque |
| ------------- | ----- | ------- |
| `google/skills` | `cloud-run-basics` | Cloud Run, bases. |
| `google/skills` | `google-cloud-recipe-networking-observability` | Red y observabilidad (recetas). |
| `google/skills` | `google-cloud-recipe-auth` | Autenticación / patrones (recetas). |
| `mindrally/skills` | `gcp-development` | Desarrollo en GCP. |
| `sickn33/antigravity-awesome-skills` | `gcp-cloud-run` | Cloud Run (comunidad, alto uso). |
| `personamanagmentlayer/pcl` | `gcp-expert` | Perfil “GCP expert” (revisar alineación con tus políticas). |
| `bagelhole/devops-security-agent-skills` | `terraform-gcp` | Infra como código hacia GCP. |

### Red y seguridad (nube y general)

| Origen | Skill | Enfoque |
| ------ | ----- | ------- |
| `elastic/agent-skills` | `cloud-network-security` | Seguridad de red en nube. |
| `useai-pro/openclaw-skills-security` | `network-watcher` | Auditoría de red / skills OpenClaw (el analizador puede marcar riesgo; contenido orientado a revisar permisos de red de skills). |

### Linux (admin y endurecimiento)

| Origen | Skill | Enfoque |
| ------ | ----- | ------- |
| `bagelhole/devops-security-agent-skills` | `linux-administration` | Administración Linux. |
| `bagelhole/devops-security-agent-skills` | `linux-hardening` | Endurecimiento. |

### Contenedores / orquestación (conexión con GKE)

| Origen | Skill | Enfoque |
| ------ | ----- | ------- |
| `jeffallan/claude-skills` | `kubernetes-specialist` | Kubernetes (GKE, patrones, troubleshooting). |

### GitHub (CI y plantillas)

| Origen | Skill | Enfoque |
| ------ | ----- | ------- |
| `xixu-me/skills` | `github-actions-docs` | Documentación y patrones GitHub Actions (muy instalada). |
| `wshobson/agents` | `github-actions-templates` | Plantillas de flujos. |

### Claude (API, agentes, MCP, creación de skills)

| Origen | Skill | Enfoque |
| ------ | ----- | ------- |
| `anthropics/skills` | `claude-api` | Uso de la API de Claude. |
| `anthropics/claude-code` | `agent-development` | Desarrollo de agentes en Claude Code. |
| `anthropics/claude-code` | `skill-development` | Crear y mantener skills. |
| `anthropics/claude-code` | `mcp-integration` | Model Context Protocol con Claude Code. |

Documentación Anthropic: [Extend Claude with skills (Claude Code)](https://code.claude.com/docs/en/skills)

---

## 3. OpenClaw: fuentes oficiales y comunidad

| Recurso | Descripción |
| ------- | ------------ |
| [ClawdHub](https://clawdhub.com) | Mercado / descubrimiento de skills (el repo `openclaw/skills` en GitHub indica que muchos listados se respaldan desde aquí; revisar [README de openclaw/skills](https://github.com/openclaw/skills)). |
| [openclaw/skills (GitHub)](https://github.com/openclaw/skills) | Archivo/backup: **advertencia de posibles skills maliciosos**; tratarlo como referencia, no como catálogo ciego. |
| [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) | Listado comunitario categorizado. |
| `npx openclaw` | CLI local para tareas de OpenClaw (ver ayuda). |

---

## 4. Mejores prácticas y documentación (sin skills; referencia humana y agente)

| Tema | Enlace o guía |
| ---- | -------------- |
| Arquitectura e IAM en GCP | [Google Cloud security foundations](https://cloud.google.com/architecture/security-foundations) |
| Lista de comprobación OWASP (general) | [OWASP](https://owasp.org) |
| Hardening Linux (industria) | [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks) (acceso según suscripción) |
| GitHub Actions | [Documentación GitHub Actions](https://docs.github.com/actions) y skill `github-actions-docs` arriba |

---

## 5. Cómo asignar trabajo a un agente

1. Nombra el **dominio** (p. ej. “VPC, firewall y Cloud NAT en GCP”).
2. Indica qué **skill** debe cargar el agente (p. ej. `google-cloud-recipe-networking-observability` + `terraform-gcp` si aplica).
3. Fija **límites**: proyecto GCP, región, sin credenciales en claro, revisión de `terraform plan` antes de aplicar.
4. Si el entorno es **OpenClaw**, considera [ClawdHub](https://clawdhub.com) y el skill de seguridad de red `network-watcher` solo como **checklist** de revisión, no como sustituto de revisión humana o escaneo formal.

---

## 6. Reproducción (instalación por lotes)

Puedes reinstalar el núcleo instalado en esta sesión con:

```bash
for s in \
  "google/skills@cloud-run-basics" \
  "google/skills@google-cloud-recipe-networking-observability" \
  "google/skills@google-cloud-recipe-auth" \
  "mindrally/skills@gcp-development" \
  "sickn33/antigravity-awesome-skills@gcp-cloud-run" \
  "bagelhole/devops-security-agent-skills@terraform-gcp" \
  "bagelhole/devops-security-agent-skills@linux-hardening" \
  "bagelhole/devops-security-agent-skills@linux-administration" \
  "xixu-me/skills@github-actions-docs" \
  "wshobson/agents@github-actions-templates" \
  "jeffallan/claude-skills@kubernetes-specialist" \
  "anthropics/skills@claude-api" \
  "elastic/agent-skills@cloud-network-security" \
  "personamanagmentlayer/pcl@gcp-expert" \
  "useai-pro/openclaw-skills-security@network-watcher" \
  "anthropics/claude-code@agent development" \
  "anthropics/claude-code@skill development" \
  "anthropics/claude-code@mcp integration"
do
  npx -y skills add "$s" -g -y
done
```

**Nota:** el skill de Google Workspace con nombre `gws-cloudidentity` **no existe** en el repositorio actual `googleworkspace/cli` (el buscador de skills pudo mostrar nombres desactualizados). Para Workspace/Admin, usa skills `gws-*` listados por el instalador (p. ej. `gws-admin-reports`, `gws-people`) según el caso.

---

*Control de versiones: mantén este documento al añadir o quitar skills; incrementa `Versión` y registra en **Changelog**.*
