# CONCILIACIÓN EFECTIVO/BANCOS — mandato §13.B/§13.C

Saldos de movimientos (CUP contable) — antes → después de las rectificaciones:

| Cuenta | Antes | Después | Δ |
|---|---:|---:|---:|
| ACT_EFECTIVO_CUP | 937,020.00 | 1,264,880.00 | +327,860.00 (= +299,860 reclasif. + 28,000 reconocimientos P1/P2) |
| ACT_EFECTIVO_USD | 258,160.00 | −41,700.00 | −299,860.00 |
| ACT_BANCOS | 25,848,970.01 | 25,848,970.01 | 0.00 |

Cada reclasificación R1–R8 conserva el valor económico total (débito caja USD → débito caja CUP por el MISMO importe contable; contrapartida con `amount_origin`/`currency_origin` del nominal registrado). Referencias por venta: `out_rectificaciones_plan.json` + hoja «Rectificaciones» de la matriz.

Pareja histórica e2614f36 (§4 del mandato): débito original ACT_BANCOS 125,550 (asiento 2d109ccf) + crédito RECT-FIN-E2614F36 125,550 (cf781c93) → **neto en bancos 0.00**; cobro real en caja USD 125,550 (135 USD @930). Verificado en la reconstrucción de la lista de bancos del propietario.

Residual caja USD −41,700 CUP (−52.13 USD @800): el egreso cd07fc7d («entrega para ingresar al banco», 367 USD) drenó USD cuyo ingreso físico a ESA cuenta no quedó registrado — las colecciones físicas USD de octubre están registradas como CUP (el defecto mismo que RECT-015-A/B corrigieron para 2 casos confirmados). Documentado, sin invención (mandato §7.4/§15).
