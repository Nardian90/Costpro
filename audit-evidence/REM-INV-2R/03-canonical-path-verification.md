# 03 — CANONICAL PATH VERIFICATION (REM-INV-2R, fase 4)

Estado verificado SELECT-only ANTES del DROP (y re-verificado después — fase 9).

## Funciones canónicas presentes PRE-DDL (con pin de oid)

| Función | oid | SECURITY | sha256 definición (16 primeros) |
|---|---|---|---|
| receive_against_po | 138544 | DEFINER | 57cb0dad9085e5c4 |
| register_reception | 138536 | DEFINER | a6ce108357ee5bb0 |
| confirm_pending_reception | 136713 | DEFINER | d7b0610b77bab22f |
| void_reception_with_reversal | 136714 | DEFINER | 2de37b0d819cb1e2 |

## ACL PRE de la ruta canónica (sin cambios durante todo el gate)

| Función | Grantees EXECUTE |
|---|---|
| receive_against_po | authenticated, postgres, service_role |
| register_reception | PUBLIC(=), authenticated, postgres, service_role |
| confirm_pending_reception | authenticated, postgres, service_role |
| void_reception_with_reversal | postgres, service_role |

(Nota: `=X/postgres` en register_reception/void_pending_reception = grant PUBLIC
pre-existente, fuera del alcance de este gate — no se tocó; pertenece al dominio
F-06 documentado en gates anteriores.)

## Cadena interna demostrada por prosrc (referencias entre cuerpos)

| Función | refs receive_against_po | refs register_reception | refs confirm_pending_reception |
|---|---|---|---|
| receive_against_po | — | SÍ (la invoca) | — |
| register_reception | — | — | SÍ |
| confirm_pending_reception | — | — | — |
| create_purchase_order | — | SÍ | — |
| set_purchase_order_status | SÍ | — | — |
| receive_purchase | (ninguna función la referenciaba — huérfana) | | |

## Tablas esenciales de la ruta (10/10 presentes)

purchase_orders · purchase_order_items · receipts · receipt_items · stock_movements ·
inventory · inventory_adjustments · audit_logs · products · stores

## Mapa canónico (establecido por REM-INV-2, reconfirmado aquí)

```
purchase/order
    → receive_against_po        (FOR UPDATE, guards draft/sent/partial, over-receive)
        → register_reception    (auth.uid + has_store_access_as, B2-B5/C1, W62-01)
            → receipts / receipt_items
            → fn_recalc_wac     (blend canónico S·ca+q·uc / S+q, wac_change_log)
            → register_stock_movement → stock_movements → triggers → inventory/products/kardex
            → audit_logs
        → purchase_order_items.quantity_received → PO status (sent/partial/received)
        → audit_logs 'po_received' · CxP payment_status
```

## Declaración expresa (heredada de REM-INV-2, vigente)

`NEXT_PUBLIC_USE_V2_REVERSE=true` SOLO activa la reversión V2; NO constituye evidencia de
reception V2. La ruta canónica de recepción existe por evidencia de código+DB+runtime
(REM-INV-2 fases 1-5, 11-14) y continúa operativa tras el DROP (fase 11 de esta gate).
