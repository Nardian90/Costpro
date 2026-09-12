# REM-INV-1 — 04 WAC / Cost Average (Fase 4)

## Fórmula efectiva (extraída de `fn_recalc_wac`, catálogo live)

```
Entrada (q>0):  ca_new = (S·ca_prev + q·uc) / (S + q)        [blend canónico D-01]
Salida (q=0):   ca_new = ca_prev                              [WAC invariante — política A1]
Reversa (q<0):  ca_new = (S·ca_prev + q·uc_orig) / (S + q)    [inversa exacta del blend;
                exige S+q>0 → ERR_WAC_REVERSE_NEGATIVE_STOCK]  exacta si S/ca_prev = estado post-entrada]
```

La fórmula del gate coincide con la implementada (D-01). No se impuso: se extrajo.

## Gobierno del escritor

- **Single-writer**: trigger `trg_guard_wac_writer` en products — `ERR_WAC_SINGLE_WRITER_VIOLATION` salvo token `SET LOCAL app.wac_writer='fn_recalc_wac'` (re-sellado a '' tras el UPDATE).
- **Llamadores verificados que recalculan** (E6/E8, 13 flujos): cancel_reception, confirm_pending_reception, confirm_transfer, fn_process_receipt ×2, perform_inventory_adjustment, receive_production_output, register_reception, reverse_devolution, reverse_production_order, reverse_receipt_v2, reverse_transfer, void_closed_production_order, void_reception_with_reversal.
- **Escritores de movimientos que NO recalculan**: register_stock_movement (por diseño A2 — salidas invariantes; entradas delegadas al caller), receive_purchase (F-01), update_inventory_after_sale (salidas — invariante OK), restore_transaction_snapshot (restauración).
- **Log completo**: `wac_change_log` (before/after/event/qty/uc/source_ref/auth.uid()) — 119 eventos desde 2026-09-05: reception_in 63, production_in 30, reception_reverse 8, production_void 6, production_reverse 5, transfer_reverse 3, transfer_in 3, devolution_reverse 1.

## Divergencias detectadas

1. **`cost_price` vs `cost_average`**: products.cost_price = costo de compra/última compra (catálogo); products.cost_average = costo contable (WAC). El kardex y el ledger usan cost_average. create_transfer toca cost_price en transfer_items pero el blend usa cost_average — sin divergencia estructural detectada en datos (no hay camino que escriba cost_average fuera de fn_recalc_wac).
2. **Concurrencia**: fn_recalc_wac usa `SELECT … FOR UPDATE` en products + token de sesión → serialización correcta; combina con row-lock del UPDATE de inventory en el trigger BEFORE → no hay ventana lost-update identificada (Fase 9).
3. **Devolución (A1)**: entrada de devolución es WAC-neutra por diseño (`create_devolution_v2` registra con cost_at_sale/cost_average sin blend; comentado DF-01) — política contable legítima y documentada, verificada en código.
4. **Cobertura**: sin eventos WAC para `initial` (F-03) — el stock de apertura no participa del blend hasta la primera recepción real.
