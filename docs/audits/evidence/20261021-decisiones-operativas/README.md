# EVIDENCIA Y DECISIONES OPERATIVAS — 2026-10-21 (CP-SEC-027 v5)

Carpeta de la misión **v5 — Ejecución controlada de decisiones pendientes**.
Modo: verificación read-only + preparación. **CERO escrituras a producción, cero cambios de configuración GitHub, cero fusiones.**

## Fichas de fase

| Fase | Documento | Estado |
|---|---|---|
| 1 | `FASE1_DICTAMEN_PR1433.md` — dictamen del PR #1433 (fusionado por el propietario el 19/10) | DICTAMEN EMITIDO: APTO PARA FUSIÓN — sin defectos (verificación forense de filtros `push`) |
| 2 | `FASE2_PROTECCION_MAIN.md` + `RULESET_PROPUESTA_MAIN_v2.json` — análisis y recomendación de protección de `main` | PREPARADO — PENDIENTE DE AUTORIZACIÓN (recomendación: Opción B, modo `evaluate` → `active`) |
| 3 (D) | `PAQUETE_D_LEGAL_INCIDENTS.md` — paquete de ejecución de la migración `20261020000005` | PREPARADO — PENDIENTE DE AUTORIZACIÓN |
| 3 (C) | `PAQUETE_C_COGS_DERIVED.md` — paquete de ejecución de la migración `202602000004` con los 8 valores WAC individualizados | PREPARADO — PENDIENTE DE (1) aprobación contable de los 8 valores y (2) autorización de despliegue separada |
| 4 | `FICHA_DECISION_BACKFILL_DAVID9999.md` — operación verificada viva vs autorización pendiente | PREPARADO — PENDIENTE DE DECISIÓN (ratificar / revertir) |
| 5 | `ALLOWLIST_6_ENTRADAS_2026-12-31.md` — análisis individual de las 6 entradas que vencen antes | PREPARADO — 6 decisiones PROPUESTAS, PENDIENTES DE AUTORIZACIÓN |

## Evidencia cruda del 21/10 (`evidencia/`)

| Archivo | Contenido |
|---|---|
| `verify_18x18_20261021.txt` | Re-ejecución del script oficial `cpsec027_post_migration_verify.js` — 18/18 PASS en vivo |
| `verify_cd_r1_readonly_20261021.json` | Verificación read-only de: columnas de C ausentes (NO aplicada), índice de D ausente (NO aplicada), `schema_migrations` inexistente (deuda R1), backfill david9999 presente (tenant_id + audit_log) |
| `checks_main_c08a4038cc_20261021.json` | Los 9 check-runs del HEAD de `main` (7 success + 2 E2E skipped) — fuente de los nombres exactos del ruleset v2 |
| `pr1433_estado_20261021.json` + `pr1433_files_20261021.json` | Estado del PR #1433 (merged por el propietario 19/10) y diff completo (+32/−0, 2 workflows) |

## Documentos raíz de la misión (fuera de esta carpeta)

- `docs/audits/CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md` — informe operativo final con la tabla de autorizaciones A1-A8.
- `docs/audits/WORKLOG_RESOLUCION_TAREAS_COSTPRO.md` — línea de trabajo del programa (101→105 tareas, panel de conteo).
- `docs/audits/certificaciones/` — 24 certificaciones de cierre sin problemas abiertos.
