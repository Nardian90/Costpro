# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 10-opening-design.md
# Diseño del documento de apertura (GATE 5) + deltas (G7) + Test (G8) + fecha (G9) + actor (G10)

## 1. Mecanismo canónico elegido (GATE 5)

**`register_stock_movement`** — RPC canónico vigente, SECURITY DEFINER, con pipeline de
triggers completo (inventory → kardex → sync products → business_events). Es la
preferencia explícita del mandato y NO se introduce ningún escritor paralelo.

Comparación con alternativas (ejecutada en diseño, sin ejecutar en DB):

| Alternativa | Veredicto | Motivo |
|---|---|---|
| `register_stock_movement('initial')` | **ELEGIDO** | Escritor canónico; enum ya tiene `initial`; kardex 'in' nativo; sync absoluto; BE automático |
| INSERT directo en stock_movements | Rechazado | Salta asserts del RPC (access check, q=0, store match parcial) — escritor paralelo de facto |
| UPDATE directo de inventory | Imposible/ilegítimo | `prevent_direct_inventory_modification` lo bloquea (y sería el patrón que causó el drift histórico) |
| UPDATE directo de products.stock_current | Prohibido | Es literalmente el estado huérfano actual; sin ledger no hay invariante |
| reset_store_data / restore | Prohibido | Destruye más estado del que repara (F4.1) |

### 1.1 Mapeo exacto del «documento de apertura»

| Campo exigido (mandato) | Valor de diseño | Dónde queda registrado |
|---|---|---|
| document_type | Apertura de reconciliación de inventario (movimiento único por producto) | stock_movements (1 fila/producto) + kardex_entries 'in' + business_events 'stock_movement' + 1 audit_logs de lote |
| movement_type | `'initial'` (enum nativo — sin ALTER ENUM) | stock_movements.movement_type; kardex 'in' |
| reference_id | `NULL` — el parámetro del RPC que alimenta reference_id es `p_sale_id` de **tipo uuid** y el batch id es un slug de texto; el batch queda en reference_doc (ver abajo). La trazabilidad del movimiento es su propio uuid (kardex.reference_id = movement.id) | stock_movements.reference_id; kardex_entries.reference_id |
| reference_doc | `'B10B-OBS2-RECON-OPENING:<batch_id>'` — p.ej. `B10B-OBS2-RECON-OPENING:20260907T120000Z-K7QF` (parámetro `p_reason`) | stock_movements.reference_doc; kardex_entries.reference_description (COALESCE(reference_doc,…)) |
| audit_action | `UPDATE_PRODUCT` automático NO se dispara (WHEN excluye stock-only); se añade **1 fila audit_logs de lote** action=`STOCK_RECONCILIATION_OPENING` con metadata {batch_id, products, units, estimated_value, evidence_pack, backup_ts, position_date, SHA256SUMS} | audit_logs (INSERT explícito dentro de la misma transacción) |
| date | `p_operation_date := now()` de ejecución (regularización). **No retro-fechada** | stock_movements.movement_date/created_at |
| actor | `p_user_id :=` usuario real firmante (admin con acceso canónico), autenticado por JWT en la sesión de ejecución → `created_by` y contexto audit coherentes | stock_movements.created_by; audit_logs.user_id |
| store | `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` (store_id del producto; validado por fn_sync_inventory_on_movement) | todas las filas |
| warehouse | **N/A** — inventory/stock_movements no tienen dimensión warehouse en este esquema; warehouse_stock de la tienda = 0 filas (verificado) → sin conflicto de doble stock | — |
| unit_cost | `= products.cost_average` del producto (assert estricto; 09-wac-model.md §2.4) | stock_movements.unit_cost; kardex unit_cost/total_value |
| notes | JSON de evidencia por producto: `{"batch":"<batch_id>","pack":"20260906-w9-b10b-obs2-repair-design","set":"A|B","confidence":"CONFIRMED","backup_qty":N,"position_date":"2026-08-16T22:01:13Z"}` (parámetro `p_notes`) | stock_movements.notes |

### 1.2 Firma del RPC por producto

```sql
SELECT public.register_stock_movement(
  p_product_id         => :product_id,                 -- uuid, del pack 07-proposed-opening.csv
  p_store_id           => 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
  p_quantity           => :opening_qty,                -- proposed_repair_qty (98 filas congeladas)
  p_movement_type      => 'initial',
  p_reason             => 'B10B-OBS2-RECON-OPENING:' || :batch_id,
  p_user_id            => :signer_user_id,             -- firmante humano real (GATE 10)
  p_variant_id         => NULL,
  p_sale_id            => NULL,                        -- reference_id queda NULL (uuid-type)
  p_unit_cost          => :cost_average,               -- exacto (assert)
  p_notes              => :evidence_json,
  p_operation_date     => now(),                       -- NO retro-fechada
  p_skip_access_check  => false                        -- el firmante DEBE tener acceso canónico
);
```

## 2. Productos con delta post-backup (GATE 7)

Los 4 productos Set B NO se consagran «porque existe stock_current»: cada delta está
**demostrado evento a evento** por el journal business_events sobreviviente
(`Σ qty == delta` y `último new_qty == current`; 04-post-backup-deltas.csv):

| # | Producto | Decisión de diseño | Justificación |
|---|---|---|---|
| 1 | Incorporar al valor actual | **da1c4090, f648c3f8, 5dd7ff57, 01301a54 (los 4)** | DELTA_CONFIRMED_BY_EVENTS — misma clase de evidencia que el frozen (F6.2); excluirlos dejaría fuera 1.466 u demostradas y rompería la identidad 6.427 |
| 2 | Excluir | — | No aplica: ningún delta quedó PROBABLE/UNKNOWN (si en re-validación de ejecución alguno dejara de cuadrar → ABORT, GATE 19) |
| 3 | Revisión humana | La lista completa (98 filas) va a firma | La firma aprueba el CSV fila a fila, incluidas las 4 filas Set B marcadas con su desglose de eventos |

Regla anti-asunción registrada: `current_stock` solo se consagra cuando (a) es igual al
backup (Set A) o (b) la cadena BE lo reconstruye exactamente (Set B). Ningún otro valor
es elegible para la apertura.

## 3. Los 10 productos Test (GATE 8)

**Tratamiento: `EXCLUDED_FROM_REPAIR`** (no entran en la apertura; sus filas NO se tocan:
sin inventory, sin movements, sin kardex, sin cambios de stock_current; quedan como
residuo clasificado visible para el detector permanente y para una decisión futura de
archivo/limpieza — fuera del alcance de esta reparación).

Evidencia de exclusión por producto (05-test-exclusions.csv; detalle F6.3):

| product_id (id8) | sku | stock | creado (UTC) | evidencia |
|---|---|---:|---|---|
| 7049d300 | WAC-1786067683 | 15 | 2026-08-07T01:54:45 | nombre/sku Test; compra prueba +5 (BE new_qty 15); WAC 4,00 |
| aa5e148b | TASA-EXT-1786067764 | 11 | 2026-08-07T01:56:09 | test de tasa extrema; WAC **1.090.908,00** |
| 94e53fd4 | VOID-1786067801 | 10 | 2026-08-07T01:56:43 | test de void; purchase +5 y salida sin BE (void) → 10 |
| 5bf782be | CONC-1786067801 | 15 | 2026-08-07T01:56:52 | test de concurrencia de recepción |
| 8f4e2708 | WACTRACE-1786068302 | 15 | 2026-08-07T02:05:03 | test de trazabilidad WAC |
| 185f1c6f | VOIDTRACE-1786068382 | 10 | 2026-08-07T02:06:25 | test void+trace |
| b7bd618c | WACFIX-1786068956 | 15 | 2026-08-07T02:15:58 | test fix WAC |
| 7dbff68e | WACFINAL-1786069134 | 15 | 2026-08-07T02:18:56 | test WAC final |
| e9541bb4 | WACFN-1786069224 | 10 | 2026-08-07T02:20:26 | purchase +5 y purchase_reverse −5 (BE) → 10 |
| 530e198c | PRODWAC-1786069598 | 10 | 2026-08-07T02:26:40 | idem patrón producción/WAC → 10 |

Razón formal: TEST_RESIDUE — creados en una ventana de 32 minutos por scripts de prueba,
nomenclatura Test explícita, nunca formaron inventario comercial, y consagrarlos además
**distorsionaría el valor patrimonial** (excluirlos descarta 12.000.481,33 de «valor»
inflado por WAC de test, dejando la apertura en 9.932.216,94 ESTIMATED real).

## 4. Fecha contable de apertura (GATE 9)

Comparativa de fechas disponibles (ninguna inventada):

| Fecha | Timestamp | Rol |
|---|---|---|
| Último estado confiable (posición) | **2026-08-16T22:01:13Z** (último BE = última actividad; última escritura products 22:01Z) | fecha de EVIDENCIA de la posición |
| Backup consistente | 2026-08-02T02:25:31Z | evidencia de respaldo (5.495 u) |
| Ventana del purge | 2026-08-17 02:00–02:50Z | hecho causal (root cause) |
| Último movimiento conocido | 2026-08-16T22:01:13Z (BE) | cierre de la cadena congelada |
| Ejecución de la reparación | por definir (fase de ejecución) | fecha de REGULARIZACIÓN |

**Propuesta:**

```text
opening_timestamp := fecha real de ejecución (p_operation_date = now())
opening_date      := la fecha natural de ese timestamp (NO retro-fechada)
position_date     := 2026-08-16T22:01:13Z  (documentada en notes + metadata de audit)
```

Justificación: (1) retro-fechar movimientos dentro de un kardex vivo corrompería el
orden cronológico del `balance_after`/`balance_quantity` y la semántica de WAC futuro;
(2) el mandato exige separar fecha de regularización y fecha de evidencia — aquí la
separación es explícita y viaja en los metadatos de cada fila; (3) el pack OBS-2 ya
recomendó «fecha = fecha de ejecución (NO retro-fechada)». Si la dirección contable
necesitara reflejar la posición a 2026-08-16 en libros externos, eso se resuelve con
nota de regularización externa apoyada en este pack, NO retro-fechando el ERP.

## 5. Identidad del actor (GATE 10)

```text
PROHIBIDO:  p_user_id arbitrario; suplantar al actor histórico del purge (UNKNOWN por
            evidencia — fabricarlo violaría el mandato); usuarios de prueba (audit-ph3-*,
            hot-test, admin@demo).
REQUERIDO:  p_user_id = usuario real de producción que FIRME la decisión humana, con
            acceso canónico vigente (has_store_access sin skip), autenticado por JWT en
            la sesión de ejecución (SET ROLE authenticated + request.jwt.claims) para que
            auth.uid(), created_by y el contexto de auditoría sean la misma persona.
CANDIDATO hoy (único con acceso canónico sin tocar memberships):
            051c6157-600b-425e-b8c0-72388bacf541 (admin@costpro.com, is_admin()=true,
            mismo tenant 5364ccf8). Alternativa: reactivar la membership admin de la
            persona que la dirección designe (decisión humana, fuera de esta fase).
MARCA DE NATURALEZA: la reparación se identifica como RECONCILIATION / OPENING BALANCE
            por tres sellos simultáneos: movement_type='initial' +
            reference_doc='B10B-OBS2-RECON-OPENING:<batch>' + audit_logs action=
            'STOCK_RECONCILIATION_OPENING' — distinguible de TODO movimiento histórico
            normal (ningún movimiento de operación usa ese reference_doc).
```

## 6. Efecto esperado exacto en DB (por ejecución futura)

```text
stock_movements        +98  (1 por producto, 'initial', reference_doc=batch)
inventory              +98  (0 → 98 filas, quantity=Q, version=1)
kardex_entries         +98  ('in', 1:1, reference_id=movement_id)
business_events        +98  ('stock_movement', new_qty=Q)
audit_logs             +1   (lote STOCK_RECONCILIATION_OPENING)
wac_change_log         +0   (WAC invariante)
products               +0 filas (98 filas: updated_at cambia; stock_current y
                              cost_average SIN CAMBIOS — la apertura reconoce,
                              no reescribe)
transactions/payments/  +0  (neutralidad financiera — 14-financial-neutrality.md)
commissions/devolutions/
receipts/transfers
```
