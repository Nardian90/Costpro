# W9.5 — B-10b-OBS-2 · 11-root-cause.md
# ROOT CAUSE — cadena completa de evidencia (GATE 12)

## Enunciado del ROOT CAUSE

```text
ROOT CAUSE = PURGE SQL DIRECTO store-scoped (≈2026-08-17 02:00-02:50 UTC) que borró
las filas de d1c4ba0e en inventory, stock_movements, kardex_entries, transactions,
transaction_items, receipts, receipt_items, transfers y payment_transactions —
FUERA del pipeline reset_store_data/restore (sin audit, sin sessions) — dejando
INTACTAS products (con su stock_current), devolutions, audit_logs, warehouses,
commission_rules, z_reports, inventory_reservations y user_store_memberships.

El stock huérfano (108 productos / 6.553 u) ES el estado pre-purge de
products.stock_current, congelado fila a fila; no fue escrito por ningún writer
posterior (0 updates a products después del 2026-08-16T22:01Z).
```

NOTA: el agente ejecutor concreto (quién corrió el SQL) es IRRECUPERABLE — no existe
ningún registro (audit, sessions, logs de la plataforma no accesibles). Se identifica
el MECANISMO exacto y la ventana temporal; el actor queda `UNKNOWN/HISTORICAL`
(no se inventa actor).

## Cadena de evidencia (cada eslabón verificado en raw/)

1. **Origen del stock — import masivo 2026-07-30T03:00Z**
   - 114 productos creados en 29 s (created_at 03:00:03.052 → 03:00:32.625; raw/g10).
   - 66 con `updated_at = 2026-07-30T03:00:32` EXACTO y 12+ con mediodías fijos
     07-16..07-28 12:00:00 (raw/g5 burst) — timestamps ANTERIORES a created_at →
     filas insertadas con timestamps externos (firma de seed/import).
   - Ledger retroactivo completo: `stock_movements.movement_date` min = **2026-07-16
     12:00:00** fijo (raw/g10) — mismo patrón documentado en
     `docs/BACKUP_RESTORE_INVENTORY_TRUTH_MODEL.md:97-127` para imports legacy.
   - audit_logs de la tabla products: **0 filas** pese a existir trigger
     `audit_product_changes` vivo → inserción con triggers deshabilitados
     (`session_replication_role='replica'`, patrón de `DEMO_RESET_SCRIPT.sql:9`).
   - Escribir stock sin ledger es imposible vía app/RPC (05-stock-writers.md §8).

2. **Operación real 07-30 → 08-17** (ledger consistente)
   - Backup exportado 2026-08-02T02:25:31Z (payload verificado): 114 products /
     114 inventory / 242 movements / 242 kardex / 20 transactions —
     **prod==inv==Σmovements en 114/114 (Σ 5.495 u)**; tipos: purchase +6.223,5
     (109), sale −722,5 (115), transfer_out −15 (12), transfer_in +9 (6).
   - Post-08-02: ventas/auditoría hasta 08-17 (raw/g3), 13 devoluciones (08-04..08-07),
     10 productos Test creados 08-07 por scripts (raw/g10 not_in_backup).

3. **El purge — post 08-17 02:00-02:50 UTC**
   - Supervivencia medida (raw/g13): inventory 114→0, movements 242→0, kardex 242→0,
     transactions 20→0, receipts 1→0, transfers 5→0, payments 66→0; products 114→114,
     devolutions 0→13(preservadas), audit 105→365(preservada), warehouses 3→3,
     commission_rules 60→60, z_reports 6, reservations 8, memberships 9.
   - Datación: autovacuum de receipts/receipt_items 2026-08-17T02:36-37 tras dead
     tuples masivos (del 80/2.433 = TODAS las filas históricas; raw/g11) + último
     audit 02:48:46 + cero actividad posterior.
   - NO fue `reset_store_data`: ninguna de sus 7 versiones deja stock>0 (06-reset-
     analysis.md §1); 0 eventos store_reset para la tienda; ACL vigente registra solo
     la ruta API (que además audita).
   - NO fue restore: 0 sesiones ejecutadas para la tienda; 0 audit backup/restore
     tras 08-01.
   - NO fue migración 20260820000004 (08-20): productos con updated_at ≤ 08-16.

4. **Congelación — el stock de hoy es el stock de ayer al purge**
   - 110/114 productos del backup: `stock_current` HOY == `stock_current` del backup
     == `inventory.quantity` del backup (raw/g10 per_product, frozen=true).
   - 4 productos difieren (mutados por operaciones 08-04..08-17, p.ej. f648c3f8
     501→497) — delta no reconstruible 1:1 (audit sin items).
   - 10 Test fuera del backup con 126 u (scripts test, stock directo).

## Clasificación de writers (respuesta GATE 12)

```text
products.stock_current (estado huérfano actual)
        ↑  (no escrito; HEREDADO por omisión del purge)
purge SQL directo store-scoped ≈2026-08-17 02:0x-02:5x UTC  [UNKNOWN/HISTORICAL actor]
        ↑  (borró ledger, preservó products)
estado pre-purge = import 2026-07-30 03:00 UTC (114 products + ledger retroactivo,
triggers OFF) + operación comercial real 07-30..08-17 (pipeline canónico)
        ↑
seed/import externo con timestamps fijos (patrón DEMO_RESET_SCRIPT / truth-model §legacy)
```

## ¿Incidente local o defecto sistémico? (GATE 11/12)

- Escaneo global (raw/g13): **142 huérfanos en TODA la BD, 100% ORPHAN_FULL,
  0 MISMATCH, 0 ORPHAN parcial**:
  - `d1c4ba0e` 108 / 6.553 u — tienda ACTIVA (este caso).
  - `11111111` "Tienda Auditor" 5 / 189 u — ARCHIVED.
  - ~25 tiendas `HOT */E2E/TEST*` ~34 / ~366 u — ARCHIVED (residuo de pruebas,
    mismo patrón: writers directos de test).
  - `dcfd74bf` "Store Tenant 2" 1 / 10 u — ARCHIVED.
- Las tiendas comerciales vivas (43a4dabc, 5e6fe821) están 100% consistentes
  (stock==inventory==Σmovements en todos sus productos con stock).
- **Conclusión**: defecto PUNTUAL (purge ad-hoc + residuos de test), NO sistémico del
  pipeline. El pipeline canónico vigente no produce huérfanos (probado globalmente).

## Impacto económico (GATE 13, resumen — detalle en 12-economic-impact.csv)

- 6.553 u × cost_average (WAC vigente) = **21.932.698,27 (ESTIMATED)**.
- Desglose por origen: 110 frozen ≈ stock respaldado por backup (5.495 u al 08-02 +
  delta real 08-04..08-17); 4 mutados (delta desconocido); 10 Test (126 u) con
  cost_average de prueba.
- **Financiero: 0** — payment_transactions de la tienda purgadas JUNTO con
  transactions (66→0): NO existen pagos huérfanos (raw/g13 orphan_payments_check=0);
  commission_payments global = 0; commission_rules (config) intactas.
- WAC: cost_average de los 108 intacto desde el purge (products no tocado); el
  `w62_guard_wac_writer` vigente impide writers no autorizados.

## Riesgo operativo actual (input para GATE 14)

Con `stock_current>0` e `inventory` inexistente, una venta canónica por
`register_stock_movement` haría upsert de inventory desde 0 (qty final negativa) y el
trigger `prevent_negative_inventory` (vivo, pg_trigger) podría BLOQUEAR ventas de esos
productos — la tienda activa está operando con catálogo cuyo stock no es vendible por
el pipeline canónico. Esto hace que la decisión (GATE 14/18) NO sea cosmética.
