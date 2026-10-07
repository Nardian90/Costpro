# AUDITORÍA READ-ONLY — PROCEDENCIA DE COSTOS EN ENERVIDA

**TAREA 2C — Auditoría forense de procedencia y validez de costos históricos**
**Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Fecha de ejecución:** 2026-10-07 · **Modo:** 100 % READ-ONLY (0 escrituras de datos)
**Baseline de `main`:** `466f4b9cb4` · **Rama:** `audit/enervida-cost-provenance`
**Método:** código + 462 migraciones del repo + extracción live vía Management API (`database/query`, solo `SELECT`) + `audit_logs` + `git history`.
**Evidencia cruda:** `docs/audits/evidence/enervida-cost-provenance.json` y `enervida-cost-provenance.csv` (153 items clasificados uno a uno). Sin secretos.

---

## 1. Resumen ejecutivo

**¿Los costos existentes son realmente confiables? NO.** La evidencia forense demuestra que el usuario gestionaba **precios de venta**, y que esos precios terminaron registrados como "costos" en las recepciones. El censo completo de los 153 `receipt_items` de la tienda produce la siguiente clasificación (FASE 5):

| Categoría | Items | % | Interpretación |
|---|---:|---:|---|
| C1 — Costo real documentado | **0** | 0 % | No existe una sola pieza de evidencia documental externa (factura de proveedor, adjunto, OC con precio de proveedor) dentro del sistema |
| C2 — Costo registrado, procedencia no verificable | 9 (+1 C2/C5) | 6,5 % | Los 5 "con dinero" de la importación (SKU 25, 30, 75, 76, 100) + SKU 44 (5040 sin precio de referencia) + casos residuales |
| C3 — Costo nominal / fallback 1 CUP | **59** | 38,6 % | Convención explícita "costo nominal 1 CUP sin dato" (GATE de importación, decisión 9); el RPC exige `unit_cost > 0`, por lo que 1 es el mínimo introducible |
| C4 — Incoherencia monetaria (precio USD × 680) | 6 (C4+C6) | 3,9 % | SKUs 87, 121, 122, 123, 128, 999: costo CUP = precio USD × 680 |
| C6 — Costo derivado del precio de venta | **78** | 51,0 % | `unit_cost` **idéntico** al precio de venta (77 exactos + 1 con desviación 12 %: SKU 86, 370 vs 330 USD) |

**Tres conclusiones estructurales:**

1. **El costo registrado es, en más de la mitad de los casos, literalmente el precio de venta.** 32 de los 32 "costos CUP coherentes" que la TAREA 2 recuperó tienen `unit_cost == price` con cero desviación (ratio 1.00x). Un costo de adquisición exactamente igual al precio de venta deja margen 0 — económicamente implausible como patrón generalizado. La única hipótesis compatible con la evidencia es que el dato de costo se llenó copiando el precio.
2. **El valor 1 CUP es una convención de saneamiento, no un costo.** Está documentado en la decisión 9 del GATE de importación del 2026-10-04 («costo nominal 1 CUP sin dato (real en las 5 con dinero)») y aparece en 59 de los 153 items. La migración de importación lo describe como mecanismo para «no dejar WAC nulo/0».
3. **La transcripción USD→CUP a tasa 680 produjo costos inflados 680x** en al menos 10 productos: 6 items de recepción (C4) y 4 productos con **WAC vigente inflado** fuera de los 71 auditados (SKU 67, 68, 107, 121 — ver §8-bis).

**¿Puede CostPro afirmar actualmente que `cost_average` representa el costo económico real de los productos ENERVIDA? → NO.**

**¿Qué porcentaje de los WAC actuales tiene procedencia verificable? → 0 %** con evidencia documental (C1 = 0). Aproximadamente **3,2 %** de los productos (5/157) tienen un costo registrado económicamente plausible e independiente del precio (C2), y otro tanto podría reconstruirse con documentación externa (C5→C1 vía facturas del usuario). El resto es precio-as-cost (C6), nominal (C3), incoherente (C4) o desconocido.

---

## 2. Origen de `cost_average`

`cost_average` (WAC, moneda única CUP) es escrito **exclusivamente** por la función `fn_recalc_wac` (escritor único, guard `trg_guard_wac_writer` → `ERR_WAC_SINGLE_WRITER_VIOLATION`, token `app.wac_writer='fn_recalc_wac'`). Cada cambio queda en `wac_change_log` (before/after/event/qty/uc/source_ref/changed_by). La fórmula (blend D-01):

```text
ca_new = (S·ca_prev + q·uc) / (S + q)     — solo en entradas (reception_in, adjustment_plus)
salidas y reversas: WAC invariante (A1/DF-01)
```

**Caminos que invocan al escritor (verificados en migraciones):**

| Camino | Migración | Efecto sobre WAC |
|---|---|---|
| `register_reception` | `20260909000000_rem_f4_04` | `reception_in` con `uc = unit_cost × tasa` del item |
| `perform_inventory_adjustment` (Δ>0) | `20261004120002` | `adjustment_plus` con `uc = COALESCE(p_unit_cost_adjustment, cost_average, cost_price)` |
| `confirm_pending_reception` | doctrina W62-01 §6 | `reception_in` al confirmar recepción pendiente |
| Correcciones gobernadas | GATE 16 / TAREA 2 | `wac_correction` con `wac_change_log` obligatorio |

**Hallazgo crítico de procedencia:** `wac_change_log` **solo existe desde 2026-10-04 04:52 UTC** (primer registro = importación Excel). Toda escritura de WAC anterior es *era pre-log*: hoy hay **90 de los 101 productos** de la factura pre-corte con WAC>0 cuyo valor coincide con el costo de su recibo, pero cuyo mecanismo exacto de escritura **no es reconstruible** (`confirm_pending_reception` y escritores previos a v2.22.0/REM-F4-04, sin auditoría conservada). La migración `20260909000000_rem_f4_04` documenta el defecto raíz de los 71 ceros: *«`register_reception` incremented stock but never updated `products.cost_average` (WAC stayed 0)»* — las recepciones registradas antes del 2026-09-09 no escribían WAC, y las que se confirmaron después de que el escritor antiguo se desactivara quedaron en 0.

**Estado actual del censo de productos (live):**

```text
157 productos = 27 cost_average=0 + 57 cost_average=1 + 58 cost_average>1
27 ceros = 14 ceros legítimos (0 movimientos, verificado) + 13 pendientes de decisión
```

---

## 3. Origen de `receipt_items.unit_cost`

**¿Quién introduce el costo? El llamador. No existe ningún default técnico de costo.** Verificado en las 462 migraciones:

1. **RPC `register_reception`** (canónico: `20260909000000`; moneda/tasa desde `20260629000002`; hardening v2.23.0 en `20260807000014`):
   - `v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0)` — el valor **viene del cliente**; si es `<= 0` → `ERR_INVALID_UNIT_COST`. El sistema **obliga** a teclear algo > 0.
   - Defaults existentes: `moneda_recepcion = 'CUP'` y `tasa_cambio_recepcion = 1.0` (columna y RPC). **No hay `DEFAULT 1` para `unit_cost`.**
2. **UI de recepción** (`src/components/views/terminal/views/inventory/useReceptionState.ts`):
   - Prefill del costo desde el producto: `unit_cost: preselectedProduct.cost_price || 0` (líneas 219, 544, 580). El campo es editable y se muestra al usuario `costo_cup = unit_cost × tasa`.
   - Pegado desde Excel: `row['Costo Unitario'] || row['costo_unitario'] || row['Costo'] || row['costo'] || 0` (línea 691).
3. **Importación Excel 2026-10-04** (commit `5a86d52`, informe `ENERVIDA-EXCEL-IMPORT.md`): el importador llamó al RPC directamente con **costo nominal 1 CUP sin dato** (decisión 9 del GATE, aprobada por el usuario) y costo «real en las 5 con dinero». Al ir por RPC puro, **eludía la validación F-21 de la ruta API** (que hoy rechaza tasa ≤ 1.5 en moneda no-CUP); el CHECK de BD (`20260703000003`) sí se aplicaba pero solo rechaza tasas ≤ 1.5, por lo que USD×680 pasó.
4. **Recepciones manuales del usuario** (factura pre-corte `FAC-VITALLCONS-001`): sin evento en `audit_logs` (creada 2026-08-11 por una versión del RPC anterior a la inclusión de auditoría), con `created_at` retrofechado a 2026-07-01.

**Respuestas FASE 3:**

- ¿La UI solicita costo? **Sí**, obligatorio de facto (el RPC rechaza ≤ 0), con prefill desde `cost_price` y conversión `× tasa` visible.
- ¿Puede quedar vacío/en 1? No vacío; **en 1 sí** (y de hecho ocurrió 59 veces).
- ¿Algún import estableció costos automáticamente? Sí, la importación del 04-10-2026 fijó **1 CUP nominal** en 38 items (decisión aprobada) y costos manuales en 5.
- ¿Existe default = 1? **No** en esquema ni en RPC. El 1 es siempre una **decisión del llamador** (usuario o importador), documentada en el segundo caso.

---

## 4. Evidencia de los valores = 1 CUP

Universo: **59 items con `unit_cost = 1` CUP** (12 en la factura pre-corte del usuario + 38 en la importación + 9 en items sin precio de referencia asociable). Clasificación: **C3 — costo nominal/fallback**, con tres evidencias independientes:

1. **Evidencia de convención declarada:** la decisión 9 del GATE de importación (2026-10-04) fijó por escrito «proveedor "Vitallcons", **costo nominal 1 CUP sin dato** (real en las 5 con dinero)», y el §5 del mismo informe explica el motivo técnico: «Δ>0 con costo nominal 1 CUP **para no dejar WAC nulo/0**».
2. **Evidencia de diseño del sistema:** `register_reception` rechaza `unit_cost <= 0` (v2.23.0). Cuando el costo se desconoce y el campo es obligatorio > 0, el mínimo tecleable es 1 — el sistema **empuja** a la convención 1 sin imponerla.
3. **Evidencia de datos:** los items a 1 CUP se concentran exactamente donde no había información de costo (productos sin precio o con precio en otro flujo) y coexisten con 40 transiciones WAC 0→1 del propio importador (20 `reception_in` + 19 `adjustment_plus` + 1 `wac_correction` de GATE 16).

**¿Es 1 CUP el costo real de esos productos? No hay ninguna evidencia de que lo sea**, y la evidencia disponible (convención declarada + diseño del campo obligatorio) apunta en dirección contraria. Las tres preguntas de la FASE 6, separadas:

- ¿Evidencia en código de que 1 era default/fallback? **No como default técnico; sí como convención operativa documentada** en el informe de importación.
- ¿Evidencia de que el usuario introdujo 1 como costo real? **No**; en el caso del usuario (12 items de la FAC) es indistinguible de "campo obligatorio, valor desconocido".
- ¿Evidencia externa de que costaban 1 CUP? **No existe ninguna** en el sistema.

Hoy **57 productos** de la tienda tienen `cost_average = 1` de facto (importación + cuadres + 12 correcciones de TAREA 2 + 1 de GATE 16). El 1 CUP ya es, en la práctica, la unidad de cuenta del "costo desconocido" en ENERVIDA.

## 5. Evidencia de los 32 costos CUP (los "coherentes" de TAREA 2)

Comparación costo registrado vs precio de venta vigente, para los 32 SKU que la TAREA 2 corrigió con costos CUP ≠ 1:

| SKU | Producto | uc recibido | Precio | Ratio |
|---|---|---:|---:|---:|
| 1 | Abrazadera metálica de 3/4 | 350 | 350 | 1.00x |
| 2 | Abrazadera metálica de 1 pulgada | 350 | 350 | 1.00x |
| 4 | Bisagra | 4 000 | 4 000 | 1.00x |
| 5 | Brecker 16A Sencillo | 2 000 | 2 000 | 1.00x |
| 6 | Brecker 25 A Sencillo | 2 000 | 2 000 | 1.00x |
| 8 | Brecker C32 A Trible | 6 000 | 6 000 | 1.00x |
| 11 | Cabilla 70 Cm | 350 | 350 | 1.00x |
| 13 | Cable Conductor eléctrico 8 | 1 500 | 1 500 | 1.00x |
| 14 | Distribuidor de corriente 4 salidas | 500 | 500 | 1.00x |
| 16 | Cemento P425 Tudella | 12 500 | 12 500 | 1.00x |
| 17 | Césped Artificial | 6 500 | 6 500 | 1.00x |
| 18 | Cheques metálicos | 3 500 | 3 500 | 1.00x |
| 19 | Codo de 90 | 200 | 200 | 1.00x |
| 20 | Codos de 45 grado | 200 | 200 | 1.00x |
| 26 | Disco de esmeril | 2 000 | 2 000 | 1.00x |
| 27 | Escobas | 1 800 | 1 800 | 1.00x |
| 28 | Espejo | 5 000 | 5 000 | 1.00x |
| 31 | Expansiones con tornillos M6 | 350 | 350 | 1.00x |
| 32 | Expansiones con tornillos M8 | 400 | 400 | 1.00x |
| 34 | Fregadero | 23 000 | 23 000 | 1.00x |
| 38 | Lámpara de 20 | 3 200 | 3 200 | 1.00x |
| 42 | Llave de lavamano | 3 000 | 3 000 | 1.00x |
| 45 | Malla perli | 40 000 | 40 000 | 1.00x |
| 46 | Masilla interior blanca | 22 000 | 22 000 | 1.00x |
| 50 | Nudos de 50 | 250 | 250 | 1.00x |
| 51 | Pintura Casa Blanca 14L | 32 500 | 32 500 | 1.00x |
| 56 | Reducido de 3/4 | 350 | 350 | 1.00x |
| 73 | Interruptor doble | 1 500 | 1 500 | 1.00x |
| 74 | Controlador de línea | 6 000 | 6 000 | 1.00x |
| 79 | Interruptor y toma corriente | 1 500 | 1 500 | 1.00x |
| 84 | Conector XT60 | 6 500 | 6 500 | 1.00x |
| 110 | Intermedio | 1 200 | 1 200 | 1.00x |

**32/32 con ratio exactamente 1.00x.** Conclusión (FASE 7/8): la hipótesis "costo real" queda descartada como interpretación general; el patrón demuestra **copiado del precio de venta al campo de costo** (C6). El patrón matemático por sí solo no prueba error en un caso individual, pero 32 coincidencias exactas consecutivas constituyen evidencia sistémica del mecanismo de captura. El patrón también existe en productos con WAC>0 nunca corregidos (SKU 84, 28, 52, 63, 39, 70, 71, 48…, todos ratio 1.00x), es decir, es la **convención de captura de la tienda**, no un incidente puntual.

Los 5 items con costo económicamente plausible e independiente del precio (único grupo C2 genuino) provienen de la importación — «las 5 con dinero»: SKU 100 (35 vs precio 50 CUP, 0.70x), SKU 25 (12 000 vs 25 USD ≈ 17 000 CUP, 0.71x), SKU 75 (500 vs 1 000, 0.50x), SKU 76 (1 000 vs 1 500, 0.67x), SKU 30 (25 vs 150, 0.17x — posible error de digitación, p. ej. 250). Ninguno tiene documento respaldado cargado en el sistema, por lo que su procedencia sigue siendo no verificable (C2), aunque su coherencia costo<precio los distingue del resto.

---

## 6. Los 13 SKU pendientes (tabla completa)

| SKU | Producto | Precio | Recepción origen | uc registrado | Moneda×tasa | Costo CUP | Clasificación |
|---|---|---|---|---:|---|---:|---|
| 9 | Brecker D63 A | 25 USD | FAC-VITALLCONS-001 | 25.0 | USD×680 | 17 000 | C6 (uc == precio) |
| 21 | Colchón Milexus | 220 USD | FAC-VITALLCONS-001 | 220.0 | USD×680 | 149 600 | C6 |
| 24 | Cuchilla 2P 63A | 18 USD | FAC-VITALLCONS-001 | 18.0 | USD×680 | 12 240 | C6 |
| 44 | Losa aporcelanada 60x60 c/ defectos | 0 (sin precio) | INV-INIT-2026-08-10 | 5 040 | CUP×1 | 5 040 | C2/C5 (sin referencia comparable) |
| 80 | Brecker C32A Doble | 5 USD | FAC-VITALLCONS-001 | 5.0 | USD×680 | 3 400 | C6 |
| 82 | Crimpiadora c/ pela cable Anaranjada | 200 USD | FAC-VITALLCONS-001 | 200.0 | USD×680 | 136 000 | C6 |
| 83 | Crimpiadora Roja c/ 6 dabas rojas | 180 USD | FAC-VITALLCONS-001 | 180.0 | USD×680 | 122 400 | C6 |
| 85 | Panel 585 | 380 USD | FAC-VITALLCONS-001 | 380.0 | USD×680 | 258 400 | C6 |
| 86 | Panel + 600W | 330 USD | FAC-VITALLCONS-001 | 370.0 | USD×680 | 251 600 | C6 (desviación 12 %, único caso) |
| 111 | Grapas plásticas c/ clavo de acero | 2 500 USD | FAC-VITALLCONS-001 | 2 500.0 | USD×680 | 1 700 000 | C6 |
| 117 | Inversor | 3 200 USD | FAC-VITALLCONS-001 | 3 200.0 | USD×680 | 2 176 000 | C6 |
| 118 | Barilla de Tierra | 80 USD | FAC-VITALLCONS-001 | 80.0 | USD×680 | 54 400 | C6 |
| 122 | Controladores de voltaje | 35 USD | INV-INIT-ELEC-2026-08-10 | 23 800 | CUP×1 | 23 800 = 35×680 | C4+C6 |

Contexto operativo: los 13 tienen historial de ventas (SKU 86: 21 ventas; 122: 7; 9: 6; 85: 4; 118: 3; etc.) — por eso sus flags DF-02 (`w62_zero_cost_flags`) siguen siendo operativamente relevantes mientras su WAC sea 0.

**Interpretación forense:** en los 11 casos de la FAC, el usuario tecleó en el campo de costo **el número del precio de venta en USD** y seleccionó (o el formulario traía) moneda USD con tasa 680. El costo resultante en CUP es 680× el precio — si se hubiera aceptado, el margen de esos productos sería negativo (-67 900 %). En el SKU 122 el mismo patrón aparece ya pre-convertido (23 800 = 35×680) en la recepción de inventario inicial. En el SKU 44 no hay precio con el que contrastar y el origen del 5 040 es desconocido.

---

## 7. Los 14 ceros legítimos (confirmación)

SKUs **7, 10, 23, 41, 53, 54, 58, 60, 78, 91, 93, 101, 105, 114**: verificado en live que cada uno tiene **0 movimientos de inventario y 0 items de recepción** (query por producto, no agregada). No existe recepción histórica oculta: la tienda tiene exactamente 47 recepciones (1 + 3 + 43) y sus 153 items fueron cruzados íntegramente contra los 157 productos. Su `cost_average = 0` no es un dato perdido: es la ausencia original de costo. **Permanecen intactos.**

---

## 8. Los 44 corregidos en TAREA 2 — recalificación (FASE 11/17)

La TAREA 2 clasificó 44 SKU como `COSTO_REAL_RECUPERABLE` y reconstruyó su WAC desde los recibos. La evidencia nueva obliga a **recalificar el contenido económico, no la ejecución técnica**:

| Subgrupo TAREA 2 | Clasificación TAREA 2 | Recalificación 2C | WAC vigente |
|---|---|---|---|
| 32 SKU con costo CUP ≠ 1 | COSTO_REAL_RECUPERABLE | **C6 — precio de venta registrado como costo** (uc == price exacto, 32/32) | = precio de venta |
| 12 SKU con uc = 1 en recibo | COSTO_REAL_RECUPERABLE | **C3 — nominal/fallback** | 1 CUP |
| (+2 correcciones GATE 16: SKU 48 → 250, SKU 112 → 1) | COSTO_REAL_RECUPERABLE / JUSTIFICADO | C6 y C3 respectivamente (mismos patrones) | 250 / 1 |

- ¿Las escrituras fueron correctas? **Sí**: mecanismo gobernado, `wac_change_log`, stock intacto, 157/157 reconciliado — nada de eso cambia.
- ¿Eran "costos reales demostrados"? **No**: eran (y son) costos **registrados pero no económicamente demostrados**. El WAC vigente de esos 32 productos es numéricamente su precio de venta.
- ¿Se revierten? **No se recomienda revertir**: el valor registrado es exactamente lo que la factura interna de la tienda declara, y volver a 0 restauraría el problema original (bloqueos DF-02). Se recomienda **reclasificar en la documentación** (este informe lo hace) y tratar su COGS en TAREA 3 con criterio de margen ≈ 0.

### 8-bis. Hallazgo nuevo: 4 productos con WAC vigente inflado 680x (fuera de los 71)

La auditoría de la muestra WAC>0 (FASE 4) detectó distorsiones **mayores** que las de los 13 pendientes, en productos que no estaban en el alcance de TAREA 2:

| SKU | Producto | WAC actual | Precio | Patrón |
|---|---|---:|---:|---|
| 67 | Transfer monofásico | 30 600 | 45 USD | WAC = 45×680 |
| 68 | Transfer trifásico | 44 200 | 65 USD | WAC = 65×680 |
| 107 | Caja de distribución TRIC | 17 000 | 25 USD | WAC = 25×680 |
| 121 | Supresores | 20 400 | 30 USD | WAC = 30×680 |

Estos WAC provienen de la era pre-log (sin `wac_change_log`): su movimiento `purchase` cargó `unit_cost` del recibo USD×680 y algún escritor antiguo lo fijó. Además, dos anomalías de dilución: SKU 90 Cable Solar Rojo 6mm (WAC 0.7519 = mezcla de 3 400 con recepción nominal 1) y SKU 999 Servicio de crimpiar (WAC 443.83). **No se modificó nada** — quedan documentados para decisión posterior (mismo tratamiento contable que eventualmente se defina para los 13, o corrección gobernada dedicada).

---

## 9. Impacto sobre COGS (solo análisis, 0 modificaciones)

No se tocó ninguna tabla de COGS (`transactions`, `sale_items`, `cost_at_sale`). Los riesgos que esta auditoría deja documentados para TAREA 3:

1. **COGS calculado con WAC = precio de venta** → margen ≈ 0 sistemático en los 32+ productos C6 y en todos los productos con patrón 1.00x pre-log (la utilidad histórica reportada por CostPro para ENERVIDA es, en ese segmento, una tautología).
2. **COGS inflado 680x** en las ventas históricas de SKU 67, 68, 107, 121 (y parcialmente 90/999): sus `cost_at_sale` se escribieron con WAC distorsionado — p. ej. SKU 107 muestra ventas con `unit_cost` 17 000 (movimientos 08-01→08-13) contra precio 25 USD.
3. **COGS = 0** en las ventas de los 13 pendientes y de los productos hoy a WAC=1 nominal (subestimación de costo).
4. **No existe reconstrucción temporal confiable** con los datos actuales: la única fuente de costo ("factura" interna) es el precio mismo.

Cualquier re-costeo de COGS sin resolver primero la procedencia multiplicaría el error en lugar de corregirlo.

---

## 10. Recomendación para TAREA 3

Antes de recalcular cualquier COGS:

1. **Cerrar primero la decisión de los 13** (TAREA 2B) — no puede reconstruirse COGS con productos en WAC=0.
2. **Definir una política de costo por clase**, no por producto: (a) clase C6 — decidir si el "costo declarado" de la tienda es aceptable como base contable o se aplica un coeficiente de margen histórico declarado por el usuario; (b) clase C3 — mantener 1 CUP nominal explícito; (c) clase C2/C4 — requerir documento externo.
3. **Inventario exacto de `cost_at_sale = 0`** y de ventas con `cost_at_sale` inflado (SKU 67/68/107/121), con relación venta → SKU → fecha → cantidad → WAC vigente **en la fecha** (reconstrucción temporal, no WAC actual).
4. **Pedir al usuario la documentación externa** (facturas de proveedor reales) para los productos donde exista — es la única vía de elevar C2/C5 → C1.
5. **Simulación completa sin escritura** con propuesta contable y gate de decisión humana antes de cualquier corrección trazable.

---

## 16-bis. Recomendación por SKU (los 13) — no ejecutada en esta tarea

| SKU | Recomendación | Justificación breve |
|---|---|---|
| 9, 21, 24, 80, 82, 83, 85, 86, 111, 117, 118 | **B — 1 CUP nominal** | Patrón C6/C4 demostrado; reconstrucción (C) imposible sin documento externo; mantener 0 (A) mantiene el bloqueo DF-02 sobre ventas activas |
| 44 | **B — 1 CUP nominal** (o D si aparece factura) | Sin precio ni referencia; stock 0; el 5 040 registrado es de origen desconocido y no debe tomarse como costo |
| 122 | **B — 1 CUP nominal** | C4 demostrado (23 800 = 35×680); 7 ventas históricas dependen del flag DF-02 |

Esta tabla es una **recomendación** (FASE 16). La decisión de ejecución fue autorizada explícitamente por el propietario en el mandato de TAREA 2B, que se ejecuta como tarea separada con su propio snapshot, escritura gobernada y PR.

---

## Procedencia temporal de los datos (FASE 9/10)

| Momento (UTC) | Evento | Mecanismo | Evidencia |
|---|---|---|---|
| 2026-07-01 (retrofecha) | Factura interna de inventario (101 items) | recepción del usuario, retrofechada | `FAC-VITALLCONS-001`, `created_at` 2026-08-11 22:49, sin `audit_logs` |
| 2026-08-10 (retrofecha) | Inventario inicial (9 items, 3 recibos) | RPC `register_reception` (registrados 2026-08-18 03:58–04:03, admin@demo.com) | `audit_logs` 3 eventos; costos = precioUSD×680 en 6 items |
| 2026-08-11 22:49 | Alta masiva de productos/precios | UI / script (commit `5a86d52` solo trae migraciones) | `products.created_at` |
| 2026-08-17 04:00 | Corte de datos pre-importación | — | `ENERVIDA-EXCEL-IMPORT.md` §3 |
| 2026-09-09 | REM-F4-04: `register_reception` pasa a escribir WAC | migración `20260909000000` | documentación de defecto raíz |
| 2026-10-04 04:52–05:15 | Importación Excel (43 recepciones, 280 ventas, 125 VS, cuadres…) | RPCs oficiales, admin@demo.com | `audit_logs` 43 `REGISTER_RECEPTION`; commits `5a86d52`, `7a2ff90`, PR #1355 |
| 2026-10-04 04:52 | Primer registro de `wac_change_log` | era post-log comienza | live |
| 2026-10-05/06 | GATE 16 (26 ops) + TAREA 2 (44 correcciones WAC) | escritura gobernada | PR #1370 (`a4ebe9b`, merge `1be925c`), docs `ENERVIDA-WAC-ZERO-COST.md` |
| 2026-10-07 | **TAREA 2C (esta auditoría, 0 escrituras)** | Management API solo lectura | esta evidencia |

---

## Condición de cierre

```text
0 escrituras de datos                      ✓ (solo SELECT vía Management API)
0 movimientos creados                      ✓
0 históricos modificados                   ✓
0 WAC modificados durante esta tarea       ✓
0 COGS / cost_at_sale modificados          ✓
0 otras tiendas modificadas                ✓ (1 query comparativa de solo conteo, sin detalle)
```

**READ-ONLY AUDIT COMPLETE.** La respuesta contable queda documentada: la procedencia de los costos es el propio precio de venta (C6, 51 %), la convención nominal 1 CUP (C3, 38,6 %), incoherencia USD×680 (C4, 3,9 %) y registros no verificables (C2, 6,5 %). Ningún costo de ENERVIDA puede hoy afirmarse "costo económico real documentado" (C1 = 0). Esta base evidencial precede y condiciona la ejecución de TAREA 2B y el diseño de TAREA 3.
