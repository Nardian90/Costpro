# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 02-forensic-facts.md
# FORENSIC_FACTS — únicamente hechos demostrados (GATE 1)

Fuentes primarias: pack forense `audit-evidence/20260906-w9-b10b-obs2/` (SHA256SUMS 44/44 OK,
commit 7dfcaeea) + capturas frescas de esta fase en `raw/` (g21_pre, g2_universe, g5_funcdefs,
g5_triggers, g5_triggerfns, g5_triggerdefs, g2_cols, g10_actor). Cada hecho cita su fuente.
NINGÚN hecho de esta lista ha sido re-inferido sin contrastar.

## F1 — Identidad del alcance

- F1.1 Tienda afectada: `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` «TIENDA CENTRAL COSTPRO»,
  activa, tenant `5364ccf8-…`, Puerto Padre, Las Tunas, Cuba. [raw/g10_actor.json store_row]
- F1.2 Universo U de la tienda: 124 productos (ninguno borrado: deleted_at ausente en
  esquema; `status`/`is_active` por fila en raw/g2_universe.json). [raw/g2_universe.json]
- F1.3 108 productos con `stock_current > 0` y 0 en inventory/stock_movements/kardex/
  transactions → ORPHAN_FULL; 16 con stock 0. Σ = 6.553 u. [PRE g21_pre + raw/g2_universe]

## F2 — Estado del ledger (verificado fresco en esta fase)

- F2.1 inventory (tienda) = 0 filas; stock_movements = 0; kardex_entries = 0;
  transactions = 0; transaction_items = 0; receipts = 0; transfers = 0;
  payment_transactions (vía tx de la tienda) = 0. [raw/g21_pre.json, raw/g2_universe.json]
- F2.2 Sobrevivieron al purge: products (124), devolutions (13) + devolution_items (13),
  audit_logs (365 en ventana 07-29..08-19), warehouses (3, sin warehouse_stock),
  inventory_reservations (8), commission_rules, z_reports, memberships. [raw/g2_universe]
- F2.3 El resto de la BD sigue poblada y consistente: inventory_all 141 / movements 702 /
  kardex 702 / transactions 520 / payments 366. [raw/g21_pre.json]

## F3 — Backup 2026-08-02 (payload completo, consistente)

- F3.1 Payload `costpro-store-backup` v2.0, exportado **2026-08-02T02:25:31Z** para la
  tienda d1c4ba0e; truthModel: products=primary, inventory=primary, kardex=audit,
  stock_movements=audit. [OBS-2 raw/g10_payload.json meta]
- F3.2 Conteo: 114 products / 114 inventory / 242 stock_movements / 242 kardex / 20
  transactions; Σ inventory = Σ products.stock_current = **5.495 u**;
  consistencia: prod_equals_inv=114, inv_without_prod=0, prod_without_inv=0. [idem]
- F3.3 El payload NO contiene WAC por producto (per_product: id, sku, name, b_inv, b_upd,
  b_stock, t_stock, stock_frozen, stock_eq_binv). [idem — verificado campo a campo]

## F4 — Root cause y ventana temporal (heredado de OBS-2, no re-inferido)

- F4.1 ROOT CAUSE: purge SQL directo store-scoped ≈ **2026-08-17 02:00–02:50 UTC** fuera de
  todo pipeline auditado (0 eventos audit; 0 restore_sessions; ninguna de las 7 versiones
  de reset deja stock>0). Actor histórico: UNKNOWN/IRRECUPERABLE. [OBS-2 11-root-cause.md]
- F4.2 Última escritura a products: **2026-08-16T22:01Z**; 0 escrituras posteriores.
  [OBS-2 17-final-verdict; re-verificado: max(BE.created_at)=2026-08-16T22:01:13.103154+00]
- F4.3 El stock huérfano ES el estado pre-purge de products.stock_current, congelado fila
  a fila. [OBS-2 + V1/V3b de esta fase, ver F7]

## F5 — Journal business_events (DESCUBRIMIENTO NUEVO de esta fase)

- F5.1 `business_events` NO fue purgada: 599 eventos para productos de la tienda, de los
  cuales **425 son `stock_movement`** con payload {store_id, qty, type, new_qty}. 
  [raw/g2_universe.json business_events_for_products]
- F5.2 Composición temporal del journal: 109 del import masivo (2026-07-30T03:00:32.744),
  133 operaciones pre-backup (07-30..08-02), **183 post-backup (08-02..08-16)**. 
  [scripts/build_repair_universe.js → BE JOURNAL line]
- F5.3 El journal es PARCIAL: las ventas insertan stock_movements directamente (sin pasar
  por register_stock_movement) y por tanto no generan BE. Evidencia: 24 productos Set A
  tienen su último BE en el import 07-30 con new_qty = cantidad importada, y su stock
  bajó después por operaciones registradas SOLO en el ledger purgado; el backup 08-02
  capturó esos valores y current == backup. [V3b refinado, build_repair_universe.js]
- F5.4 Último evento BE de la tienda: 2026-08-16T22:01:13Z — dentro de la ventana de
  operación, ANTES del purge; 0 actividad BE después. [V2 check]

## F6 — Clasificación del universo (esta fase, determinista)

- F6.1 **Set A — FROZEN_MATCH**: 110 productos del backup con `current == b_inv` (delta 0);
  de ellos **94 con stock > 0** (Σ 4.961 u) y 16 con stock 0. [03-repair-universe.csv]
- F6.2 **Set B — mutados post-backup**: 4 productos, delta total **+932 u**, y el delta está
  EXACTAMENTE explicado por la cadena BE sobreviviente (Σ qty == delta y
  último new_qty == current para los 4): 
  · da1c4090 CAT-0002: 32 → 966 (+934; 146 eventos: 84 sale, 12 sale_reverse, 13 return,
    6 sale_void, 3 transfer_out, 10 purchase, 1 purchase_reverse, 7 issue_slip_out,
    7 issue_slip_reverse, 3 adjustment) 
  · f648c3f8 CAT-0081: 501 → 497 (−4; 13 eventos issue_slip/production) 
  · 5dd7ff57 CAT-0010: 1 → 2 (+1; 3 eventos) 
  · 01301a54 CAT-0021: 0 → 1 (+1; 1 adjustment). 
  Clasificación: **CONFIRMED** (no PROBABLE, no UNKNOWN). [04-post-backup-deltas.csv]
- F6.3 **Set C — TEST_RESIDUE**: 10 productos «Test» creados **2026-08-07T01:54–02:26Z**
  (sesión de tests), stock 126 u originado vía compras de prueba registradas en BE
  (qty 5/+1 → new_qty 15/11; dos con purchase_reverse −5 → 10). Nunca fueron inventario
  comercial. WAC inflado por diseño del test (TASA-EXT **1.090.908,00** → valor excluido
  12.000.481,33). [05-test-exclusions.csv + BE + OBS-2 07-ledger-reconstruction]
- F6.4 Verificación de la cadena congelada (V3b): para TODO huérfano con stock>0 se cumple
  (último BE pre-backup Y current==backup) Ó (último BE new_qty == current). PASS 108/108.
  [build_repair_universe.js V1–V8: ALL CHECKS PASS]

## F7 — Identidades matemáticas demostradas

- F7.1 5.495 (backup) + 932 (deltas confirmados) = **6.427** = 6.553 (actual) − 126 (Test).
  [V4 check]
- F7.2 21.932.698,27 (valor huérfano total OBS-2) = 9.932.216,94 (reparable: 9.780.688,78
  Set A + 151.528,16 Set B) + 12.000.481,33 (Test excluido). Cuadre exacto.
  [build_repair_universe.js + OBS-2 12-economic-impact.csv]

## F8 — WAC

- F8.1 Fuente única vigente: `products.cost_average` (frozen pre-purge). Escritor único
  forzado por trigger `trg_guard_wac_writer` (BEFORE UPDATE **OF cost_average**, token
  `app.wac_writer='fn_recalc_wac'`). [raw/g5_triggerdefs.json]
- F8.2 `wac_change_log` de la tienda: 0 filas (global 14). 0 cambios de WAC registrados
  jamás para d1c4ba0e. [raw/g21_pre.json]
- F8.3 Los 98 productos reparables tienen cost_average finito y > 0 → **WAC_CONFIRMED
  98/98; WAC_UNKNOWN: 0**. [06-wac-analysis.csv, V5/V8 checks]

## F9 — Mecánica canónica (congelada por definición de función/trigger)

- F9.1 Enum `movement_type` ya incluye **`initial`** (y kardex lo mapea a 'in':
  `WHEN NEW.movement_type IN ('purchase','initial') THEN 'in'`). Sin ALTER ENUM.
  [raw/g5_funcdefs.json + raw/g5_triggerfns.json auto_kardex_on_stock_movement]
- F9.2 `register_stock_movement` (SECURITY DEFINER): INSERT en stock_movements con
  reference_id = p_sale_id::text (tipo uuid), reference_doc = p_reason (text),
  movement_date = COALESCE(p_operation_date, NOW()); luego
  `UPDATE products SET stock_current = v_new_qty` (**ABSOLUTO** = balance_after);
  NO recalcula WAC (hotfix A2 v2.22.0); inserta business_events('stock_movement'). 
  [raw/g5_funcdefs.json]
- F9.3 `fn_sync_inventory_on_movement` (BEFORE INSERT): si inventory no existe y q>0 →
  INSERT inventory(quantity=q), balance_after=q; si existe → quantity += q; rechaza
  negativos (ERR_INSUFFICIENT_STOCK); valida store match. [idem]
- F9.4 AFTER INSERT en stock_movements: `trg_auto_kardex` (1 fila kardex por movimiento,
  reference_type='stock_movement', reference_id=id del movimiento,
  reference_description=COALESCE(reference_doc, type), balance_* leídos de products en
  ese instante) y `trg_sync_product_stock` (stock_current = último balance_after —
  ABSOLUTO). Ambos writers escriben el mismo valor absoluto → sin doble conteo. [idem]
- F9.5 `trg_sync_products_stock_current` (inventory AFTER INSERT/UPDATE): stock_current =
  NEW.quantity (absoluto). `prevent_direct_inventory_modification`: bloquea UPDATE directo
  de inventory salvo postgres/pg_trigger_depth>1. `prevent_negative_inventory`: q<0 bloqueado.
  [raw/g5_triggerfns.json]
- F9.6 `trigger_audit_product_changes` tiene WHEN (name/price/cost_price/sku/price_currency
  DISTINCT) → un UPDATE solo-de-stock NO genera audit_logs. [raw/g5_triggerdefs.json]
- F9.7 `has_store_access(p_store_id)`: true si `is_admin()` (profiles.role='admin' con
  auth.uid()) o membership activa. [raw/g5_triggers.json]

## F10 — Actor y membresías (estado actual)

- F10.1 Membresías de la tienda: 9; **8 revoked** (incl. 2 admin: admin@demo.com,
  admin@costpro.com) y 1 active: `audit-ph3-a` (clerk, usuario de prueba de auditoría).
  [raw/g2_universe.json memberships]
- F10.2 Admins globales activos (profiles.role='admin'): admin@demo.com (a1111111),
  **admin@costpro.com (051c6157-600b-425e-b8c0-72388bacf541)**, hot-test@costpro.local
  (f0750794). is_admin() da acceso a cualquier tienda. [raw/g10_actor.json]
- F10.3 Conclusión: la ejecución canónica con `p_skip_access_check=false` es posible HOY
  solo vía admin global; la designación de la persona firmante es decisión humana.

## F11 — Hechos de seguridad de la fase

- F11.1 Zero mutation: PRE capturado al inicio (g21_pre); POST idéntico re-verificado al
  cierre (20-zero-mutation.md). 0 escrituras en toda la fase.
- F11.2 Funciones congeladas de referencia (hash en OBS-2 B-10b): register_stock_movement,
  fn_recalc_wac, fn_sync_inventory_on_movement, reverse_devolution — sus definiciones
  capturadas en raw/g5_*.json coinciden con la semántica aquí documentada.
- F11.3 `idempotency_registry`/`idempotency_keys` existen pero son de uso HTTP/request;
  0 registros con marcadores RECON/B10B-OBS2 (ningún intento previo de reparación).
  [raw/g2_universe.json idempotency_registry_recent=0]
