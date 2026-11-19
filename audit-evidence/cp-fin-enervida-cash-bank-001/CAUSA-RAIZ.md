# CAUSA RAÍZ — mandato §6/§7

## A. Clasificación efectivo/bancos
1. El mapeo del carrito es correcto: Efectivo→`cash`, Transf.→`transfer`, Transf. Exterior→`zelle` (POSCartItem.tsx ~489-557; create_sale_v2 v2.25.0 escribe UNA fila por componente con moneda real).
2. El motor VENTA v2 clasifica según el registro: cob_cash_cup→caja CUP, cob_cash_usd_cup→caja USD, cob_transfer_*/cob_zelle_*→bancos. Obedece la regla vinculante del propietario.
3. **El defecto era el dato:** 8 ventas CUP-dominadas con componente `cash/USD` que almacenaba el NOMINAL USD equivalente (total CUP ÷ tasa del día 800–930). El motor, fiel al registro, contabilizó en caja USD. La evidencia de que el dinero entregado fue CUP: sale_currency='CUP', total en CUP, tasa documental registrada, confirmación del propietario (§3/§16) y patrón confirmado RECT-015-A/B (el defecto inverso: cobros USD físicos registrados como CUP).
4. Defecto secundario: 28e94349 con asiento publicado por la versión M-015 del motor (reparto por ítems a tasa 810) inconsistente con su pago registrado (cash/CUP 169,670) — «asiento obsoleto».
5. Defecto terciario: 2 ventas del registro 16-10 con cobro real y sin reconocimiento (los asientos nunca se publicaron).

## B. Desequilibrio −2,425,986.00 CUP
`fin_get_dashboard` (20261113120100) computaba el desequilibrio como `A(d−c) − (P+Pat+I)(c−d)` **sin la clase gasto**. Para un libro equilibrado ese valor = −(gastos netos). ENERVIDA: gastos netos 2,425,985.79 → mostrado −2,425,986.00 (redondeo a 0 decimales del canal). El libro real está equilibrado (Σ débitos = Σ créditos; A = P + Pat + (I − G)). La pestaña «Estado de Situación» (`fin_get_balance_sheet`) YA calculaba la ecuación completa (diferencia 0.00): el defecto era exclusivo del Dashboard.

## Por qué la corrección es legítima
La fórmula v2 (`Σ débitos − Σ créditos`) es la identidad contable completa; el cero resulta de calcularla sobre los mismos movimientos — sin ajustes, sin ocultar diferencias, sin alterar saldos (mandato §7.5).
