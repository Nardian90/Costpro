# INFORME EJECUTIVO — CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001

**2026-11-19 · ENERVIDA-VITALLCONS · Estados Financieros**

## Problema A — clasificación efectivo/bancos
- **Causa raíz (datos):** el POS registró el **nominal USD equivalente** de cobros entregados en CUP (componente `cash/USD` = total CUP ÷ tasa del día) en 8 ventas CUP-dominadas → 299,860 CUP aparecieron en «Efectivo en caja (USD)». El mapeo del carrito es CORRECTO y quedó demostrado en código: Efectivo→`cash` (CUP/USD/EUR/MLC), Transf.→`transfer`, Transf. Exterior→`zelle` (USD/EUR); «la moneda no determina el medio» se cumple en el motor.
- **Corrección:** escritor canónico nuevo `fin_reclassify_sale_payment_currency` (migración 20261119150000) + rectificaciones R1–R8 (idempotentes, traza completa, tasa documental desde evidencia). Adicionalmente 2 ventas del registro 16-10 con cobro real y sin reconocimiento se reconstruyeron con `fin_post_document` (P1/P2: +28,000 CUP a caja CUP).
- **Resultado:** la vista «Efectivo en caja (USD)» presenta solo los movimientos genuinos del propietario (RECT-FIN-E2614F36 = 135 USD / 125,550; RECT-015-A/B como reclasificaciones confirmadas) y las contrapartidas RECT-MON claramente etiquetadas; el egreso cd07fc7d (367 USD = 293,600) permanece como FLUJO_CAJA genuino.
- **Lista «Dinero en Banco» (20 documentos):** 18/19 reconstruidas CORRECTAS (transferencias CUP, exteriores zelle genuinas, mixtas bien partidas) + pareja e2614f36 con neto bancario 0. Sin efectivo mal clasificado en bancos.

## Problema B — desequilibrio −2,425,986.00 CUP
- **Causa raíz (código):** `fin_get_dashboard` computaba `A(d−c) − (P+Pat+I)(c−d)` **omitiendo la clase gasto** → mostraba exactamente −(gastos netos) = −2,425,985.79 → redondeado −2,425,986.00.
- **El libro está PERFECTO:** Σ débitos = Σ créditos = 480,745,318.72 → identidad 0.00; A 36,369,905.10 = P 2,961,795.90 + Resultado 33,408,109.20 (I 35,834,094.99 − G 2,425,985.79).
- **Corrección:** fórmula v2 con la identidad pura de partida doble (`Σ débitos − Σ créditos`). **Sin ajustes contables**: el cero sale de calcular la ecuación completa sobre los mismos movimientos.
- **LIVE tras el fix:** `desequilibrio_monto: 0.0` · `desequilibrio_balance: false`.

## Ejecución
- PRs **#1659** (fix, CI 9/9), **#1660** (surface 212, CI 5/5), **#1661/#1662** (cierre) — todos mergeados.
- Migración 20261119150000 aplicada y registrada en el libro; rectificaciones ejecutadas en producción (idempotencia verificada por re-ejecución).
- Vercel Production success + health 200.
- Impacto: caja CUP 937,020 → 1,264,880 · caja USD 258,160 → −41,700 (residual documentado: el egreso 367 USD drenó USD cuyo ingreso físico a esa cuenta no está registrado — el mismo defecto que RECT-015-A/B corrigieron para 2 casos confirmados) · bancos intacto · ingresos/COGS/inventario intactos.
