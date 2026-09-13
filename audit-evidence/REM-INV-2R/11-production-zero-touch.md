# 11 — PRODUCTION ZERO-TOUCH DATA (REM-INV-2R, fase 15)

## Método

Mismo fingerprinter SELECT-only que REM-INV-2 (`scripts/rem-inv-2/fingerprint.mjs`),
ejecutado PRE (23:58 UTC) y POST (00:10 UTC) del DDL. Comparación canónica determinista
(JSON con claves ordenadas) + granular walk. Etiquetas de metadatos (`captured_at`, `mode`)
excluidas de la comparación — son etiquetas de captura, no datos.

## Cobertura del fingerprint (producción real)

stores · transactions · payment_transactions · stock_movements · receipts ·
receipt_items · purchase_orders · purchase_items · purchase_order_items ·
inventory_adjustments · devolutions · kardex_entries · products · audit_logs ·
max(created_at/updated_at) por store · purchase_orders.status por store ·
inventory (count, sum(quantity), max(updated_at)) por store ·
catálogo de 8 funciones de recepción con ACL.

## Resultado

```text
PRE  data sha256:  7e556cc3886051f651e1ed2838f885fd5109b517accb2dfddbf395ed44901874
POST data sha256:  7e556cc3886051f651e1ed2838f885fd5109b517accb2dfddbf395ed44901874
DATA BITWISE IDENTICAL: true

CATÁLOGO:
  removed      = ["receive_purchase"]     ← ÚNICO cambio autorizado por este gate
  added        = []
  acl_changed  = []
  CATALOG DELTA IS EXACTLY TARGET REMOVAL: true

Full-fingerprint (incluyendo catálogo): 1 divergencia = la entrada receive_purchase.
```

## Lectura

- **Cero cambios de datos** en producción: ni una fila, ni un contador, ni un timestamp
  max, ni un estado de OC, ni una suma de inventario, ni un WAC.
- **Cero cambios colaterales de catálogo**: ninguna otra función añadida/eliminada/cambiada
  de ACL (las 7 restantes del catálogo de recepción byte-idénticas).
- El único delta en toda la base es la eliminación del objeto objetivo — exactamente el
  permiso de este gate («El único cambio permitido en producción es: catalog definition /
  ACL de receive_purchase»).

Raw: `assets/fingerprint-pre.json`, `assets/fingerprint-post.json`,
`assets/fingerprint-compare.json`.
