# 03 — DB BEFORE (estado vivo pre-migración, SELECT-only)

**Fuente raw:** `evidence/remf404-db-inspection.txt` (25 KB, §A1–A12, 2026-09-09T01:35Z)
**Definiciones preservadas:** `evidence/register_reception_live.sql`,
`evidence/confirm_pending_reception_live.sql`,
`evidence/register_stock_movement_live.sql`,
`evidence/remf404-fn-defs-part2.json`

## Hallazgos clave ANTES de la migración

### A4 — Triggers (smoking gun del root cause)

| Tabla | Triggers vivos |
|---|---|
| `products` | `trg_ensure_product_barcode`, `trg_guard_wac_writer`, `trg_maintain_product_completeness`, `trigger_audit_product_changes` |
| `receipt_items` | `trg_check_reception_cost_variation`, `trg_sync_has_movements_receipt` |

→ **`trg_update_product_wac` NO EXISTE** (aunque ≥6 migraciones del repo lo
referencian). En su lugar sí existe el guard `trg_guard_wac_writer` (W62).

### A3 — `register_reception` viva (defectuosa)

Delega WAC a los mecanismos muertos (comentario «A1 WAC HOTFIX v2.22.0»).
Firma: `(p_store_id uuid, p_supplier text, p_reception_date timestamptz
DEFAULT now(), p_invoice_number text DEFAULT '', p_items jsonb DEFAULT '[]',
p_user_id uuid DEFAULT NULL, p_po_id uuid DEFAULT NULL) RETURNS uuid`,
SECURITY DEFINER, `search_path = public`.

### A5/A6 — Guard vigente

`trg_guard_wac_writer BEFORE UPDATE OF cost_average ON products FOR EACH ROW
EXECUTE FUNCTION w62_guard_wac_writer()` — rechaza cualquier escritura de
`cost_average` que no provenga de `fn_recalc_wac`.

### A7 — Escritores de `cost_average`

Único escritor directo: `fn_recalc_wac` (+`reset_store_data` como reset total
documentado). Delegadores y lectores: ver 01_ROOT_CAUSE.md.

### A8 — ACL de funciones WAC

Grants EXECUTE a `authenticated`/`service_role` según diseño; sin cambios por
la remediación (verificado post-apply §B4).

### A9–A12 — Fixtures de auditoría

Stores `AUDIT F4E1 STORE A/B` disponibles; productos fixture (Arena, Cemento,
Viga) en estado controlado; memberships verificadas para pruebas de
aislamiento multitienda.

## Deuda histórica (separada de este defecto — backlog F-08)

Productos con `stock > 0 ∧ cost_average = 0` pre-existentes en producción:
110/331 a nivel global (RECON), desglosados por store en P3 del test suite:
ENERVIDA-VITALLCONS 67, AUDIT F4E1 STORE A 4, HOT R6B Store A 1,
Tienda Auditor 4. **Estos NO se reparan masivamente en REM-F4-04** (deuda
histórica ≠ defecto de flujo; alcance prohibido por la directive).
