# REM-INV-1 — 03 Reconciliation (Fase 3) — resumen ejecutivo

Reconciliador READ-ONLY ejecutado contra producción vía Management API (solo SELECT). SQL reproducible en 18-integrity/reconciler-sql/. Resultados JSON en este directorio.

| # | Chequeo | Resultado | Clasificación |
|---|---------|-----------|---------------|
| r01 | inventory.quantity vs SUM(movements) por producto/tienda | **0 divergencias** (277×277) | — (íntegro) |
| r01b | resumen por tienda | vacío | — |
| r02 | products.stock_current vs inventory.quantity | **0 divergencias** (367) | — |
| r03a | movimientos huérfanos (ledger sin inventory) | 0 | — |
| r04 | inventory negativa / kardex balance negativo | 0 / 0 | — |
| r05 | transferencias: salida A vs entrada B por doc | 8/8 balanceadas (imbalance=0); CANCELADAS sin movimientos; REVERSADAS compensadas 1:1 | — |
| r06 | receipts sin movimiento 'purchase' por reference_id | 63/63 sin match **por FK** | FALSE POSITIVE de linkage — la referencia NO se guarda (→F-04); el balance global cuadra (r01), el efecto sí está en el ledger |
| r07 | paridad kardex↔movimientos 1:1 | 0 divergencias | — |
| r08 | duplicados por (store,sku,tipo,qty,doc,fecha) | agrupaciones hasta 20 | FALSE POSITIVE (ventas POS repetidas legítimas con reference_doc genérico — revela debilidad de trazabilidad F-04/F-09) |
| r09/d5 | producción: consumo vs salida por orden | 0 movs enlazados por FK; UUID solo en reference_doc (d5) | FALSE POSITIVE de linkage (→F-04); aggregate global: production_in +91 / out −52 / reverse −25 |
| r10 | devoluciones por tienda/status | 13 en TIENDA CENTRAL sin movimientos | **REAL (→F-02)** |
| r11 | warehouse_stock vs inventory | 0 filas comparables con divergencia | — |
| e7 | kardex balance última entrada vs inventory | 4 productos con off_by = delta del último movimiento | **REAL (→F-05 pre-image)** |
| r12a | prorrateo servicios: distribuido vs total | 14 servicios, 0 distribuciones | EXPECTED BUSINESS RULE sin uso (OBS-1) |
| r14b | kardex a costo 0 | 496 en tiendas de producción | **REAL (→F-03)** |
| r15/r16 | estructura: purchase_items existe (0 filas); trigger transaction_items=1; unit_cost NULL=0; sale unit_cost=0: 496; cost_at_sale=0: 514/633 | → F-01/F-03 |
| r17 | pagos de devoluciones fantasma | 0/13 con payment | F-02 acotado a documental |

## Conclusión

Ningún hallazgo de CANTIDAD (saldo). Los hallazgos reales son de VALOR (F-03), DOCUMENTO (F-02), TRAZABILIDAD (F-04/F-05) y SUPERFICIE (F-01). No se ocultó ninguna discrepancia bajo recálculo.
