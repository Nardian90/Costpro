# GATE 1.4P — 00 BASELINE

Fecha: 2026-09-22 · Gate: **GATE 1.4P — Product Decisions / Discovery** (READ-ONLY sobre producto)

## 1. Estado Git verificado (GATE 0)

| Verificación | Resultado |
|---|---|
| HEAD | `7222b62d50f3a27482cd472413c0db128a43c5b7` |
| Mensaje HEAD | `docs(gate1.4r.1): closure evidence — git verification + FINAL-REPORT (CERTIFIED)` |
| origin/main (tras fetch) | `7222b62d50f3a27482cd472413c0db128a43c5b7` |
| HEAD == origin/main | **SÍ** |
| Worktree (`git status --porcelain`) | **LIMPIA** (0 entradas) |
| Branch | `main` tracking `origin/main`, sin divergencia |
| Regla GATE 0 (no reset/clean/overwrite) | Cumplida — no se ejecutó ningún comando destructivo |

## 2. Cadena de commits previos verificada

| Commit | Contenido | Estado |
|---|---|---|
| `472027e4` | GATE 1.4 — auditoría UX extensa (orphan inventory, semantic tabs, proposed IA) | En historial, evidencia en `audit-evidence/GATE1.4/` (17 MD + screenshots) |
| `63918468` | GATE 1.4R — remediación Fichas de Costo (Arena FC recuperada, rename, palette, breadcrumbs) | En historial, evidencia en `audit-evidence/GATE1.4R/` |
| `a603d7cc` | GATE 1.4R — cierre (FINAL-REPORT CERTIFIED) | En historial |
| `3cf6446c` | PLAN ESTRATÉGICO UX/IA (`docs/plan-estrategico-ux-ia.md`) | En historial — **documento fuente de las 3 decisiones de este gate** |
| `b9a8075c` | GATE 1.4R.1 — reconstrucción integral Fichas de Costo (Experto recupera Tablero Principal, Generación Masiva, Modo+Acciones, tabs móviles de módulo) | En historial, evidencia en `audit-evidence/GATE1.4R.1/` |
| `7222b62d` | GATE 1.4R.1 — cierre (FINAL-REPORT CERTIFIED) | **HEAD actual** |

## 3. Artefactos pre-existentes exigidos por el gate

| Artefacto | Existe | Ruta |
|---|---|---|
| GATE 1.4 | SÍ | `audit-evidence/GATE1.4/` — 00-baseline … FINAL-REPORT.md |
| GATE 1.4R | SÍ | `audit-evidence/GATE1.4R/` — 14 MD + 7 PNG |
| GATE 1.4R.1 | SÍ | `audit-evidence/GATE1.4R.1/` — 16 MD + 19 PNG |
| PLAN ESTRATÉGICO UX/IA | SÍ | `docs/plan-estrategico-ux-ia.md` (§5 tabla de 4 decisiones de producto) |

## 4. Las tres preguntas abiertas que este gate debe resolver

Fuente: `docs/plan-estrategico-ux-ia.md` §5 + `audit-evidence/GATE1.4/05-orphan-inventory.md` + `FINAL-REPORT.md` GATE 1.4.

| # | Decisión | Hallazgo origen | Lo que el plan NO sabe aún |
|---|---|---|---|
| 1 | Ofertas / Clientes CRM / Conciliación Bancaria (UX-010) | Huérfanas: deep-link only, sin menú/palette, breadcrumb falso (UX-002) | Si son legacy, vigentes, parciales o sustituidas. El plan las trató como "decisión de producto" sin evidencia de fondo |
| 2 | Tablón de Noticias (UX-005) | Es tab DEFAULT del hub Gestión de Tiendas; el plan sospecha que no pertenece semánticamente ahí | Modelo semántico real: global / por-tienda / mixto / contextual |
| 3 | "Mis Fichas" (UX-014) | GATE 1.4R.1 documentó "no existe listado de fichas en terminal" como nota de producto | Qué existe realmente en `product_cost_sheets`: persistencia, listado, gestión, descubribilidad |

## 5. Alcance y restricciones de este gate (declaración de cumplimiento)

- READ-ONLY respecto al producto: **cero** cambios funcionales, navegación, UI, DB, permisos, refactors, renombramientos, ni implementación de Fases B–F.
- Única escritura permitida: `audit-evidence/GATE1.4P/` (esta carpeta).
- Se prohíbe convertir hipótesis del plan en hechos: "legacy" ≠ "huérfana"; "sin menú" ≠ "obsoleta"; "existe tabla" ≠ "existe vista usable"; "tiene deep-link" ≠ "es descubrible"; "aparece en Gestión" ≠ "pertenece a Gestión"; "aparece en /fc/" ≠ "existe en terminal".
- Datos: solo lectura (SQLite `db/custom.db` y esquema Supabase en repo); no se modificarán registros.

## 6. Método

1. Reconstrucción desde código actual: `navigation-definition.ts`, `navigation-map.ts`, `actions.ts`, ViewTypes, rutas, componentes, referencias, tests, modelos, APIs, breadcrumbs, palette, deep-links.
2. Grep forense de sustitución: `legacy`, `deprecated`, `obsolete`, `old`, `removed`, `replaced`, `migration`, `TODO`.
3. Inspección de datos de solo lectura (SQLite local incluido en repo; esquema/migraciones Supabase).
4. Telemetría: búsqueda de instrumentación de uso; si no existe → se declara `NO HAY EVIDENCIA DE USO MEDIBLE` (sin inferir "sin uso").
