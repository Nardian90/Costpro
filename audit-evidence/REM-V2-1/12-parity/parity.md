# REM-V2-1 — 12 PARIDAD V1 vs V2 (fixture conceptual, misma entrada y estado)

Ejecución dinámica NO realizada (sin entorno seguro — ver 10-idempotency). Paridad demostrada por
equivalencia funcional de código + features extra de V2. "same input" = venta de N ítems con
variants, multi-pago cash/transfer/zelle, descuento, taxes configurados, key de idempotencia.

| Dimensión | V1 resultado | V2 resultado | Paridad |
|---|---|---|---|
| final stock (inventory/products) | -qty×conversion_factor vía register_stock_movement | ídem + lock y validación previa | ✓ |
| final cost / WAC | cost_average solo si entrada con costo>0 | ídem | ✓ (mismo single-writer) |
| unit_cost registrado | cliente (COALESCE) | cliente (COALESCE) | ✓ (limitación compartida — ver 08) |
| document status | completed | completed | ✓ |
| payment | header cash/transfer/zelle | header + **payment_transactions** (ledger) | V2 ⊃ V1 |
| cash (caja) | derivado del header | ledger de pagos | V2 ⊃ V1 |
| audit trail | audit_logs CREATE_SALE | ídem + supervisor metadata + payments | V2 ⊃ V1 |
| movements | stock_movements 'sale' | ídem | ✓ |
| errors | crudos | contrato ERR_* tipado | V2 ⊃ V1 |
| descuento ≥15% | sin control | supervisor server-side | V2 ⊃ V1 |
| cliente en la venta | UPDATE post-venta lado cliente (2 pasos) | persistido atómicamente en la RPC | V2 ⊃ V1 |
| servicios (is_service) | descontaría stock (V1 sin excepción) | skip stock/kardex | V2 ⊃ V1 |
| sync offline | create_sale (cola legacy) | create_sale_v2 en /api/sync/batch | V2 ⊃ V1 |

**REVERSE parity**: receipt/adjustment con V2 = mismo efecto contable (stock restaurado, doc
reversed) MÁS: ledger de movimientos, WAC inverso exacto, pagos revertidos, audit_logs, locks.
V2 no pierde funcionalidad; la ganancia es de integridad y trazabilidad.

**Conclusión**: `FUNCTIONALITY V2 >= V1` demostrado a nivel de contrato de código. La paridad
ejecutada (mismo estado final medido) queda como UNKNOWN-ejecución documentada por ausencia de
entorno seguro; no bloquea el análisis de retiro porque V2 ⊇ V1 en cada dimensión verificable.
