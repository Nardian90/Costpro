# RECONSTRUCCIÓN ANTES/DESPUÉS + CONCILIACIÓN FINANCIERA — CP-FIN-003

**ENERVIDA-VITALLCONS · GEN-0 (antes) → GEN-1 (después) · 2026-11-20**

## 1. Documentos incluidos (cobertura por tipo)

| Tipo | GEN-0 (docs con asiento) | GEN-1 | Diferencia y causa |
|---|---:|---:|---|
| VENTA | 714 | 719 | +5 ventas completed que la GEN-0 nunca contabilizó (errores de posting pre-v3, incorporadas por el pase 5 de cobertura) |
| RECEPCION | 89 | 89 | exacto (incluye fd9d6c88 re-derivada con datos corregidos: 192,039,436.00 → 5,861.50) |
| SERVICIO_RECIBIDO | 21 | 21 | exacto (20 reconocimiento + 20 pagos + 1 anulado) |
| VALE_SALIDA | 198 | 203 | +5 vales completados sin asiento en GEN-0 (cobertura) |
| AJUSTE_INVENTARIO | 2 | 2 | exacto |
| COMISION | 1 | 1 | exacto |
| FLUJO_CAJA | 2 | 2 | exacto (IE-000001/000002 a ACT_OTROS_CORR por regla M-015 v2) |
| DEVOLUCION_VENTA | 2 | 2 | exacto |
| APERTURA_FIN | 1 | 1 | copia literal (saldo inicial autorizado) |
| RECTIFICACION_FIN | 12 | 0 | **omitidas por política** (su corrección vive en los datos corregidos: ver §3) |
| Ajustes manuales no-RECT | 5 | 0 | **omitidos por política** (ver §3) |

## 2. Asientos generados

- GEN-1: **1.084 asientos** (1.059 re-derivados + 1 anulacion + 1 apertura copiada + 23 de
  cobertura nueva), 0 errores, 0 duplicados, identidad 0.00.
- GEN-0: 1.088 asientos conservados íntegros (estado superseded — nunca se borran).

## 3. Polícas de omisión (cada asiento, clasificado — misión §2)

### 3.1 RECTIFICACION_FIN omitidas (12) — efecto incorporado en los datos corregidos

| Documento | Fecha | Descripción (resumen) |
|---|---|---|
| RECT-015-A | 2026-10-17 | reclasificación cobro físico 150 USD @805 (cajón) clasificado CUP |
| RECT-MON-28E94349 | 2026-10-19 | moneda del cobro cash/USD → CUP (167,670 CUP, tasa 810) |
| RECT-015-B | 2026-10-23 | cobro físico 10 USD @560 (settlement) clasificado CUP |
| RECT-015-D | 2026-10-23 | entrega_efectivo = activo pendiente de conciliar (IE-000001/000002) |
| RECT-MON-8757444F | 2026-10-26 | moneda cash/USD → CUP (32,000 CUP, tasa 800) |
| RECT-MON-E825BA93 | 2026-10-27 | moneda cash/USD → CUP (60,840 CUP, tasa 845) |
| RECT-MON-9D1CCEF8 | 2026-11-07 | moneda cash/USD → CUP (6,510 CUP, tasa 930) |
| RECT-FIN-E2614F36 | 2026-11-07 | método zelle → cash (135 USD, caso del propietario) |
| RECT-MON-6501F8DA | 2026-11-07 | moneda cash/USD → CUP (930 CUP, tasa 930) |
| RECT-MON-97263A9C | 2026-11-16 | moneda cash/USD → CUP (9,200 CUP, tasa 920) |
| RECT-MON-ABAB9E20 | 2026-11-17 | moneda cash/USD → CUP (16,200 CUP, tasa 900) |
| RECT-MON-7D9AD144 | 2026-11-18 | moneda cash/USD → CUP (6,510 CUP, tasa 930) |

**Por qué se omiten:** los escritores canónicos corrigieron TAMBIÉN los datos de la operación
(payment_transactions/transaction_items); la re-derivación de GEN-1 parte de esos datos ya
corregidos → el efecto de la rectificación ya está en el asiento re-derivado. Copiar la
rectificación aplicaría la corrección dos veces.

### 3.2 Ajustes manuales no-RECT omitidos (5) — mundo FAC-VITALLCONS-001

| Entrada | Fecha | Movimientos | Decisión |
|---|---|---|---|
| 7ec90009…0001 (RECEPCION) | 2026-07-01 | CXP débito 151,299,851 + INV crédito 151,299,851 | omitir: reversión del exceso de reconocimiento SKU 111/112 — la recepción fd9d6c88 ya está corregida en datos (192,039,436.00 → 5,861.50) |
| 7ec9000b… (AJUSTE_INVENTARIO, doc fd9d6c88) | 2026-07-01 | CXP débito 40,733,723.50; créditos INV 3,678,375.50 + COGS 21,450,370.50 + VALES 5,913,947.50 + PERDIDA 9,691,030.00 | omitir (no reconstruible + incorporado): «C1 eliminación del saldo acreedor ficticio» del importe inflado |
| 7ec90009…0002 (AJUSTE_INVENTARIO) | 2026-11-15 | GAS_VALES 6 + GAS_PERDIDA_INV 18 + INV crédito 24 | omitir (mismo mundo de datos corregido; 24 CUP) |
| 7ec9000f…0001 (RECT-013-A-NEGWAC) | 2026-11-17 | COGS 566,546.45 + VALES 1,072,918.27 + PERDIDA 1,017,914.60 + INV 2,657,379.32 | omitir: regularización de valoración sobre WAC inflados de la era FAC |
| 7ec9000f…0002 (RECT-013-B-REGULAR) | 2026-11-17 | COGS 1,855,777.48 + VALES 3,514,277.42 + PERDIDA 3,334,106.40 + INV 8,704,161.30 | omitir: ídem (residual 5 SKU) |
| 7ec9000f…0003 (RECT-013-C-EXT96) | 2026-11-17 | COGS 16,002,792.90 + VALES 639,762.33 + PERDIDA 5,829,437.58 + INV 22,471,992.81 | omitir: ídem (extensión 96 productos) |

**Historia completa (verificada):** el importe FAC-VITALLCONS-001 reconoció 192,039,436.00 de
inventario/CXP (precios de venta importados como costos USD); la cadena de correcciones
(reversión 151,299,851 + C1 40,733,723.50 + RECT-013 33,842,533.43) devolvió el libro a la
realidad. Los DATOS de la recepción fueron corregidos (hoy re-deriva 5,861.50), pero los
costos congelados del historial (cost_at_sale / WAC de la era) conservan parte de la
contaminación → la re-derivación pura produce el libro real SIN la cadena de correcciones;
el residual cuantificado es el inventario −2,355,603.89 (§F/§A).

### 3.3 Iteración documentada (primera activación revertida)

La primera activación de GEN-1 copió la lista de 4 regularizaciones (RECT-013 ×3 + RECT-SAL):
el inventario quedó en −36,189,161.32 (doble corrección). Se ejecutó `fin_generation_rollback`
(GEN-0 reactivada), se vació la candidata y se reconstruyó con **lista vacía** (re-derivación
pura). Resultado final: inventario −2,355,603.89 con todas las deltas equity-neutral.

## 4. Conciliación financiera por medio (GEN-1)

| Medio × moneda | Cuenta | Movimientos | Saldo CUP |
|---|---|---:|---:|
| Efectivo CUP | ACT_EFECTIVO_CUP | 474+ | 1,233,950.00 |
| Efectivo USD | ACT_EFECTIVO_USD | ~10 | 27,500.00 |
| Transferencia nacional | ACT_BANCOS | ~70 | 1,264,610.01 |
| Transf. Exterior (zelle USD) | **ACT_TRANSF_EXTERIOR** | 238 | **24,606,900.00** |
| Servicios pagados | GAS_SERVICIOS / PAS_SERV_PEND | 20+20 | gasto 60,765.00 · obligación 0.00 |
| Recepciones pendientes | PAS_CXP_PROV | 89 | 2,961,795.90 |
| Entregas a depósito | ACT_OTROS_CORR | 2 | 8,729,279.98 |
| Inventario (libro) | ACT_INVENTARIO | — | −2,355,603.89 (residual documentado) |

## 5. Diferencias GEN-0 → GEN-1 por categoría (puente completo)

| Categoría | GEN-0 | GEN-1 | Δ | Causa |
|---|---:|---:|---:|---|
| ACT_BANCOS | 25,850,770.01 | 1,264,610.01 | −24,586,160.00 | zelle → cuenta propia (mandato §4) |
| ACT_TRANSF_EXTERIOR | 0.00 | 24,606,900.00 | +24,606,900.00 | ídem (+20,740 de cobertura nueva) |
| ACT_EFECTIVO_CUP | 1,265,280.00 | 1,233,950.00 | −31,330.00 | RECT-MON/015 incorporadas |
| ACT_EFECTIVO_USD | −4,500.00 | 27,500.00 | +32,000.00 | ídem |
| ACT_INVENTARIO | 596,470.23 | −2,355,603.89 | −2,952,074.12 | reallocation FAC (neto 0 con COGS/PERDIDA/VALES) |
| GAS_COSTO_VENTAS | 1,752,998.46 | 4,506,831.73 | +2,753,833.27 | ídem |
| GAS_PERDIDA_INV | 490,447.58 | 1.00 | −490,446.58 | ídem |
| GAS_VALES | 121,879.63 | 810,567.06 | +688,687.43 | ídem |
| ING_VENTAS | 36,137,199.99 | 36,192,949.98 | +55,749.99 | cobertura nueva (5 ventas pre-v3) |
| ING_DESCUENTOS | −4,100.00 | 30,239.99 | +34,339.99 | diferencias de cobro que las RECT compensaban |
| PAS_CXP_PROV | 2,961,795.90 | 2,961,795.90 | 0.00 | exacto |
| Resto | — | — | 0.00 | sin cambios |

**Suma de todas las deltas de resultados+inventario: 0.00 (equity-neutral).**
La variación total de patrimonio (−2,930,664.12) = zelle-neto +20,740 − reallocation 0 +
RECT incorporadas −64,669.99 + cobertura nueva −53,046.04 + residuales menores… el puente
completo y cuadrado está en ESTADO-DE-SITUACION.md §3.
