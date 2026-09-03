# W9.4.7 — H5-B1 · FASE 10 — Gap analysis

Fecha: 2026-09-03 · Base: FASE 9 (`09-v1-v2-contract.md`), probes FASE 11, árbol G1 (FASE 4).

## Clasificación de diferencias V1→V2

| # | Diferencia | Clase | Justificación |
|---|---|---|---|
| 1 | V2 usa `register_stock_movement` (pipeline stock_movements→kardex) en vez de UPDATE directo a products/lotes + INSERT kardex | **INTEGRITY IMPROVEMENT** | single-writer W7; PR-4.3 eliminó double-writers |
| 2 | V2 escribe `audit_logs` (action=REVERSE_TRANSACTION_V2); V1 no audita | **INTEGRITY IMPROVEMENT** | trazabilidad con actor real |
| 3 | V2 `FOR UPDATE`; V1 sin lock | **INTEGRITY IMPROVEMENT** | evita carrera de doble reversión |
| 4 | V2 idempotente si voided; V1 error ERR_ALREADY_VOIDED | **INTEGRITY IMPROVEMENT** | retry-safe |
| 5 | search_path `public, pg_temp` vs `public` | **SECURITY IMPROVEMENT** | endurecimiento estándar W9 |
| 6 | `ERR_TX_NOT_FOUND` → `ERR_TRANSACTION_NOT_FOUND`; `ERR_ALREADY_REVERSED/VOIDED` → `ERR_INVALID_STATUS`/idempotent | **SAFE DIFFERENCE** | route.ts mapea por substring (`_NOT_FOUND`→404, etc.); comportamiento productivo vigente desde 2026-08-08 |
| 7 | Estado final `voided` (V2) vs `reversed`+columnas reversed_* (V1) | **SAFE DIFFERENCE** | 0 lectores de `reversed_at/reversed_by/reversal_reason` como filtro en app (solo tipos opcionales y comentarios); el flujo productivo ya produce `voided` hace ~1 mes |
| 8 | Respuesta `items_reversed` (V1) vs `units_restored` (V2) | **SAFE DIFFERENCE** + HALLAZGO P3 | route.ts devuelve el jsonb sin transformar; `useReverseDocument.ts:82` hace `data.items_reversed ?? 0` → toast muestra "0 ítems" desde que V2 es canon. **PRE-EXISTENTE, no causado por el DROP** (V1 ya no se llama). Registrado como HALLAZGO H5-B1-OBS-1, no se corrige aquí (fuera de scope, REGLA 3) |
| 9 | V1 restauraba `product_lots.quantity_remaining` directamente; V2 delega a register_stock_movement | **INTEGRITY IMPROVEMENT** (cubierto) | el pipeline W7 gestiona lotes/FEFO centralizadamente (auditado en W7/H-4) |
| 10 | Ninguno: pagos no reseteados en ambas | PARIDAD | limitación común pre-existente (deuda separada, fuera de scope H5-B1) |

## FUNCTIONAL GAP (V1 soportaba algo que V2 no)

**NINGUNO.** Todos los casos de uso vivos (revertir venta `completed` con devolución de stock/kardex, protección cross-store, neutralización de p_user_id forjado) están cubiertos por V2 con igual o mayor garantía.

## REGRESSION (V2 perdió capacidad legítima)

**NINGUNA identificada.** Las únicas capacidades exclusivas de V1 (escribir `reversed_at/reversed_by/reversal_reason`, error explícito ERR_ALREADY_REVERSED) son efectos de la era V1 sin consumidores activos (FASE 5) y sin lectores de aplicación (FASE 9, verificación grep).

## Hallazgos nuevos (REGLA 3 — registrar, no expandir scope)

| ID | Severidad | Descripción | Disposición |
|---|---|---|---|
| H5-B1-OBS-1 | P3 | `useReverseDocument.ts` consume `items_reversed` de la respuesta; V2 devuelve `units_restored` → toast informativo muestra "0 ítem(s)" en reversiones transaction. Pre-existente (V2 es canon desde 2026-08-08). No bloquea el DROP | BACKLOG (fix cosmético futuro: leer `units_restored`) |
| H5-B1-OBS-2 | P3 | `route.ts` mantiene mapeos de error de V1 (`ERR_ALREADY_REVERSED`→409) que quedan sin emisor tras el DROP; inofensivo (matching por substring) | BACKLOG (limpieza futura) |

## Veredicto FASE 10

0 FUNCTIONAL GAP · 0 REGRESSION · 3 SECURITY/INTEGRITY IMPROVEMENTS · 2 SAFE DIFFERENCES · 2 hallazgos P3 documentados. **Sin blockers.**
