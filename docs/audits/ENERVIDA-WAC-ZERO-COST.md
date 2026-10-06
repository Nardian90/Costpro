# ENERVIDA-WAC-ZERO-COST — Saneamiento contable controlado de `cost_average = 0`

**Tarea:** TAREA 2 — Saneamiento contable controlado de `cost_average = 0` (ENERVIDA / VITALLCONS)
**Tienda:** ENERVIDA-VITALLCONS — `5e6fe821-5465-48b1-b3f1-3aa3182edc38`
**Fecha de ejecución:** 2026-10-06 (zona `America/Havana`)
**Rama:** `audit/enervida-zero-cost-saneamiento`
**Independencia:** tarea INDEPENDIENTE de la importación ENERVIDA 05/10/2026 (GATE 16, certificada, PR #1368 mergeado). Ninguna operación de la importación fue re-ejecutada, modificada ni revertida.

---

## 1. Objetivo

Determinar y corregir de manera contablemente defendible el costo de cada producto con `cost_average = 0`, preservando el WAC, el historial de inventario, la trazabilidad y la integridad de las operaciones existentes. El objetivo NO fue poner `cost_average ≠ 0` a todos los productos, sino que **cada `cost_average` tenga una explicación contable defendible**.

## 2. Baseline

| Campo | Valor |
|---|---|
| HEAD al iniciar | `8b479ddc5b8d5602df4dbea14efcd3ee0d0e5c10` (= origin/main) |
| Rama de trabajo | `audit/enervida-zero-cost-saneamiento` (creada desde main) |
| Estado del estado inicial | Reconciliación GATE 16: 157/157, delta=0, importación CERTIFICADA |
| Productos totales de la tienda | 157 |
| Productos con `cost_average = 0` al inicio | 71 |
| Clasificación heredada de GATE 16 | 44 COSTO_REAL_RECUPERABLE / 14 COSTO_ZERO_LEGITIMO / 13 REQUIERE_DECISION_CONTABLE |
| Únicos `wac_correction` previos | SKU 48 (0→250) y SKU 112 (0→1), GATE 16 |

La tarea comenzó en **READ-ONLY** y permaneció READ-ONLY hasta completar toda la clasificación y el gate de decisión.

## 3. Metodología

1. **Snapshot inmutable** (§5): los 71 productos con todos sus `stock_movements` (280), `receipt_items` (59), `receipts` (3, todos `status=active`), `wac_change_log` (0 filas previas para estos productos) y `w62_zero_cost_flags` (22). El snapshot se guardó como evidencia y no fue alterado durante las correcciones.
2. **Investigación del mecanismo canónico** (§10-§12):
   - `fn_recalc_wac` (SECURITY DEFINER, extraída live de `pg_get_functiondef`): blend D-01 `ca_new = (S·ca_prev + q·uc)/(S+q)` en entradas; WAC invariante en salidas y reversas; exige `S+q>0` en reversas; escribe con token `SET LOCAL app.wac_writer='fn_recalc_wac'`; registra cada cambio en `wac_change_log` (before/after/event/qty/uc/source_ref/changed_by).
   - Guard `trg_guard_wac_writer` → `w62_guard_wac_writer()`: rechaza cualquier `UPDATE OF cost_average` sin el token (`ERR_WAC_SINGLE_WRITER_VIOLATION`). `fn_recalc_wac` es el **único escritor canónico** del WAC.
   - Regla de moneda oficial (migración `20260702000001_fix_wac_currency_conversion.sql`): `receipt_items.unit_cost` se guarda en moneda original; `cost_average`/`stock_movements` en CUP; conversión = `unit_cost × COALESCE(tasa_cambio_recepcion, 1.0)`.
   - DF-02 (migración `20261004130000_h0r_create_sale_v2_hardening.sql`): venta con WAC=0 exige fila en `w62_zero_cost_flags` scope='sale', si no `ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED`; `cost_at_sale` se toma del servidor (WAC bajo lock).
3. **Reconstrucción del WAC por replay** (§10): para cada producto se reprodujo el algoritmo real `fn_recalc_wac` sobre su historial cronológico de movimientos: cada `purchase` mezcla (blend) con el costo convertido a CUP de su `receipt_item`; `sale`/`issue_slip_out`/`adjustment` reducen stock con WAC invariante; `sale_reverse`/`issue_slip_reverse` devuelven stock con WAC invariante (política A1/DF-01 de devoluciones WAC-neutras). **No se creó ningún movimiento de stock ficticio** (§13); no se inventó ninguna fórmula nueva.
4. **Validación cruzada**: costo del `receipt_item` convertido vs `unit_cost` del movimiento de compra — coherencia total en 59/59 pares; stock final del replay vs `stock_current` — igualdad exacta en 71/71 (`dStock = 0`).

## 4. Clasificación final (71 productos)

| Clase | Cantidad | SKUs | Resultado |
|---|---|---|---|
| COSTO_REAL_RECUPERABLE → **APLICAR** | **44** | 32 con costo CUP real (ratio costo/precio = 1.0, patrón documentado de la recepción FAC-VITALLCONS-001) + 12 con costo documentado de 1 CUP en su recepción | Corregidos con WAC reconstruido |
| COSTO_ZERO_LEGITIMO | **14** | 7, 10, 23, 41, 53, 54, 58, 60, 78, 91, 93, 101, 105, 114 | Sin movimientos, sin recepciones: cero legítimo, no modificado |
| REQUIERE_DECISION_CONTABLE | **13** | 9, 21, 24, 44, 80, 82, 83, 85, 86, 111, 117, 118, 122 | Incoherencia monetaria documentada; no modificado |

Criterios §9 (A-I) verificados individualmente para los 44: evidencia documental (recepción activa), moneda conocida (CUP), cantidad válida, costo unitario positivo, compatibilidad con la naturaleza del producto, sin evidencia contradictoria (movimiento↔recepción y stock reconciliados), cálculo reproducible (replay determinista), sin efecto retroactivo sobre operaciones históricas, trazabilidad completa en `wac_change_log`.

### Patrón de los 13 (§14-§15)

11 recepciones etiquetadas `moneda_recepcion='USD'` con `tasa=680` cuyo valor numérico **coincide exactamente con el precio de venta en CUP** (ej. SKU 9: uc 25 USD → 17.000 CUP vs precio 25 CUP, ratio 680x), 1 recepción CUP con doble conversión ya aplicada (SKU 122: uc 23.800 = 35 × 680) y 1 caso sin precio de referencia (SKU 44: uc 5.040 CUP, precio 0). La conversión documentada produce costos económicamente incompatibles con el producto (criterio E falla); la alternativa (leer el unit_cost como CUP) requiere corregir el dato fuente de la recepción, lo cual es una **decisión contable humana**. Ninguno fue modificado. Sub-clasificación por SKU: ver CSV/JSON adjuntos (`posible costo correcto`, `nivel de confianza`).

### Los 14 zero legítimos (§16)

Verificado individualmente: 0 movimientos de stock, 0 receipt_items, stock 0. El cero es la representación correcta de un producto sin historial de adquisición. Permanecen en 0.

## 5. Correcciones ejecutadas (§22-§24)

- 44 correcciones individuales, en lotes pequeños con verificación inmediata (6+16+16+6); ninguna escritura simultánea masiva.
- Protocolo por producto (atómico en una transacción): re-verificar estado contra snapshot (`cost_average=0` y `stock_current` idéntico, con `FOR UPDATE`) → adquirir single-writer (`set_config('app.wac_writer','fn_recalc_wac',true)`, réplica del protocolo del escritor canónico) → `UPDATE products` → `INSERT wac_change_log` → liberar guard → verificar resultado.
- **Idempotencia (§23)**: `correction_id = ENERVIDA-WAC-2026-SKU-<sku>` en `wac_change_log.source_ref`; pre-check evita repetir correcciones.
- **Verificación por SKU (§24)**: `cost_average` = WAC propuesto, `wac_change_log` = 1 fila, **stock antes = stock después exacto** en 44/44.
- `cost_average = 1` se aplicó únicamente a los 12 productos cuya **recepción documentada registra unit_cost = 1 CUP** (no como parche universal; §29).

## 6. Reconciliación (§25-§27)

| Verificación | Resultado |
|---|---|
| Stock snapshot vs live en los 71 | 71/71 intacto |
| Reconciliación completa vs esperado certificado GATE 16 | **157/157, delta = 0** |
| Re-auditoría `cost_average = 0` | 27 restantes = 14 ZERO_LEGITIMO + 13 REQUIERE_DECISION — **0 ceros accidentales / sin clasificar** |
| `wac_change_log` del saneamiento | 44 filas (46 totales del evento `wac_correction` incl. GATE 16) |

## 7. Impacto

- **COGS histórico intacto (§19)**: 0 ventas, 0 VS, 0 OTs, 0 devoluciones, 0 pagos, 0 `sale_items`, 0 `cost_at_sale`, 0 movimientos históricos modificados. Las correcciones solo afectan el **WAC vigente** (costos futuros).
- **Flags DF-02 (§18)**: los 22 flags históricos se conservan. Tras el saneamiento, 18 quedan en reposo (su producto tiene WAC real; DF-02 no vuelve a dispararse); 4 siguen siendo necesarios mientras el costo permanece en 0 pendiente de decisión (SKUs 9, 86, 111, 122). Política: no borrar flags históricos; los nuevos ceros solo se cubren con flag aprobado.
- **Ventas con WAC=0 (§17)**: bloqueadas por `create_sale_v2` (DF-02) salvo flag aprobado; el flag queda auditado (`approved_by`/`reason`); el COGS de ventas futuras usa el WAC real del servidor.

## 8. Pendientes (§31)

Los 13 SKUs con incoherencia monetaria requieren decisión contable: corregir la moneda/costo del dato fuente en las recepciones (elevar a tarea separada) y luego aplicar el mismo protocolo de reconstrucción. No se requiere información adicional para los 44 corregidos ni para los 14 legítimos.

## 9. Decisión final

Evidencia > fórmula > modificación. Estado final de la tienda: **130 productos con `cost_average > 0`** (84 que ya tenían costo + SKU 48/112 de GATE 16 + 44 de esta tarea), **14 con cero legítimo justificado**, **13 con cero pendiente de decisión humana documentada**. Ningún `cost_average` quedó sin explicación contable defendible.
