# 01_BASELINE — Diagnóstico inicial

**Misión:** DATA-INTEGRITY-REMEDIATION-001 · **Fecha:** 2026-11-08 · **Base:** producción CostproBD (`wthkddeleylijmonclxg`) vía dump fiel `20261108-0056` (RESPALDO-COSTPRODB) restaurado en clúster PostgreSQL 17 local de verificación (socket-only, aislado). Verificaciones en vivo: read-only (PostgREST/Storage API con service-role) — jamás se ejecutó una escritura SQL contra producción.

---

## A. Punto de partida declarado por la misión

| Problema | Registros | Origen del hallazgo |
|---|---|---|
| A — versiones de reglas de comisión huérfanas (`rule_id` → regla inexistente) | 72 | fallos de FK al restaurar el dump (informe-restauración-20261108-0056.md §5) |
| A — referencias a perfiles inexistentes (`changed_by`) | 18 | ídem |
| A — posiciones de pedido huérfanas (`po_id`/`product_id`) | 10 | ídem |
| B — objetos de Storage sin archivo físico (bucket `stores`) | 31 | manifiesto storage-20261108-0056.json (`objetos_fantasma`) |

Las 4 constraints figuran **validadas** en producción (`pg_constraint.convalidated=true`), lo que solo es posible si las filas huérfanas entraron con los triggers de FK desactivados (p. ej. `session_replication_role=replica`).

## B. Conteos de referencia medidos sobre la copia fiel (antes de toda modificación)

| Métrica | Valor |
|---|---|
| `commission_rule_versions` — filas totales | 73 |
| — huérfanas por `rule_id` | **72** (el 98,6 % de la tabla; 72 reglas padre distintas) |
| — huérfanas por `changed_by` | **18** (17 perfiles distintos; todas ∈ de las 72 de arriba) |
| — versión no huérfana (regla viva) | 1 (regla `79fc05ac` de ENERVIDA, product_specific, creada 2026-10-14) |
| `commission_rules` — reglas vivas | 1 |
| `purchase_order_items` — filas totales | 10 |
| — huérfanas por `po_id` (`purchase_orders` **vacía**) | **10** |
| — huérfanas por `product_id` (4 productos muertos) | **10** |
| `storage.objects` bucket `stores` — filas | 31 (todas anidadas en carpetas) |
| `stores` — tiendas vivas | 6 (ENERVIDA-VITALLCONS, FERROCARRIL, PUERTO PADRE, SHADDAI, QA UI Icons, COSTPRO (Prueba)) |
| `workers` — vivos | 54 (53 en COSTPRO (Prueba), 1 en ENERVIDA) |
| `commission_payments` — totales | 1 (paid, 300,00; referencia la regla VIVA) |

## C. Restricciones y contexto de esquema

- `commission_rule_versions` es una **tabla de snapshots** (columna `snapshot` jsonb, `changed_at`, `change_reason`), alimentada por el trigger `commission_rules_snapshot` en cada INSERT/UPDATE de regla (`snapshot_commission_rule()`, migración `20260715000001`): captura type, value_percent, fixed_value, salary_amount, base_calculation, priority, valid_from/to, worker_id, store_id, min/max_price, product_commission_amount.
- FKs originales: `rule_id → commission_rules ON DELETE CASCADE`, `changed_by → profiles` (NO ACTION), `po_id → purchase_orders ON DELETE CASCADE`, `product_id → products` (NO ACTION).
- `purchase_order_items` es **snapshot comercial autónomo**: `product_name`, `sku`, `quantity_ordered`, `quantity_received`, `unit_cost`, `unit_of_measure` — y está **en uso activo** (`src/app/api/purchase-orders/[id]/route.ts`, documento legal SC-2-01 `src/lib/legal/sc201.ts`, flujo E2E `purchase-orders-flow.spec.ts`).
- El handler de borrado de reglas (`DELETE /api/commissions/rules/[id]`) ejecuta `DELETE FROM commission_rules` **confiando en el CASCADE** — lo que destruye silenciosamente todo el histórico de versiones de la regla borrada por UI.

## D. Lecturas vivas (read-only) de partida

- Bucket `stores`: 31 filas en `storage.objects`, todas bajo carpetas (`store-banners/`, `store-logos/`, `store-promo-images/`, `store-signatures/`, `store-stamps/`).
- Referencias vivas en `stores`: 10 — ENERVIDA (logo, banner, firma, sello, 3 promos) y COSTPRO (Prueba) (logo, firma, sello).
- Bucket `reports`: 122 filas (`reports/cost_sheet/…` etc.), bucket `product-images`: 151 (raíz), `salva`: 1 (raíz).

## E. Estado final del diagnóstico (resumen; detalle en 02)

- **Problema A (72/18/10): REAL y confirmado.** Huérfanos de FK en producción con causa estructural (borrados masivos con triggers desactivados + diseño CASCADE destructivo en tablas de histórico). Remediado por las migraciones A y C.
- **Problema B (31 objetos inexistentes): FALSO POSITIVO del descargador del respaldo** (ver 02 §D). Los 31 archivos existen físicamente con sus bytes exactos. El defecto REAL descubiertо es que el **respaldo 7z original no contiene los 153 objetos anidados** (31 de `stores` + 122 de `reports`) — corregido con el addendum cifrado `costpro-respaldo-addendum-storage-20261108-0056.7z` (verificado por hash) y el descargador arreglado.

## F. Entorno de verificación

- Clúster PG 17.11 local socket-only (`tools/pg17`), BD `costpro_integrity`, restaurada con `pg_restore --no-owner --no-privileges` (7 errores esperados: 4 FK huérfanos + 3 vault) — **jamás** se apuntó a producción para escritura.
- Producción solo se tocó por API con service-role: 4 PUT idempotentes de restauración de imágenes (detalle en 04 §R1) y verificaciones GET/HEAD.
