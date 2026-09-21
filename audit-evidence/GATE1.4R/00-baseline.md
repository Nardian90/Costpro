# GATE 1.4R — 00 BASELINE

Fecha: 2026-09-22 · Fase: REMEDIACIÓN UX/IA · Fichas de Costo (mandato GATE 1.4R)

## Estado del entorno (GATE 0)

```text
HEAD:         472027e49c5abfa85902ecc9bf1f1713d95edbc1
origin/main:  472027e49c5abfa85902ecc9bf1f1713d95edbc1
WORKTREE:     limpia (0 cambios)
branch:       main
servidor:     PM2 (costpro + telegram-cron-poller + whatsapp-cron-poller), HTTP 200 en localhost:3000
```

- `HEAD == origin/main` → **OK** (verificado tras `git fetch origin`).
- `worktree clean` → **OK**.
- El entorno fue reconstruido tras wipe (PM2 7.0.4 + clone fresco); el commit del audit GATE 1.4 (`472027e4`) sobrevivió vía push a GitHub.

## Baseline de auditoría

- Informe fuente: `audit-evidence/GATE1.4/` (17 MD + screenshots), auditado en HEAD `86d99d54`.
- El baseline actual (`472027e4`) = `86d99d54` + únicamente la carpeta de evidencia GATE 1.4 → **ningún archivo de producto cambió entre el audit y este baseline** → los hallazgos siguen vigentes sin re-derivar (verificación adicional por código en 01-classification.md).

## Verificación de vigencia de hallazgos (código, HEAD 472027e4)

| Hallazgo | Verificación en HEAD | Vigente |
|---|---|---|
| UX-001 Arena FC orphan | grep `src/`: 0 triggers hacia `arena-fc` (solo render por `activeSection` en CostSheetView y ruta técnica en navigation-map COSTOS_ROUTES); ActionsPanel no contiene Arena FC | ✅ |
| UX-002 breadcrumb falso en tabs técnicas | `navigation-map.ts` costosTabRoutes mapea a IDs fuera del árbol de definición → `findDefinitionPath` devuelve `[]` → fallback "Módulo No Disponible" (incluye `main` = editor) | ✅ |
| UX-003 Asistido/Informe palette-invisibles | No existen en ACTION_EXTENSIONS ni como hojas de menú; solo puente deep-link en useCostSheetActions | ✅ |
| UX-004 "Tablero Dinámico" ambiguo | navigation-definition línea ~347: label "Tablero Dinámico" | ✅ |
| UX-008 palette sin acciones | `actions.ts` deriva SYSTEM_ACTIONS de hojas de menú + ACTION_EXTENSIONS; sin acciones de ficha; además `route: ext.route.view` **descarta el `tab`** de extensiones (defecto mecánico para entradas module-route) | ✅ |
| UX-014 "Mis fichas" inexistente en terminal | GenEasyView sin enlace a listado; el editor `main` edita la ficha activa; listado solo en MVP /fc/ | ✅ |

## Restricciones aceptadas (mandato §1/§16/§20)

- Prohibido reset --hard, clean -fd, duplicar implementaciones, tocar Supabase/RLS/permisos, alterar motor normativo, modificar /fc/FC.html.
- Asistido/Informe = MODOS; Guardar/Export/Import = ACCIONES; no se convierten en tarjetas-vistas.
