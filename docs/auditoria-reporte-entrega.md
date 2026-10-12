# AUDITORÍA CONTABLE — Reporte Entrega (CashReportView)

> Rama: `feat/reporte-entrega-auditoria-contable` · Base: `main@019bf5e33`
> Método: reproducción SOLO LECTURA sobre EnerVida-Vitallcons (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`), periodo 2026-10-02 (el «10/02/2026» de la evidencia del usuario). Cero escrituras: consultas REST + RPC SELECT.

## 1. Datos reales del periodo (verificados)

| Movimiento | Método | Importe |
|---|---|---:|
| Venta Goma Termo Retráctil (3 × 200) | cash | 600 |
| Venta Brecker 16A (1 × 2.000) | cash | 2.000 |
| Venta Cemento Cola (2 × 10.000) | **mixed** (cash 10.000 + transfer 10.000) | 20.000 |
| Venta Cemento TBV (2 × 19.000) | transfer | 38.000 |
| **Ventas en efectivo** | | **12.600** |
| **Ventas por transferencia** | | **48.000** |
| **Ventas totales** | | **60.600** |
| Comisiones pagadas | | 0 |
| Servicios recibidos pagados | | 0 |
| Pagos a proveedores (recibos) | | 0 |

RPC `get_cash_report` (solo lectura): `sales_total_cup = 60.600` ✓ correcto en backend.

## 2. Causa raíz de cada discrepancia

### D1 — «Ventas Totales: 31.200,00» (esperado 60.600)

**Cadena:** tabla PDF usa `items-summary` → `total_cup` = `price_at_sale_cup` **SIN multiplicar por quantity** (`items-summary/route.ts` L99). El «resumen» toma `totals.totCup` = Σ de esa base rota (`cash-report-pdf.ts` L819).

- 19.000 + 10.000 + 2.000 + 200 = 31.200 = suma de **precios unitarios**.
- La etiqueta «Ventas Totales» está bien; la **fórmula base** está mal (no es solo cosmética).

### D2 — Columna «Transfer.» por renglón (29.230,77 / 15.384,62 / …)

**Cadena:** `cash-report-pdf.ts` L558-568 — el pool REAL de transferencias (48.000) se reparte proporcionalmente entre ítems según su `total_cup` (defectuoso): `48.000 × 19.000/31.200 = 29.230,77`. El factor 1,53846 NO es un tipo de cambio: es `48.000/31.200`. Al corregir D1, el reparto proporcional queda sobre la base correcta (60.600) y el total de la columna sigue cuadrando con 48.000.

### D3 — Columna «Comisión» (312,00)

**Cadena:** L557-566 — `DEFAULT_COMMISSION_PCT = 1` fijo: comisión = total(ROTO) × 1%. **No es el cálculo del sistema**: el motor real (`/api/commissions/calculate` + `commission_rules` + `commission-engine`) calcula por trabajador con reglas, y ese día hay 0 comisiones reales. Corrección: columna opcional alimentada por la sugerencia del motor real (§5 del brief), no por 1% plano.

### D4 — «A entregar: 12.600,00» (vista) vs esperado de vista = 2.600

**Cadena:** `cash-report/route.ts` L58-77 — `cash_balance_cup` solo suma el grupo `payment_method='cash'` (2.600) y **excluye el tramo efectivo de ventas mixed** (10.000). El PDF diario usa `/payment-totals` (SUM(cash_amount)=12.600 ✓), pero la VISTA muestra `cash_balance_cup` → pantalla (2.600) ≠ PDF (12.600). Inconsistencia pantalla/PDF/previsualización.

### D5 — Servicios recibidos sin línea propia

El RPC agrupa `payments` con `ref_type IN ('receipt','service')` juntos; el PDF los fusiona en «Pagos a Proveedores». Los servicios recibidos no aparecen como categoría independiente ni se distinguen de los recibos de compra.

### D6 — Comisiones pagadas no gestionables desde el reporte

El reporte solo LEE `commission_payments` (status='paid'). No existe acción para revisar/proponer/confirmar comisiones desde el reporte (el endpoint POST/PATCH documental con idempotencia e historial SÍ existe: `/api/commissions/payments`).

### D7 — Sin vía para ajustes extraordinarios

No existe mecanismo alguno para registrar diferencias no clasificables con nota obligatoria y auditoría.

## 3. Fórmulas — antes vs corregidas (a implementar en módulo único compartido)

| Concepto | Fórmula ACTUAL (dispersa en 3 sitios) | Fórmula CORREGIDA (centralizada) |
|---|---|---|
| Ventas totales CUP | Σ items.total_cup (unitario, roto) — PDF L819 | `ventasCash + ventasTransfer` (SUM(cash_amount), SUM(transfer_amount) de `transactions`) |
| Ventas en efectivo | PDF: payment-totals cash ✓ / Vista: grupo 'cash' puro ✗ | SUM(cash_amount) — única fuente, ambos consumidores |
| Ventas por transferencia | payment-totals transfer ✓ | SUM(transfer_amount) — idem |
| Comisión por renglón | total × 1% plano (estimación inventada) | sugerencia del motor real (`/api/commissions/calculate`, reglas por trabajador/producto); columna opcional |
| Comisiones pagadas | RPC: Σ final_amount status='paid' ✓ | idem + desglose por método de pago (cash/transfer) — el pago por transferencia NO reduce efectivo |
| Servicios recibidos | fusionados en «Pagos a Proveedores» | línea independiente: payments ref_type='service', método cash, del periodo |
| Pagos a proveedores | payments ref_type='receipt' | se mantiene (recibos de compra), separado de servicios |
| Ajustes | no existen | payment_transactions ref_type='adjustment', importe con signo vía direction, nota obligatoria |
| Efectivo esperado | `cash + production - payments - commissions` (excluye mixtas en vista; sin servicios separados; sin ajustes) | `ventasCash + productionCash + ajustesPositivos - comisionesCash - serviciosCash - recibosCash - ajustesNegativos` |
| Efectivo contado | breakdownTotal(desglose billetes) ✓ | idem (semántica: dinero contado por denominaciones — «Total entregado») |
| Diferencia de cuadre | `totalContado - esperado` | idem, con etiqueta explícita: negativo = FALTANTE, positivo = SOBRANTE |

**Definiciones inequívocas adoptadas** (tras inspección del uso real):
- **Efectivo esperado a entregar** = flujos de efectivo del periodo (la fórmula corregida de arriba).
- **Efectivo contado/entregado** = suma del desglose de denominaciones (lo que el usuario cuenta y entrega físicamente; hoy se rotula «Total entregado» — se conserva el nombre con subtítulo aclaratorio).
- **Diferencia de cuadre** = contado − esperado. Signo: negativo ⇒ faltante, positivo ⇒ sobrante. Hoy el bloque solo imprime el valor absoluto sin signo ni etiqueta de sentido.

## 4. Defectos de presentación (independientes del cálculo)

| # | Defecto | Corrección |
|---|---|---|
| P1 | La tabla de movimientos va ANTES de los bloques | Fila 1: [Resumen del Día] [Desglose de efectivo MN]; tabla debajo |
| P2 | Columna «Clase» (siempre vacía: items-summary no devuelve category) | Eliminar de la tabla (queda `Código|Descripción|Cant.|CUP|Transfer.|Comisión`) |
| P3 | addPage sin repetir encabezados (L766) | Repetir header en cada página |
| P4 | Denominaciones con cantidad 0 se imprimen («-») | Omitir filas con importe 0 (solo presentación; el total no cambia) |
| P5 | Sin orientación del PDF (fija vertical) | Opción Vertical/Horizontal persistida, afecta doc y previsualización |
| P6 | Página 3 (Órdenes) siempre incluida | Checklist «Reporte de Órdenes de Trabajo» (patrón desglose billetes) |
| P7 | Columna Comisión fija | Checklist «Columna Comisión» (sin desplazar importes al ocultar) |
| P8 | USD siempre en página separada | Opción Corrido (compacto) / Hojas separadas |
| P9 | Template por defecto = 'estandar' | Default = 'diario' (Diario (Empresa)); configs válidas guardadas NO se tocan |
| P10 | Vista previa ≠ vista en KPIs (D4) | misma fuente de fórmulas para pantalla, previsualización y PDF |

## 5. Restricciones respetadas

- EnerVida-Vitallcons: **0 escrituras** (ni documentos, ni confirmaciones, ni ajustes, ni cambios de active_store; el reporte se reprodujo vía RPC/REST read-only).
- Pruebas de flujos con escritura: solo contra tienda de pruebas (Puerto Padre VITALLCONS) o fixtures unitarios.
- Migración mínima justificada (§7 ajustes): extender CHECK `ref_type` de `payment_transactions` con `'adjustment'` reutilizando la tabla existente (RLS, idempotencia_key, store_id, auditoría de actor/fecha ya incluidos) en lugar de crear una tabla nueva.
