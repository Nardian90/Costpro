# 04 — DB AFTER (verificación de la BD viva post-apply, SELECT-only)

**Fuente raw:** `evidence/remf404-db-after.txt` (§B1–B5, 2026-09-09T01:48:29Z)
**Apply:** `evidence/remf404-apply-log.txt` + `remf404-apply-response.json`
(HTTP 201 @ 2026-09-09T01:47:57Z, migration SHA256 `1cbd9cdf0d0c6eb4ba550320eee9bc0c12a7a8cf5475fca3503f7eee9cff5326`)

## B1 — Definición viva de `register_reception` post-apply

La definición extraída de la BD viva coincide byte a byte con la migration
aplicada. El bloque REM-F4-04 está presente dentro del LOOP, en el orden
doctrinal correcto:

```sql
-- WAC primero → movimiento después (kardex ve ca_new)
v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                  THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                  ELSE v_unit_cost_cup END;
PERFORM public.fn_recalc_wac(
  p_store_id   := p_store_id,
  p_product_id := v_product_id,
  p_event      := 'reception_in',
  p_qty_in     := v_units_to_add,
  p_uc_in      := v_uc_base,
  p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
);
PERFORM public.register_stock_movement(...);  -- DESPUÉS del WAC
```

## B2 — Inventario de triggers (por diseño, sin recreación)

| Tabla | Triggers |
|---|---|
| `products` | `trg_ensure_product_barcode`, `trg_guard_wac_writer`, `trg_maintain_product_completeness`, `trigger_audit_product_changes` |
| `receipt_items` | `trg_check_reception_cost_variation`, `trg_sync_has_movements_receipt` |

→ `trg_update_product_wac` sigue **AUSENTE** (correcto: NO se recreó; la
remediación conecta al escritor canónico, no resucita el mecanismo muerto).

## B3 — Guard intacto

```
CREATE TRIGGER trg_guard_wac_writer
  BEFORE UPDATE OF cost_average ON public.products
  FOR EACH ROW EXECUTE FUNCTION w62_guard_wac_writer()
```

## B4 — ACL sin cambios

`proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`
— idéntica al estado BEFORE (§A8).

## B5 — Overloads

`overloads = 1` — no se crearon firmas duplicadas de `register_reception`.

## Conclusión

La migración aplicó exactamente el diseño (02): un solo cambio quirúrgico,
escritor único preservado, guard intacto, sin efectos colaterales estructurales
(fingerprint §Z4 de zero-touch: 484 funciones / 81 triggers / md5 de nombres
de triggers IDÉNTICO pre y post — la única variación permitida es el cuerpo
de `register_reception`).
