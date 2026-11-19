# INVENTARIO CONTABLE — CP-FIN-003 (ENERVIDA-VITALLCONS)

**Universo documental completo verificado (2026-11-20, producción, solo lectura).**

## 1. Por tipo de movimiento (población EnerVida)

| Tipo documental | Documentos | Estado | En GEN-1 |
|---|---:|---|---|
| VENTA (transactions) | 735 totales · 719 completed (+1 anulada con par) | 719 reconocimientos + 1 anulacion | 720 asientos de reconocimiento + 1 anulacion |
| RECEPCION (receipts) | 89 activas | reconocidas (deudas CxP) | 89 |
| SERVICIO_RECIBIDO | 25 (20 activos + 5 anulados de validación v2.18.0) | 20 reconocidos + 20 pagos + 1 anulado | 41 asientos |
| VALE_SALIDA (issue_slips) | 203 completados | consumo interno | 203 |
| AJUSTE_INVENTARIO | 2 confirmados | faltante/sobrante | 2 |
| COMISION | 1 pagada | gasto+pago | 1 |
| NOMINA | 1 (confirmada CUP) | — | — (sin nóminas pagadas: sin asiento) |
| FLUJO_CAJA | 2 confirmados (IE-000001/000002 entrega_efectivo) | ACT_OTROS_CORR (M-015 v2) | 2 |
| DEVOLUCION_VENTA | 2 completadas | contra-ingreso | 2 |
| APERTURA_FIN | 1 (2026-06-30) | saldo inicial autorizado | 1 (copia literal) |

## 2. Pagos (payment_transactions de EnerVida)

| ref_type | n | Medios × monedas | Σ CUP |
|---|---:|---|---:|
| sale (in) | 773 | cash/CUP 462 · cash/USD 4 · transfer/CUP 66 · zelle/USD 241 | 38,421,374.99 |
| service (in) | 20 | cash/CUP 20 (100% Efectivo+CUP — declaración del propietario VERIFICADA) | 60,365.00 |
| receipt (in) | **0** | — | 0.00 (deudas pendientes, sin pagos inventados) |

## 3. Patrones por período (ventas, medio dominante)

| Mes | cash CUP | transfer CUP | zelle USD | Lectura |
|---|---:|---:|---:|---|
| 2026-07 | 1,448,730 | 445,500 | 14,086,200 | era de grandes cobros exteriores |
| 2026-08 | 2,992,635 | 149,460 | 6,228,290 | ídem |
| 2026-09 | 2,042,705 | 158,550 | 5,590,340 | ídem |
| 2026-10 | 3,132,595 | 491,100 | 559,830 | transición al efectivo |
| 2026-11 | 812,935 | 18,200 | 0 | perfil actual del propietario (efectivo dominante, cero zelle) |

## 4. Asientos y movimientos

| | GEN-0 (superseded) | GEN-1 (activa) |
|---|---:|---:|
| Asientos | 1.088 | 1.084 |
| Movimientos | ~3.6xx | ~3.7xx |
| Identidad (Σdeb − Σcre) | 0.00 | 0.00 |

## 5. Períodos

- Primer documento económico: 2026-06-30 (apertura) · primera venta 2026-07-16.
- La reconstrucción cubre TODO el historial (sin saltos temporales); el saldo inicial
  documentado es la apertura 2026-06-30 (única, autorizada).
