# EXPEDIENTE CP-RECEIPT-INTEGRITY-001 — Integridad económica de recepciones

**Fecha:** 2026-11-14 · **Caso principal:** FAC-VITALLCONS-001 (recepción `fd9d6c88-5db8-49ea-b185-8bc96cc93e63`, ENERVIDA-VITALLCONS) · **Rama:** `fix/recepciones-integridad-20261114` · **Cierre:** misión de ejecución del 2026-11-14 (tasa 680 APROBADA por el propietario; PR #1624 fusionado `2e37270e0`; migración APLICADA a producción; 9 recepciones contabilizadas; trazabilidad reparada — ver `INFORME_CIERRE_RECEPCIONES.md`)

## Contenido

| Archivo | Qué contiene |
|---|---|
| `INFORME_FORENSE_RECEPCION_FAC-VITALLCONS-001.md` | Informe completo: 7 preguntas de la misión, diagnóstico 4 niveles (datos/cálculo/backend/frontend), matriz de permisos por estado, consecuencias inventario/WAC/CP-FIN, correcciones implementadas y propuestas con orden. |
| `MATRIZ_RECONCILIACION_RECEPCIONES.xlsx` | Matriz de las 98 recepciones de producción (recomputo independiente Σ(q·uc·tasa) por recepción, clasificación, trazabilidad de inventario, contabilización CP-FIN) + hoja del caso. |
| `EVIDENCIA_FAC-VITALLCONS-001.json` | Extracción read-only del caso con hashes SHA-256 por sección (cabecera, 101 líneas, productos, tasas oficiales, auditoría de tasas, WAC, fin_entries, pagos, audit_logs, backup PR-2) + veredicto estructurado. |
| `consultas_sql_independientes.sql` | Consultas SQL reproducibles (fases 1-6). Ejecutadas de forma equivalente vía REST+JS durante la auditoría (limitación de red IPv6/credenciales documentada). |
| `forensic-extract-fd9d6c88.mjs` | Script de extracción forense read-only (re-ejecutable; requiere `SUPABASE_SERVICE_ROLE_KEY` en el entorno). |
| `matriz-recepciones.mjs` | Script de la matriz global de 98 recepciones (re-ejecutable; ídem credenciales). |
| `INFORME_CIERRE_RECEPCIONES.md` | **Informe de cierre (2026-11-14, segunda misión):** merge PR #1624, aplicación de la migración a producción con sondeos, backfill de las 9 recepciones, ciclo de la revertida, conciliación CP-FIN/inventario, trazabilidad de los movimientos históricos y estado del servidor. |
| `m022-backfill-nueve-recepciones.json` | Evidencia del backfill: pre-checks 8 criterios × 9 docs, ejecución documento a documento, post-checks, deltas exactos (+10 asientos/+20 movimientos/0 errores), idempotencia, FAC-VITALLCONS-001 intacta. |
| `m023-reconciliacion-posterior.json` | Conciliación posterior completa (A recepciones · B CP-FIN · C inventario · D FAC-VITALLCONS-001) con resumen booleano. |
| `m024-trazabilidad-105-movimientos.json` | Análisis de asociación unívoca (producto+cantidad+costo CUP) de los movimientos históricos del caso: 101 UNÍVOCOS 1:1, 9 de otras recepciones (excepción documentada). |
| `m025-corrige-trazabilidad.json` | Corrección trazable ejecutada: backfill idempotente de `reference_id` SOLO en los 101 inequívocos, valores económicos conservados, auditoría 101 filas `TRACEABILITY_BACKFILL`, procedimiento reversible. |

## Veredicto en una línea

La diferencia 186.634.862,75 es **la conversión de divisa de las 22 líneas USD (274.867,25 USD × (680−1)) aplicada exactamente una vez** — no un defecto del motor (98/98 recepciones cuadran al céntimo; CP-FIN cuadra en las 89 contabilizadas). Los defectos reales: presentación con monedas mezcladas, mutabilidad de documentos confirmados (demostrada y corregida) y una tasa ad-hoc 680 pendiente de validación del propietario.

## Correcciones del código (en el PR)

1. `ReceptionDetailsModal.tsx` — moneda explícita por línea, «≈ CUP», resumen en CUP.
2. `PATCH /api/inventory/receptions/[id]/items/[itemId]` — delegación en `update_receipt_item_tasa` (guard de estado + recalculo + auditoría dual).
3. `POST /api/inventory/receptions/backfill-tasas` — solo `pending`, pre-check de acceso, recalculo por recepción.
4. `PATCH /api/inventory/receptions/[id]` — campos económicos solo en `pending` (solo `notes` siempre).
5. Migración `20261114160000_cp_receipt_items_immutable.sql` — trigger de inmutabilidad UPDATE con escape hatch gobernado (**APLICADA a producción el 2026-11-14 15:03 UTC por el canal canónico, m021: sondeos A/B/C OK, delta 0, fila en `production_migration_ledger`**).
6. Pruebas: 43 unitarias/integración + E2E aislada 12/12 (13 escenarios de la misión) + hygiene guard net-zero PASS + CI del SHA final 9/9 SUCCESS.

## Estado de las decisiones del propietario (resuelto en el cierre)

1. ~~Validar la tasa 680~~ → **APROBADA expresamente** (DECISIÓN 1): se conserva; no se propaga a otros documentos.
2. Rectificación → **NO APLICA** con la tasa aprobada: el total 192.039.436 CUP queda canónico.
3. Activo de inventario 192 M CUP → documentado en el expediente (stock físico mayoritariamente 0; sin ajustes en esta misión — requiriría decisión contable separada).
4. ~~Extender el backfill m020 a las 9 recepciones~~ → **EJECUTADO** (M022, DECISIÓN 5): 8 reconocimientos + ciclo completo reconocimiento+anulación para la revertida.
