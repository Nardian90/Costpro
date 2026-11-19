# CONCILIACIÓN FINANCIERA — CP-FIN-003 (ENERVIDA-VITALLCONS, GEN-1)

## 1. Efectivo CUP (ACT_EFECTIVO_CUP) — 1,233,950.00
Fuente: 462 cobros cash/CUP + 20 pagos de servicios cash/CUP (60,365) + apertura.
GEN-0: 1,265,280.00 → Δ −31,330.00 = RECT-MON/015 incorporadas (cobros re-clasificados a su
moneda real) — sin pérdida: el dinero simplemente vive en la cuenta correcta.

## 2. Efectivo USD (ACT_EFECTIVO_USD) — 27,500.00
GEN-0: −4,500.00 (residual documentado de CP-FIN-002) → +32,000.00 = efecto de las
rectificaciones incorporadas (RECT-015-A 150 USD @805 + RECT-FIN-E2614F36 re-derivado a caja
USD directamente). La cuenta ahora refleja los billetes USD reales según los pagos corregidos.

## 3. Transferencias nacionales (ACT_BANCOS) — 1,264,610.01
66 cobros transfer/CUP (1,262,810.01 históricos) + operaciones nuevas. SOLO transferencias
nacionales (misión §9.B).

## 4. Transferencias exteriores (ACT_TRANSF_EXTERIOR) — 24,606,900.00
238 movimientos zelle/USD de las ventas (historial jul-sep concentrado: 14.1M/6.2M/5.6M).
Cuenta propia por mandato §4 (antes dentro de ACT_BANCOS). Importe original USD conservado
(amount_origin) en cada movimiento.

## 5. Servicios (GAS_SERVICIOS / PAS_SERV_PEND) — 60,765.00 / 0.00
20 servicios activos (Σ 60,765 CUP, todos Efectivo+CUP — declaración del propietario
VERIFICADA 100%: 20 pagos cash/CUP por el importe exacto). Obligación cancelada exacta.

## 6. Recepciones / Proveedores (PAS_CXP_PROV) — 2,961,795.90
89 recepciones activas, CERO pagos registrados → la deuda íntegra sigue pendiente
(≈ 2,961,795.90). No se inventan desembolsos (anexo §11). El módulo permite liquidarla por
cualquier (medio × moneda) con pagos parciales/mixtos.

## 7. Inventario (ACT_INVENTARIO) — −2,355,603.89 (residual documentado)
Valor vivo del maestro: 594,771.44 (82 productos con stock). La diferencia es el residuo del
historial congelado de la era FAC-VITALLCONS-001 (ver §D.3.2): costos congelados
(cost_at_sale/WAC) de la época en que precios de venta se importaron como costos. Los datos
fuentes YA están corregidos (la recepción re-deriva 5,861.50); el residual queda cuantificado
SIN ajuste compensatorio (mandato: nunca ajustes ficticios).

## 8. COGS (GAS_COSTO_VENTAS) — 4,506,831.73 · Vales 810,567.06 · Pérdidas 1.00
Re-derivados con los cost_at_sale reales congelados por venta/vale. La reallocation con
inventario (Δ COGS +2.75M + VALES +0.69M + PERDIDA −0.49M + INV −2.95M) suma 0.00.

## 9. Pasivos/Patrimonio
PAS_CXP_PROV 2,961,795.90 (exacto) · PAS_SERV_PEND 0.00 · Patrimonio 30,544,840.20
(resultado acumulado de la operación real de la tienda reconstruida).

## 10. Reproducibilidad
Todo recalculable con:
- `fin_get_balance_sheet / fin_get_dashboard` (generación activa GEN-1)
- `scripts/cpfin003-production-rebuild.mjs pre|build|analyze|activate|post`
- Artefactos JSON en este directorio (pre/post balance+dashboard, build, validate, puente).
