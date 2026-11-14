# INFORME DE CONCILIACIÓN DEL ACTIVO DE INVENTARIO — ACT_INVENTARIO

**Misión:** CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 — Reparación de trazabilidad de compras y conciliación integral del activo de inventario
**Fecha de generación:** 2026-11-15 (evidencia de producción 2026-11-14 15:37–17:00 UTC)
**Alcance:** produccion (proyecto `wthkddeleylijmonclxg`) — lectura y actualización exclusiva del campo `reference_id` conforme a la autorización expresa de la Fase II; valores económicos intactos.
**Documentos centrales:** FAC-VITALLCONS-001 (id `fd9d6c88-5db8-49ea-b185-8bc96cc93e63`, tasa 680 aprobada, total 192.039.436,00 CUP).

---

## 1. Resumen ejecutivo

| Resultado | Valor |
|---|---|
| Movimientos de compra sin `reference_id` (punto de partida) | **208** (ENERVIDA 111 · PUERTO PADRE 56 · COSTPRO Prueba 41) |
| Correspondencia única demostrada 1:1 (Fase I) | **208/208 MATCH_UNICO** — 0 ambiguos, 0 sin coincidencia |
| Reparación de trazabilidad (Fase II, patrón M025) | **208 reparados** · auditoría 208 filas `TRACEABILITY_BACKFILL` · idempotencia demostrada (2.ª pasada = 0 cambios) |
| Conciliación de cantidades por SKU (Fase III, ENERVIDA) | **PERFECTA** — existencia calculada = `stock_current` = `inventory.quantity` (7.078,35 unidades; 0 diferencias) |
| Mayor `ACT_INVENTARIO` (Fase IV) | saldo inicial 0 + débitos 207.256.112,57 − créditos 5.556.866,02 = **saldo contable 201.699.246,55 CUP** |
| Valoración A (costos históricos de adquisición, ENERVIDA) | A1 WAC compras **34.790.669,75** · A2 último costo 34.153.525,35 · A-FVC 35.292.330,00 |
| Valoración B (costos vigentes, ENERVIDA) | **1.065.011,13 CUP** (7.078,35 unidades) |
| Valoración C (conteo físico) | **SIN CONTEOS FIRMADOS** (physical_counts = 0; 11 inventarios, todos voided) — no se certifica físicamente |
| Diferencia mayor vs valoración B (ENERVIDA) | **188.374.455,25 CUP** — descompuesta y explicada al céntimo (§6) |
| Recorrido de los 192.039.436 CUP (Fase VI) | consumido 4.546.307,12 · vales 524.266,99 · ajustes 490.727,00 · devuelto 0 · revertido 353.386,59 · en existencias 710.892,56 · **saldo remanente atribuible 187.550.202,30** |

**Conclusión principal.** Las cantidades están íntegras (kardex = registros), las compras están ahora 100 % trazadas (309/309 con `reference_id`), y el mayor `ACT_INVENTARIO` está correctamente reconstruido. La diferencia entre el saldo contable (189,44 M ENERVIDA) y el valor de las existencias a costos vigentes (1,07 M) está **demostrada al céntimo**: entradas valorizadas a la tasa 680 aprobada (con WAC no actualizado por la importación legacy) frente a salidas registradas a costos 0–1 CUP, más salidas físicas sin asiento y reingresos sin asiento. **No se crearon ajustes, no se modificaron valores económicos originales, y no se certifica inventario físico sin conteos reales.**

---

## 2. Punto de partida verificado

- Estado inicial verificado en vivo (M026): 309 movimientos de compra (101 con referencia a FVC + **208 sin referencia**); 98 recepciones / 309 líneas; FVC intacta (192.039.436 / `active` / 1 asiento / 101 movimientos referenciados).
- Correspondencia estructural: 309 líneas de recepción − 101 líneas FVC = **208 líneas no-FVC = 208 movimientos sin referencia, exactamente por tienda** (111/56/41 en ambas direcciones).
- Conteos base: `fin_entries` 1.033 · `fin_movements` 3.516 · `fin_posting_errors` 0 · `stock_movements` 1.775 · `audit_logs(TRACEABILITY_BACKFILL)` 101 (M025).

## 3. Fase I — Reconciliación de los 208 movimientos sin referencia

**Criterios conjuntos (misión §3):** identidad de producto + cantidad (±1e-6) + costo unitario ya convertido (±0,005 CUP exacto) + fecha y secuencia temporal + tienda + referencia textual + correspondencia 1:1 con la línea de recepción. Regla §3 respetada: la coincidencia por producto y fecha NO se usó como evidencia suficiente donde existían varias compras del mismo producto.

**Resultado:**

| Clasificación | N. | Tratamiento |
|---|---|---|
| MATCH_UNICO | **208** | reparado en Fase II |
| MATCH_CONFIRMADO | 0 | — |
| MATCH_AMBIGUO | 0 | — |
| SIN_COINCIDENCIA | 0 | — |
| YA_VINCULADO | 0 (fuera del alcance: los 101 FVC ya estaban vinculados por M025) | — |

- Cobertura 1:1 global: **208 líneas no-FVC cubiertas exactamente una vez cada una**; 0 líneas sin movimiento; 97/97 recepciones cubiertas.
- 8 movimientos con doble candidatura inicial (productos 87/88/137/146, costo 1 CUP, dos recepciones idénticas en producto+cantidad+costo) quedaron **desambiguados por fecha económica y de creación EXACTAS** (misma fecha y marca de tiempo de importación) — nunca por producto+fecha solos.
- Diferencia de costo máxima del emparejamiento: **0,00 CUP** (todas exactas).
- Particularidades documentadas: 6 líneas USD con tasas propias 835–845 (no 680); 1 movimiento emparejado a la recepción `reversed` (a3fe3e76, FAC-TEST-CP001) — ciclo canónico reconocimiento+anulación ya registrado en el expediente anterior; 202 líneas CUP.

## 4. Fase II — Corrección controlada de trazabilidad (patrón M025)

Condiciones obligatorias de la misión §5 — **todas cumplidas y verificadas**:

1. **Preflight completo:** re-derivación determinista en vivo del pareo (208 pares 1:1; cobertura 208/208; FVC intacta; conteos previos).
2. **JSON con valores anteriores y propuestos:** `m028-fase2-corrige-208.json` (208 pares movimiento→recepción→línea).
3. **Copia de seguridad lógica:** `m028-backup-logico-208-filas.json` — 23 columnas × 208 filas del estado previo.
4. **Transacción controlada:** UPDATE de sentencia única (atomicidad PostgreSQL) con controles de identidad por fila: `id::uuid` + `reference_id IS NULL` + `product_id` + cantidad (±1e-6) + costo (±0,005).
5. **Solo filas NULL:** guard `WHERE reference_id IS NULL` — idempotente por construcción.
6. **Auditoría:** 208 filas `TRACEABILITY_BACKFILL` en `audit_logs` (usuario, fecha, motivo, old/new, línea y recepción asociadas, procedimiento reversible por movimiento). Total histórico: 309 (101 M025 + 208 M028).
7. **Reversibilidad:** `m028-restore.sql` (BEGIN/COMMIT, guard por fila) + fórmula de inversión en `audit_logs.metadata.reversible`.
8. **Segunda pasada = 0 cambios (demostrada):** re-derivación → 0 pares pendientes; predicado exacto del UPDATE → 0 filas; reintento de auditoría → 0 nuevas (guard `NOT EXISTS` 3/3).

**Verificación posterior (fail-closed):** 208/208 `reference_id` correctos por fila · **valores económicos conservados byte a byte en 20 columnas** (cantidades, costos, fechas, monedas, notas) · conteos invariantes (`stock_movements` 1.775 · `fin_entries` 1.033 · `fin_movements` 3.516 · errores 0) · FVC intacta (192.039.436 / `active` / 101 refs) · **purchase sin referencia = 0**.

> No se modificaron: cantidades, fechas, `unit_cost`, monedas, tasas, WAC, notas, existencias ni asientos financieros.

## 5. Fase III — Reconstrucción integral de cantidades por SKU (ENERVIDA-VITALLCONS)

Fórmula §5 aplicada por SKU (166 productos con movimientos; 92 adicionales con `stock_current`=0 y sin kardex):

`0 (existencia inicial) + recepciones 15.435,90 + devoluciones 2 − ventas 3.541,30 − vales 4.272,75 − ajustes negativos 1.359,00 + ajustes positivos 552,50 + reversiones/entradas correctivas 261,00 = existencia resultante **7.078,35**`

**Comparación (misión §5, por SKU):**

| Fuente | Existencia | Diferencia |
|---|---|---|
| Reconstrucción cronológica (cada movimiento contado exactamente 1 vez — 0 duplicados exactos) | 7.078,35 | — |
| `stock_movements` (Σ quantity_change) | 7.078,35 | **0,00** |
| `products.stock_current` | 7.078,35 | **0,00** (0 SKUs con diferencia) |
| `inventory.quantity` | 7.078,35 | **0,00** (0 SKUs con diferencia) |
| Líneas de recepción (recibido por movimientos vs por líneas) | 15.435,90 | **0,00** (0 SKUs con diferencia) |

Separación por `store_id` estricta (sin mezclar tiendas). La recepción revertida queda compensada por su `purchase_reverse`. Entregable: `CONCILIACION_INVENTARIO_POR_SKU.xlsx` (166 SKUs + 92 huérfanos + resumen).

## 6. Fase IV/V — Mayor ACT_INVENTARIO, tres valoraciones y puente exacto

### 6.1 Mayor reconstruido (saldo inicial + débitos − créditos)

| Movimiento | Asientos | CUP |
|---|---|---|
| **Débitos — RECEPCION/reconocimiento** | 98 | 207.256.110,57 |
| **Débitos — DEVOLUCION_VENTA** (restituyen inventario) | 2 | 2,00 |
| **Créditos — VENTA/COGS** | 700 | 4.747.041,91 |
| **Créditos — VALE_SALIDA** | 198 | 808.863,11 |
| **Créditos — AJUSTE_INVENTARIO** | 1 | 1,00 |
| **Créditos — RECEPCION/anulacion** (revertida) | 1 | 960,00 |
| **Saldo contable final** | | **201.699.246,55** |

`fin_opening_balances` = 0 filas (sin saldos iniciales). Presentación por tienda / categoría / mes / documento de origen en `CONCILIACION_MAYOR_VS_INVENTARIO.xlsx`. Dimensión de producto: `fin_movements.product_id` es NULL en 1000/1000 movimientos de la cuenta → reconstrucción **indirecta** documentada (cost_at_sale de `transaction_items` + unicidad de producto por transacción; residual no atribuible 2.060,40 CUP en 2 transacciones multi-producto — no se inventó asignación).

**Saldo por tienda:** ENERVIDA 189.439.466,38 · COSTPRO (Prueba) 12.258.163,67 · PUERTO PADRE 1.616,50.

### 6.2 Identidades kardex ↔ mayor (verificadas al céntimo)

| Categoría | Σ movimientos (q×uc) | Mayor | Dif |
|---|---|---|---|
| Compras (débito) | 207.256.110,57 | 207.256.110,57 | 0,00 |
| Devoluciones (débito) | 2,00 | 2,00 | 0,00 |
| Anulación recepción | 960,00 | 960,00 | 0,00 |
| Vales posted | 808.865,12 | 808.863,11 | 2,01 (redondeo por vale, ENERVIDA) |
| COGS posted | 1.977.980,99 (valor movs de las 671 tx con asiento) | 4.747.041,91 | **−2.769.060,92** (base de costo distinta, ver §7) |

### 6.3 Tres valoraciones (ENERVIDA)

| Base | Valor CUP |
|---|---|
| **A** — costos históricos de adquisición: WAC de compras | 34.790.669,75 |
| A2 — último costo de compra | 34.153.525,35 |
| A-FVC — existencias de los 101 FVC a costo de línea FVC | 35.292.330,00 |
| **B** — costos vigentes (`cost_average`; fuente: motor/WAC, `wac_change_log` 712 filas 2026-09-05→2026-11-13) | **1.065.011,13** |
| **C** — conteo físico | **sin conteos firmados** → conciliación contable contra inventario REGISTRADO; hoja de conteo entregada |

### 6.4 Puente exacto mayor → inventario (ENERVIDA)

```
Saldo contable................................. 189.439.466,38
− Valoración B (costos vigentes)................   1.065.011,13
= Diferencia total.............................. 188.374.455,25
   = D-AB (adquisición A1 − vigentes B)..........  33.725.658,62  [WAC vigente ≈1 vs costo de adquisición]
   + D-A  (mayor − adquisición A1).............. 154.648.796,63  [descompuesto:]
        · vales de salida SIN asiento...........         2,00
        · ventas SIN asiento (valor movs).......   353.398,54  (1 venta v1 de 353.364 + 289 v2 de kardex≈0)
        · ajustes de cuadre SIN asiento........   510.864,50  (77 ajustes; posted 1,00)
        · reversiones/voids SIN asiento.........  −353.390,09  (reingresan stock sin débito — reducen la diferencia)
        · residual (salidas contabilizadas a costo
          inferior al de adquisición + COGS no
          atribuible 2.060,40).................. 154.137.921,67
```

El residual se concentra en los productos FVC: entradas a tasa 680 con salidas registradas a costo 0–1 CUP (WAC ≈1 no actualizado por la importación legacy). **Nota de decisión del propietario:** la tasa 680 está aprobada y no se reabre; el efecto de esa decisión sobre el mayor es exactamente el documentado aquí.

## 7. Fase VI — Investigación específica de los 192.039.436 CUP

Recorrido completo desde el reconocimiento (101 líneas: 79 CUP + 22 USD@680; 105 movimientos históricos; 101 referencias M025 + auditoría):

| Concepto | CUP |
|---|---|
| Entrada FAC-VITALLCONS-001 (débito ACT_INVENTARIO) | **192.039.436,00** |
| Entradas posteriores de los mismos productos (no FVC, posted) | 1.425.454,00 |
| Consumido mediante ventas (COGS contable atribuido a los 101 productos) | 4.546.307,12 |
| Retirado mediante vales de salida (movimientos) | 524.266,99 |
| Ajustado (ajustes de cuadre, valor movimientos) | 490.727,00 |
| Devuelto por clientes | 0,00 |
| Revertido/void (reentradas) | 353.386,59 |
| **Representado en existencias actuales** (45 productos con stock, 3.338 unidades, costos vigentes) | **710.892,56** |
| **Saldo remanente atribuible en ACT_INVENTARIO** | **187.550.202,30** |

- **45 productos FVC conservan existencia** (valor vigente 710.892,56); **56 productos no conservan nada** (entrada 20.915.816,00; remanente 17.805.607,96).
- Concentración extrema: **sku 111 (Grapas plásticas, 83.300.000) + sku 112 (Grapas metálicas, 68.000.000) = 151,3 M** del total, con salidas registradas de 4 y 3 CUP de COGS respectivamente (stock actual 10 y 20 unidades a WAC=1). Les siguen Panel +600W (14,59 M; stock 0), Inversor (13,06 M; stock 1) y Panel 585 (1,29 M; stock 0).
- Mecanismo demostrado producto a producto: la entrada debitó el activo a 680; las cantidades salieron por ventas/vales/ajustes registrados a costo 0–1 CUP (557 movimientos de venta con `unit_cost`=0; WAC no actualizado por la importación legacy), de modo que el mayor conserva el valor de entrada sin respaldo proporcional de existencias ni de salidas contables.
- **No se presume** que los 192 M «deban» permanecer como saldo, ni se califica el importe como activo ficticio sin el recorrido aquí demostrado; tampoco se ejecuta regularización alguna (misión §11).

## 8. Fase VII — Clasificación de diferencias

| # | Tipo | Importe CUP | SKU/documentos | Causa demostrada | Evidencia | Consecuencia contable |
|---|---|---|---|---|---|---|
| 1 | Movimiento sin referencia documental | **0 (resuelto)** | 208 movimientos | histórico sin `reference_id` | Fases I-II; auditoría 309 filas | trazabilidad completa |
| 2 | Diferencia de costo — salidas por debajo del costo de adquisición | **154.137.921,67** | 101 productos FVC (skus 111/112 = 151,3 M) | entradas a 680 aprobadas + WAC≈1 no actualizado por importación legacy | m033/m034; identidades §6.2 | activo sin respaldo físico proporcional |
| 3 | WAC incorrecto (vigente ≠ adquisición, existencias) | **33.725.658,62** | 45 FVC con stock + otros | `cost_average` ≈1 frente a adquisición 680/840 | m034 D-AB | existencias subvalorizadas a costos vigentes |
| 4 | Asiento ausente — ajustes de cuadre | **510.864,50** | 77 ajustes «Cuadre importación ENERVIDA» (ago 2026) | importación legacy sin posting; posted 1,00 | m031b | activo sobrevaluado |
| 5 | Asiento ausente — ventas | **353.398,54** | 290 tx completed sin asiento + 18 voided (1 venta v1 353.364) | ventas sin posting financiero | m031b | pasivo de COGS no registrado |
| 6 | Asiento ausente — vales | **189.691,76** | 42 vales (2,01 ENER · 189.644,76 COSTPRO · 45,00 PP) | vales sin posting | m031b | activo sobrevaluado en esas tiendas |
| 7 | Asiento ausente — reversiones/voids (reingresos) | **473.393,09** | sale_reverse 353.389,59 · issue_slip_reverse 120.002,00 · sale_void 1,50 | reversos sin débito de inventario | m031b | activo subvaluado por esos importes |
| 8 | Costo de salida incorrecto (capa kardex) | 0 económico (registro) | 557 movimientos de venta `unit_cost`=0 (2.652,72 u) | capa de movimientos sin costo; COGS del mayor calculado a `cost_at_sale`/WAC | m031c/m032 | kardex no apto para valorización de salidas |
| 9 | Diferencia inventario registrado vs conteo físico | **indeterminable** | 258 SKUs ENERVIDA | no existen conteos firmados | physical_counts=0 | hoja de conteo entregada; certificación pendiente |
| 10 | Información no disponible | 2.060,40 | 2 transacciones multi-producto | COGS no atribuible inequívocamente | m032 | sin asignación inventada (misión §6) |

No se crearon ajustes de inventario, gastos o patrimonio para cuadrar artificialmente (misión §9).

## 9. Fase VIII — Propuestas de regularización (NO EJECUTADAS)

Toda ejecución queda pendiente de autorización expresa del propietario; cada propuesta incluye impacto por tienda y documento original (ver `CONCILIACION_MAYOR_VS_INVENTARIO.xlsx` y `EVIDENCIA_ACT_INVENTARIO.json`):

1. **Referencias históricas no reparables:** ninguna — 208/208 quedaron reparadas; sin acción.
2. **Diferencias de cantidades:** ninguna — la conciliación de cantidades es exacta (Fase III); sin acción.
3. **Diferencias de valoración (D-AB 33.725.658,62 + núcleo 154.137.921,67):** decidir la política de valoración de existencias (costo de adquisición vs vigente) y de tratamiento del mayor; requiere primero conteo físico (propuesta 7). Impacto concentrado en ENERVIDA y en los 101 productos FVC (skus 111/112 = 151,3 M).
4. **COGS incorrecto:** ninguna reclasificación propuesta — el COGS posted refleja `cost_at_sale`/WAC del momento (tasa 680 aprobada); la diferencia 557 movimientos con costo 0 es de la capa kardex (propuesta técnica: repoblar `unit_cost` de movimientos de venta desde `transaction_items.cost_at_sale` en una migración futura, sin tocar valores económicos).
5. **WAC histórico incorrecto:** no recalcular WAC histórico (prohibido por la misión); propuesta limitada a documentar la política futura de actualización de WAC en recepciones (el flujo canónico actual ya lo hace: `wac_change_log`).
6. **Asientos sin soporte suficiente (4, 5, 6, 7 de la tabla §8):** si el propietario lo autoriza, posting de los ajustes de cuadre (−510.864,50), vales pendientes (−189.691,76), ventas pendientes y reingresos por reversos (+473.393,09) mediante el motor CP-FIN con regla versionada — impacto: ENERVIDA −470.270,95 neto; COSTPRO −189.644,76; PUERTO PADRE −45,00.
7. **Diferencias que requieren conteo físico:** ejecutar la hoja de conteo (`HOJA_CONTEO_FISICO_ENERVIDA.xlsx`, 258 SKUs, prioridad a los 101 FVC) y firmarla; con ese resultado decidir la regularización del mayor (incluido el tratamiento contable del remanente de 187,55 M atribuible a FVC).

## 10. Restricciones y autorización (cumplimiento)

Ejecutado y autorizado: auditoría de los 208 · reparación de `reference_id` con correspondencia única (208) · registro en `audit_logs` · consultas de conciliación · matrices y hoja de conteo · verificaciones de idempotencia. **No ejecutado (prohibido y respetado):** modificar cantidades, costos, monedas, tasas, WAC, otros campos de movimientos, asientos, saldos iniciales, backfill adicional, ajustes de inventario o documentos históricos. FAC-VITALLCONS-001 conservada con tasa 680 y total 192.039.436,00 CUP (verificación final incluida).

## 11. Evidencia y entregables

| Entregable | Contenido |
|---|---|
| `INFORME_CONCILIACION_ACT_INVENTARIO.md` | este informe |
| `MATRIZ_208_MOVIMIENTOS_TRAZABILIDAD.xlsx` | 208 movimientos × 24 columnas (ID, tienda, SKU, cantidad, unidad, signo/tipo, fechas, costo, moneda/tasa, referencia, recepción/línea candidata, criterios, confianza, motivo, situación Fase II) + resumen + verificación |
| `CONCILIACION_INVENTARIO_POR_SKU.xlsx` | Fase III por SKU (166 + 92 + resumen) |
| `CONCILIACION_MAYOR_VS_INVENTARIO.xlsx` | Fases IV-VI: mayor por categoría/tienda/mes/documento, valoraciones, puente, por producto, recorrido 192 M (9 hojas) |
| `HOJA_CONTEO_FISICO_ENERVIDA.xlsx` | 258 SKUs (existencia sistema, campos a completar, responsable, fecha, observaciones) + instrucciones |
| `EVIDENCIA_208_MOVIMIENTOS.json` | evidencia integral Fases I-II (análisis + corrección + idempotencia) |
| `EVIDENCIA_ACT_INVENTARIO.json` | evidencia integral Fases III-VII |
| `consultas_sql_independientes_INVENTARIO.sql` | 20 consultas reproducibles (verificadas en producción) |
| `MANIFIESTO_SHA256_INVENTARIO.txt` | manifiesto de integridad |
| Expediente del repo | `docs/audits/inventory-traceability-20261115/` (evidencias por fase m026–m034, backup lógico, restore.sql, scripts m026–m038) |

## 12. Criterio de cierre de la misión

- **Qué recepción originó cada movimiento de compra:** 309/309 demostrado (101 FVC por M025 + 208 por esta misión, 1:1 con línea, evidencia múltiple).
- **Qué cantidades permanecen:** 7.078,35 unidades ENERVIDA (kardex = sistema = inventario, diferencia 0).
- **Qué importes permanecen en el mayor:** 201.699.246,55 CUP (ENER 189.439.466,38 · CP 12.258.163,67 · PP 1.616,50), reconstruido desde los asientos históricos con identidad exacta de compras.
- **Qué costos respaldan esas cantidades:** costos de adquisición A1 34,79 M vs costos vigentes B 1,07 M — diferencia explicada (WAC no actualizado por importación legacy + tasa 680 aprobada).
- **Qué diferencias están justificadas:** la totalidad del gap 188.374.455,25 ENERVIDA descompuesta al céntimo (§6.4).
- **Qué diferencias requieren intervención o conteo físico:** las propuestas §9 (1–7), condicionadas a conteo físico firmado.

**No se declara conciliado el inventario físico (sin conteos reales). No se crearon ajustes automáticos. No se modificaron los valores económicos originales.**
