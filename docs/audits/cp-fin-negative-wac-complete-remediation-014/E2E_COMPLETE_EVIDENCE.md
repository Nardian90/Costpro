# E2E_COMPLETE_EVIDENCE · CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014

**Batería aislada m102** — BD aislada `lguovmvrozxgssupkwpf` (CostproE2E), NUNCA producción (guard `assert-not-production` fail-closed).
**Resultado: TODAS las fases PASS** (dos ciclos completos + rollbacks + cleanups; detalle por fase en `MATRIX`/`E2E_AND_EXECUTION_EVIDENCE.xlsx` y `scripts/out/m014/e2e-resultados.json`).

## 1. Fixture fiel

- 10 productos en tienda E2E dedicada (`0e14a000-…`): P1–P5 espejo de SKU117/83/90/40/37 (stocks y WAC negativos EXACTOS de producción), P6 control SKU31, P7–P9 representantes reales de los 96 (SKU4, SKU14, SKU19 con sus movimientos reales), P10 agregado «residuo de tienda».
- **64 movimientos de kardex reales replicados** (con `balance_after` de producción) · asientos ORIG-espejo (costos originales m074) y RECT-011-espejo (los 9 productos) · asiento RESIDUO-TIENDA que **calibra los 5 saldos de cuenta a los valores reales de producción** (verificado al céntimo: INV 34.435.061,24 · COGS −16.677.175,95 · VALES −5.105.078,39 · PÉRDIDA −9.691.011,00 · CXP −2.961.795,90).
- Σ kardex del fixture = −2.055.851,51 = producción exacta, con los 5 WAC negativos.

## 2. Secuencia validada (el mismo código que ejecutó producción)

| Fase | Resultado |
|---|---|
| setup ×2 (saldos calibrados + Σ kardex) | PASS ×2 |
| execute (LOTE 1 A · LOTE 2 B · LOTE 3 C — 1 llamada = 1 transacción) | COMMIT ×3 (×2 ciclos) |
| verify V1–V14 (13 fases: WAC, existencias, D−C×3, pool=kardex, saldos finales COGS/VALES/PÉRDIDA, CXP intacta, movimientos intactos, trazabilidad, precios) | PASS ×2 |
| idem (re-ejecución de los 3 lotes: YA_APLICADO, exactamente 1 asiento por documento, snapshot estable) | PASS ×2 |
| **rollback individual** (lote 1 aplicado y ABORT deliberado → 5 negativos persisten, 0 asientos) | PASS |
| **rollback total** (los 3 lotes en una transacción ABORT → 0 asientos) | PASS |
| **reaplicación tras abort** (execute completo OK) | PASS |
| **cleanup NET DELTA = 0** (products/movements/fin/wcl/audit → todo 0) | PASS ×2 |

## 3. Valores verificados en E2E (idénticos a producción)

- D−C = 0,00 en RECT-013-A-NEGWAC (2.657.379,32), RECT-013-B-REGULAR (8.704.161,30) y RECT-013-C-EXT96 (22.471.992,81).
- Saldos finales: COGS 1.747.940,88 · VALES 121.879,63 · PÉRDIDA 490.447,58 (todos deudores).
- pool 601.527,81 = Σ kardex (conciliación §10.7) · CXP intacta (−2.961.795,90) · precios de venta intactos.
- Trazabilidad: 5 wcl `rect013_restauracion` + 5 audit SYSTEM_RECT013_WAC + 3 audit SYSTEM_RECT013_ENTRY.

## 4. Hallazgos de la batería

1. El guard `trg_guard_wac_writer` rechazó actualizaciones de WAC sin token — **la vía sellada `fn_recalc_wac` es la única posible** (ERR_WAC_SINGLE_WRITER_VIOLATION, descubierto en 013 y re-verificado aquí).
2. Los triggers de stock (`tr_sync_product_stock`) exigen `balance_after` al replicar kardex — gestionado en el fixture.
3. La BD aislada es compartida con la CI: se detectó interferencia de un proceso paralelo (borrado del fixture entre fases); la batería se re-ejecutó completa en secuencia única y pasó íntegra — el diseño idempotente/reanudable lo tolera.

## 5. Puente a producción

Los lotes de m102 y m103 son el mismo SQL (mismas constantes A/B/C/C1/C2 validadas por m101); la ejecución en producción replicó exactamente los resultados del prototipo, y `m104 --idem` confirmó la idempotencia en producción (YA_APLICADO ×3, 0 cambios).
