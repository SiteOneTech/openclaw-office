# Nombre Visual Canonico de Sucursal

Este repo solo renderiza la superficie grafica. La identidad humana de una sucursal pertenece al registry SQL de la flota, gestionado desde `sitiouno/gcloud-office`.

## Regla

El neon del Office debe mostrar:

```text
SITIOUNO OFFICE - {DISPLAY_NAME}
```

Ejemplos:

```text
SITIOUNO OFFICE - SICILIA
SITIOUNO OFFICE - MIAMI
```

## Fuente de Verdad

La fuente canonica es:

- `branch_nodes.branch_id`: id tecnico estable, por ejemplo `sicilia`.
- `branch_nodes.display_name`: nombre humano de sucursal, por ejemplo `Sicilia`.
- `branch_nodes.metadata.office.title`: nombre del producto visual, por defecto `SitioUno Office`.

`metadata.office.branch_label` existe solo por compatibilidad con nodos anteriores. Si aparece, debe coincidir con `display_name`.

## Flujo

1. La sucursal declara `branches.<branch>.display_name` en `FLEET.local.yml`.
2. `gcloud-office/scripts/publish_branch_registry.py` publica ese valor al registry SQL.
3. `gcloud-office/scripts/sync_node_from_registry.py` genera el env local de Office.
4. El servidor `openclaw-office` inyecta runtime config al navegador.
5. La UI renderiza el neon con `formatOfficeNeonLabel()`.

No hardcodear nombres como Miami o Sicilia dentro de componentes compartidos. Si el nombre sale mal, corregir el registro/sync antes que la UI.

## Relacion con Autoupdate

El nombre de sucursal y la version del bundle son señales distintas:

- El neon identifica la sucursal: `SITIOUNO OFFICE - {DISPLAY_NAME}`.
- El pill de version identifica el codigo corriendo: `v{package.version}+{git_sha}`.

El SHA corto viene de `__APP_COMMIT__`, inyectado por Vite desde el commit de build. El sistema de autoupdate de las sucursales debe usar ese dato para detectar drift de version; no debe usar el nombre visual de la sucursal como proxy de version.

Cuando un equipo alinee una sucursal, primero debe revisar:

1. `branch_nodes.display_name` en el registry SQL.
2. `metadata.office.title` y `metadata.office.branch_label`.
3. El SHA mostrado por el pill de version contra `origin/main`.
4. El Kanban de la sucursal para tareas operativas locales.
