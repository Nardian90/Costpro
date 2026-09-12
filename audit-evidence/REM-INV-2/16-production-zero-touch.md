# REM-INV-2 — 16: PRODUCCIÓN ZERO-TOUCH

Regla aplicada: ENERVIDA-VITALLCONS y Puerto Padre VITALLCONS (y todo el resto de stores) **READ ONLY** durante todo el gate. Cero INSERT/UPDATE/DELETE/UPSERT/RPC mutativa contra producción.

## 1. Canales usados contra producción (todos SELECT-only)

| Canal | Operaciones |
|---|---|
| Management API `database/query` | 100% SELECT: catálogos `pg_proc`/`pg_trigger`/`pg_depend`/`information_schema`/`pg_policy`, conteos, fingerprints |
| Ningún otro | No se usó el pool de la app, ni service-role keys de escritura, ni RPC mutativas |

## 2. Fingerprints PRE/POST (SELECT-only) — bitwise identical

Payload comparado: por-store `counts` (transactions, payment_transactions, stock_movements, receipts, receipt_items, purchase_orders, inventory_adjustments, devolutions) + globales (purchase_items, purchase_order_items, kardex_entries, products, audit_logs) + `max_created_at`/`max(updated_at)` + `po_status` (distribución de estados de OC) + `inventory` (n, qty_sum, max_upd) + catálogo de funciones de recepción con ACL + internal_callers de receive_purchase.

```text
pre  captured_at: 2026-09-12T23:20:07.822Z
post captured_at: 2026-09-12T23:36:00.876Z
RESULT BITWISE IDENTICAL: true
pre  canonical sha256: c17762aaa6080108d1c70b87c281efeb8516c571bc256d377c49c8a5e1b1c44a
post canonical sha256: c17762aaa6080108d1c70b87c281efeb8516c571bc256d377c49c8a5e1b1c44a
(Normalización: 'captured_at' y 'mode' son etiquetas de metadatos de captura, no datos de producción)
```

Valores clave verificados idénticos PRE/POST (extracto):

| Store | transactions | payments | receipts | receipt_items | stock_movements | inventory |
|---|---|---|---|---|---|---|
| **ENERVIDA-VITALLCONS** | 308 | 154 | 4 | 110 | 451 | 106 / Σ4012.5 |
| **Puerto Padre VITALLCONS** | 212 | 212 | 2 | 39 | 251 | 35 / Σ966.1289 |

Globales idénticos: `purchase_items=0`, `purchase_order_items=9`, `kardex_entries=1021`, `products=367`, `audit_logs=8144`. ACL de `receive_purchase` sin cambios; `internal_callers_receive_purchase` = ∅ en ambas capturas.

## 3. Nota RLS (análisis, sin modificación)

Las políticas DENY de `inventory`/`stock_movements` son **PERMISSIVE** (`polpermissive=true`), por lo que operan en OR con las políticas de acceso (p. ej. `inventory_insert_auth` permite INSERT a miembros de la tienda). Este gate **no modificó ninguna política** — se registra como observación para un gate RLS futuro (no degradada por este gate; el único camino de escritura autenticado hacia `purchase_items` no existe: sin políticas INSERT/UPDATE/DELETE sobre esa tabla).

## 4. Staging aislado

Todas las pruebas mutativas (06–13) corrieron en PostgreSQL efímero local (pgserver, datadir desechable, socket unix, credenciales de producción jamás presentes). Sin docker/psql nativo en el entorno; pgserver instalado vía pip (binarios embebidos, sin root). Al finalizar, el datadir es desechable y no contiene datos productivos.

## Veredicto

**PRODUCTION ZERO-TOUCH: PASS** — datos productivos bitwise idénticos antes/después del gate completo (auditoría + staging + remediación + regresión).
