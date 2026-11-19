# MATRIZ DE MEDIOS DE PAGO — mandato §13.A

Población completa 192 ventas (≥25-09). Detalle por venta: MATRIZ-CONCILIACION.xlsx (hojas «Ventas», «Pagos», «Transferencias exteriores»).

| Medio (carrito) | Valor backend (demostrado) | Monedas del carrito | Cuenta contable | Ventas | Estado |
|---|---|---|---|---:|---|
| Efectivo | `cash` | CUP | ACT_EFECTIVO_CUP | 116 | CORRECTO_EFECTIVO |
| Efectivo | `cash` | USD | ACT_EFECTIVO_USD | — (1 rectificada FIN-001) | RECTIFICADA_FIN001 |
| Efectivo (mal registrado USD) | `cash`+nominal | CUP real | ACT_EFECTIVO_CUP (rectificado) | 8 | INCORRECTO_MONEDA_CAJA_USD → RECT-MON |
| Transf. | `transfer` | CUP | ACT_BANCOS | 47 (incluye mixtas) | CORRECTO_TRANSFERENCIA |
| Transf. Exterior | `zelle` | USD/EUR | ACT_BANCOS | (incluidas en las 47 + 148 pagos zelle ≥25-09) | CORRECTO |
| Mixtas | `mixed` | CUP/USD | caja + bancos por componente | 11 | CORRECTO_MIXTA |
| Registros ambiguos | — | — | — | 2 (cobro sin reconocimiento) | COBRO_SIN_RECONOCIMIENTO → P1/P2 |
| Anuladas | — | — | — | 7 | ANULADA (estado correcto) |

Mapeo demostrado en `POSCartItem.tsx` (líneas ~489-557) y `create_sale_v2` (filas por componente `pay-<método>-<moneda>-<tx>`; zelle exige sale_currency ≠ CUP y tasa > 1).
