# INFORME DE RECTIFICACIÓN — SKU 111 y SKU 112
## CP-FIN-VALUATION-CORRECTION-002 · Error de interpretación de precios de venta como costos USD
### Recepción FAC-VITALLCONS-001 (fd9d6c88-5db8-49ea-b185-8bc96cc93e63) · ENERVIDA-VITALLCONS · Vitallcons

**Fecha del informe:** 2026-11-15
**Misión anterior relacionada:** CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 (Fase VI — recorrido del 192M)
**Alcance:** análisis y demostración read-only sobre producción + prototipo E2E aislado. **Producción INTACTA.**

---

## 1. Resumen ejecutivo

La aclaración económica del propietario (2026-11-15) rectifica la interpretación de dos líneas de
FAC-VITALLCONS-001: los valores **2.500 (SKU 111)** y **1.000 (SKU 112)** eran **precios de venta
en CUP**, no costos de adquisición en USD. El costo real de adquisición de ambos productos era
**1 CUP por unidad**.

Esta rectificación reduce el valor económico de la recepción de **192.039.436,00 CUP** a
**40.739.585,00 CUP** (recomputo independiente confirmado al céntimo por dos vías), y materializa
un **exceso de reconocimiento de 151.299.851 CUP** que permanece íntegro en el saldo de
ACT_INVENTARIO y que debe revertirse contra PAS_CXP_PROV (la deuda reconocida al proveedor por
esas dos líneas era 151.300.000 CUP; el costo real conjunto es 149 CUP).

La evidencia del sistema corrobora de forma independiente la declaración del propietario
(§3). El prototipo de rectificación ejecutado en la BD E2E aislada demuestra el procedimiento
canónico completo con todas las validaciones PASS (§8). **Ningún dato de producción fue modificado.**

| Concepto | SKU 111 | SKU 112 | Conjunto |
|---|---|---|---|
| Producto | Grapas plásticas con clavo de acero | Grapas metálicas 3/4 con tornillo roscante | — |
| Cantidad recibida | 49 u | 100 u | 149 u |
| Valor atribuido antes (defectuoso) | 83.300.000,00 CUP | 68.000.000,00 CUP | 151.300.000,00 CUP |
| Valor correcto (49×1 · 100×1) | 49,00 CUP | 100,00 CUP | 149,00 CUP |
| **Exceso a revertir** | **83.299.951,00 CUP** | **67.999.900,00 CUP** | **151.299.851,00 CUP** |

**La diferencia de 151.299.851 CUP queda clasificada como clasificación errónea del precio de
venta y de la moneda (defecto de importación), NO como pérdida económica confirmada.**

---

## 2. Declaración del propietario (fuente de la rectificación)

1. Los valores 2.500 (SKU 111) y 1.000 (SKU 112) son **precios de venta en CUP**, no costos de
   adquisición en USD.
2. El costo de adquisición correcto para ambos productos en la recepción era **1 CUP por unidad**.
3. No deben multiplicarse por la tasa 680.
4. La aprobación de la tasa 680 **se mantiene** para las demás líneas USD auténticas.
5. La diferencia de 151.299.851 CUP debe investigarse como **clasificación errónea**, no como
   pérdida confirmada.

---

## 3. Corroboración independiente (sistema de evidencias)

La declaración del propietario no era necesaria para sospechar del defecto: el propio sistema ya
lo documentaba. Cinco evidencias independientes convergen:

| # | Evidencia | Detalle |
|---|---|---|
| 1 | **GATE16 (2026-10-06, wac_change_log SKU 112)** | `evidence: "SIN costo real recuperable fiable: receipt_items(receipt fd9d6c88) unit_cost=1000 USD/ud (contradice precio venta 1000 CUP); stock_movements purchase unit_cost=680000 (escala contradictoria)"` → el propio expediente previo ya señalaba que 1.000 era el **precio de venta**. |
| 2 | **Auditoría de precios (audit_logs)** | SKU 111: precio 2.500 (el 2026-10-16 aún `price_currency: USD`); el **2026-10-22 18:46 se corrige la moneda USD→CUP** (confirmando la naturaleza CUP del 2.500); 18:47 se reprecia 2.500→2.000 CUP. La línea `unit_cost=2500` coincide con el **precio de venta histórico**. SKU 112: precio 1.000 (hoy `price_currency USD` — moneda del maestro también afectada). |
| 3 | **Maestro de productos: `cost_price = 0` en las 101/101 líneas** | El campo de costo del maestro nunca fue poblado por la importación legacy: `receipt_items.unit_cost` no pudo provenir de `products.cost_price`. |
| 4 | **Patrón de importación: 74/101 líneas con `unit_cost == products.price` EXACTO** | (incluye decimales: Cable solar 4mm = 4,5). La importación del 2026-08-11 pobló los costos de recepción desde el campo de **precio de venta** (o ambos desde la misma columna origen del legado). |
| 5 | **Kardex y WAC** | `cost_average = 1` CUP en ambos SKU (fijado nominalmente por GATE16/TAREA-2B ante la ausencia de costo recuperable): **coincide exactamente con el costo real ahora declarado**. Las salidas posteriores ya se costearon a 0-1 CUP. |

**PR-2 backups:** la reconstrucción desde backups PR-2 no es posible para esta recepción: la FVC
fue creada el **2026-08-11T22:49:18Z**, POSTERIOR al backup del 2026-08-09/10 (29 recepciones de
otras tiendas; **0 líneas** de SKU 111/112). Fuentes de reconstrucción utilizadas en su lugar:
`receipt_items` vigentes + movimientos históricos + auditoría (hashes SHA-256 de cada sección en
EVIDENCIA_RECTIFICACION_SKU111_112.json).

---

## 4. Recálculo del impacto de los dos productos

- SKU 111: 49 u × 2.500 (USD) × 680 = **83.300.000 CUP** → correcto: 49 u × 1 CUP = **49 CUP**. Exceso: 83.299.951 CUP.
- SKU 112: 100 u × 1.000 (USD) × 680 = **68.000.000 CUP** → correcto: 100 u × 1 CUP = **100 CUP**. Exceso: 67.999.900 CUP.
- **Exceso conjunto: 151.299.851 CUP** (83.299.951 + 67.999.900).

Mecánica del defecto (una sola conversión, valor fuente erróneo):

```
precio de venta CUP (2.500 / 1.000)  ──leído como──▶  unit_cost "USD"
      └── × 680 (UNA vez) ──▶ movimiento compra (1.700.000 / 680.000 CUP)
                                   └──▶ asiento reconocimiento (Σ q·uc·tasa = 192.039.436)
```

**Sin doble conversión** (verificado §6): 2 líneas de recepción de estos SKU en toda la BD
(únicamente las de la FVC); 0 en backups PR-2; una conversión en movimiento y una recomputación
en asiento; salidas posteriores a 0-1 CUP sin factor 680.

---

## 5. Revisión del total de la recepción

**Total corregido: 40.739.585,00 CUP**, reconstruido por dos vías independientes que coinciden al
céntimo (y con la cifra preliminar comunicada por el propietario):

| Componente | Importe |
|---|---|
| 79 líneas CUP (tasa 1) | 5.129.706,00 CUP |
| 20 líneas USD auténticas (52.367,25 USD × 680) | 35.609.730,00 CUP |
| SKU 111 corregida (49 × 1 CUP) | 49,00 CUP |
| SKU 112 corregida (100 × 1 CUP) | 100,00 CUP |
| **TOTAL CORREGIDO** | **40.739.585,00 CUP** |

Verificación cruzada: recomputo línea a línea desde `receipt_items` (fase A) = **40.739.585,00**.
Delta vs total actual: 192.039.436,00 − 40.739.585,00 = **151.299.851,00 CUP** = exceso conjunto.

Detalle completo: `RECONCILIACION_NUEVO_TOTAL_FAC-VITALLCONS-001.xlsx`.

---

## 6. Reconstrucción histórica de los dos SKU (resumen)

Reconstrucción cronológica completa (21 movimientos, costos WAC recalculados al costo real):
`RECONSTRUCCION_CRONOLOGICA_SKU111_112.xlsx`.

### SKU 111 — Grapas plásticas con clavo de acero
- **Recepción de origen:** FAC-VITALLCONS-001 (económica 2026-07-01; creación real 2026-08-11).
- **Precio de venta original:** 2.500 CUP (declarado; corroborado por auditoría de precios).
- **Costo real de adquisición:** 1 CUP/u. **WAC antes: 0** (existencia inicial 0 — kardex inicia
  con esta recepción) · **WAC después: 1 CUP** · **WAC vigente registrado: 1 CUP** (coincide).
- Entradas: 49 u. Salidas: 4 ventas + 34 vales (VS-000139/148/158/208) + 1 ajuste = **39 u**.
  Saldo final: **10 u** = `stock_current` = `inventory.quantity` (conciliado).
- **COGS de ventas al costo correcto: 4 CUP** (4 u × 1) — el motor CP-FIN ya atribuía exactamente
  4 CUP (m033). En kardex, 2 movimientos de venta con uc=0 registraron 2 CUP → subvaluación de
  kardex: 2 CUP.
- Vales/ajustes: correcto 35 CUP (35 u) vs 33 CUP registrado.
- **Valor contable actual asociado: 10 CUP** (10 u × WAC 1) — ya correcto, sin ajuste.

### SKU 112 — Grapas metálicas 3/4 con tornillo roscante
- **Recepción de origen:** FAC-VITALLCONS-001. **Precio de venta original:** 1.000 CUP
  (declarado; GATE16 lo documentó como contradicción). **Costo real:** 1 CUP/u.
- **WAC antes: 0 · después: 1 · vigente registrado: 1** (coincide).
- Entradas: 100 u (+1 reingreso por reversión de vale VS-000223). Salidas: 3 ventas + 61 vales
  (VS-000037/138/157/165/208/223/225) + 17 ajustes = **81 u**. Saldo final: **20 u** (conciliado).
- **COGS de ventas al costo correcto: 3 CUP** — motor CP-FIN ya atribuía 3 CUP. Kardex: 3 CUP
  registrados (venta uc=1) ✓.
- Vales/ajustes: correcto 78 CUP vs 56 CUP registrado → subvaluación 22 CUP (uc=0).
- **Valor contable actual asociado: 20 CUP** — ya correcto, sin ajuste.

**Consolidado de salidas al costo correcto (1 CUP/u):** 7 u vendidas → 7 CUP COGS; 95 u en vales
+ 18 u en ajustes → 113 CUP; 1 u reingresada → 1 CUP. Registrado en kardex: 5 + 89 CUP.
**Subvaluación total de salidas: 26 CUP** (2 COGS + 24 vales/ajustes; 26 unidades con uc=0).

---

## 7. Descomposición del exceso (151.299.851 CUP)

El exceso NO se reparte entre resultado e inventario: **permanece íntegro en el saldo de
ACT_INVENTARIO** porque las salidas nunca se costearon a la valoración 680 (se costearon a 0-1 CUP,
que es el costo real). Descomposición exigida por §6 de la misión:

| Destino | Importe | Explicación |
|---|---|---|
| **Inventario remanente** (30 u: 10+20) | **0 CUP de ajuste** | El valor contable vigente (WAC 1 × 30 u = 30 CUP) YA coincide con el costo real. La porción del exceso atribuible al remanente se elimina con la reversión del asiento. |
| **COGS de ventas anteriores** (7 u) | **0 CUP de ajuste del motor** | El motor CP-FIN ya reconoció 7 CUP a costo real (4+3). Kardex-level: 2 CUP subvaluados (ventas uc=0) — corregibles con la revalorización de salidas. |
| **Otras salidas** (vales/ajustes, 113 u) | **24 CUP subvaluados** | Unidades a uc=0 en lugar de 1 CUP — corregibles con la revalorización de salidas. |
| **PAS_CXP_PROV** | **−151.299.851 CUP** | La deuda reconocida al proveedor por estas 2 líneas era 151.300.000 CUP; el costo real conjunto es 149 CUP. Contrapartida económica correcta de la reversión. |

La reversión se compone de dos asientos (ver PROPUESTA_RECTIFICACION_CP_FIN_WAC.md):
1. **Rectificación del reconocimiento:** débito PAS_CXP_PROV 151.299.851 / crédito ACT_INVENTARIO
   151.299.851 (asiento compensatorio enlazado por `reversal_of`, referencia explícita a
   FAC-VITALLCONS-001).
2. **Revalorización de salidas subvaluadas:** débito GAS_COSTO_VENTAS 2 + débito GAS_VALES 24 /
   crédito ACT_INVENTARIO 26 (26 unidades × 1 CUP).

Tras ambos asientos, el mayor cuadra exactamente con el kardex: neto ACT_INVENTARIO de estos SKU =
**30 CUP = valor en libros** (demostrado en E2E §8). No se utiliza cuenta de patrimonio como
ajuste ficticio: la contrapartida es la corrección del pasivo real con el proveedor.

---

## 8. Revisión de alcance — los otros 99 productos de la recepción

**El mismo defecto de importación es sistémico en la recepción** (evidencia §3): 74/101 líneas
tienen `unit_cost == products.price` exacto y 101/101 tienen `cost_price = 0`. PERO, conforme a la
regla del propietario («no generalices el costo de 1 CUP a todos los productos sin respaldo»), la
clasificación es línea a línea (MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx):

| Clasificación | Líneas | Observaciones |
|---|---|---|
| Costo de adquisición documentado | **0** | Ninguna línea tiene respaldo documental independiente (PR-2 no cubre la FVC). |
| Costo de adquisición confirmado por el propietario | **18** | Costos 1 CUP con moneda consistente — decisión previa del propietario (costos bajos 1 CUP/1 USD auténticos). |
| Precio de venta importado erróneamente como costo | **2** | **SKU 111 y 112 — confirmados por el propietario el 2026-11-15.** |
| Moneda asignada incorrectamente | **4** | SKU 90 (5 USD línea vs precio 5 CUP — patrón 111), 92, 999, 120 (costos 1 CUP con producto en USD). |
| Costo no verificable | **71** | `unit_cost == products.price` exacto — indistinguible precio/costo; **requiere decisión del propietario línea a línea**. Valor conjunto: 24.510.805 CUP (de los cuales 16 líneas USD ≈ 21,0M CUP a tasa 680). |
| Sin problema detectado | **6** | SKU 17, 47, 113 (CUP) y 86, 118, 119 (USD): costo ≠ precio, moneda consistente. SKU 86: costo 370 USD > precio 330 USD (margen negativo — observación para el propietario). |

Los costos de 1 CUP (18 líneas) y los costos USD de las 20 líneas auténticas **se conservan**
conforme a las decisiones vigentes del propietario (tasa 680 aprobada para USD auténticos).

---

## 9. Validación E2E aislada (prototipo del procedimiento)

Prototipo completo ejecutado en la BD E2E aislada (lguovmvrozxgssupkwpf; sentinela
`e2e_is_isolated_db()=true`), con réplica fiel del estado de producción de ambos SKU (recepción
defectuosa, 21 movimientos del kardex, asientos históricos) y aplicación del procedimiento
canónico en **transacción atómica** vía pooler IPv4 con escape hatch gobernado
(`SET LOCAL app.allow_receipt_item_edit='on'`, trigger M021 de inmutabilidad).

**Resultado: TODAS LAS PRUEBAS PASS** (EVIDENCIA_E2E_AISLADA.json):

| Prueba | Resultado |
|---|---|
| V1 Conservación de precios de venta | PASS — SKU 111: 2.000 CUP; SKU 112: 1.000 (USD del maestro) — intactos antes/después |
| V2 Costos unitarios 1 CUP | PASS — 2 líneas: uc=1, moneda CUP, tasa 1 |
| V3 Valoración correcta de la recepción | PASS — total réplica 149 CUP (producción: 40.739.585) |
| V4 WAC cronológico correcto | PASS — WAC 1 constante; existencias 10/20; cost_average 1 |
| V5 COGS correcto en salidas posteriores | PASS — ventas −7 CUP; vales/ajustes −113 CUP |
| V6 Balance financiero equilibrado | PASS — cada asiento D=C; neto ACT_INVENTARIO = 30 CUP = valor en libros; neto PAS_CXP_PROV = 149 CUP (costo real) |
| V7 Trazabilidad | PASS — `reversal_of` → asiento original; referencia explícita al documento; auditoría por fila |
| V8 Idempotencia | PASS — segunda pasada: 0 cambios en ítems/cabecera/movimientos/asientos/WAC |
| V9 Reversión controlada | PASS — rollback restaura el estado «antes» byte a byte (asiento testigo) |
| V10 Sin duplicación | PASS — 21 movimientos y 11 líneas contables exactas tras re-aplicar |
| Higiene | PASS — net delta = 0 (cero residuos en las 11 tablas) |

Hallazgo técnico adicional del prototipo: el trigger `sync_product_stock()` resuelve el «último
movimiento» con `ORDER BY movement_date DESC, created_at DESC LIMIT 1` — con marcas de tiempo
empatadas (importaciones legacy) el resultado es **no determinista**. En la réplica se desempató
`created_at` (±minutos) para reproducir los valores materializados de producción (10/20).
Recomendado para backlog: clave de ordenación estable (p. ej. `id`) o índice de secuencia.

---

## 10. Restricciones cumplidas (fase actual)

- ✅ No se modificó FAC-VITALLCONS-001 en producción (solo lectura: GET/SELECT + hashes).
- ✅ No se actualizó `receipt_items`, ni precios de venta, ni costos/WAC, ni `stock_movements`,
  ni asientos, ni otros productos, ni backfills.
- ✅ Las pruebas de rectificación se ejecutaron **exclusivamente** en la BD E2E aislada.
- ✅ Producción verificada intacta tras la misión (conteos y valores re-verificados).

## 11. Criterio de éxito (§10 de la misión)

1. **Demostrado** que 2.500 y 1.000 eran precios de venta (CUP), no costos USD: corroboración
   quíntuple (GATE16, auditoría de precios con corrección de moneda, cost_price=0, patrón
   uc==precio 74/101, WAC=1 preexistente) + declaración del propietario.
2. **Demostrado** que el costo real de ambos era 1 CUP/unidad: declaración del propietario,
   coherente con el WAC nominal 1 CUP ya vigente y con las salidas ya costeadas a 0-1 CUP.
3. **Cuantificada** la repercusión exacta: recepción (−151.299.851 CUP → 40.739.585), inventario
   (remanente sin ajuste: 30 CUP correctos), WAC (1 CUP, sin recálculo material), COGS (7 CUP
   correctos en motor; +2 CUP kardex), estados financieros (reversión PAS_CXP_PROV/ACT_INVENTARIO
   151.299.851 + revalorización de salidas 26 CUP) — todo demostrado en E2E con balance exacto.

**La rectificación de producción es etapa posterior y requerirá revisión del propietario de los
importes finales y del procedimiento completo** (ver DECISIONES_PROPETARIO_PENDIENTES.md).

---

## 12. Entregables de la misión

1. `INFORME_RECTIFICACION_SKU111_112.md` (este documento)
2. `RECONSTRUCCION_CRONOLOGICA_SKU111_112.xlsx` — kardex completo de ambos SKU
3. `MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx` — 101 líneas clasificadas (6 categorías)
4. `RECONCILIACION_NUEVO_TOTAL_FAC-VITALLCONS-001.xlsx` — reconciliación 192.039.436 → 40.739.585
5. `PROPUESTA_RECTIFICACION_CP_FIN_WAC.md` — procedimiento canónico
6. `EVIDENCIA_E2E_AISLADA.json` — evidencia del prototipo (todas las pruebas PASS)
7. `consultas_sql_independientes_RECTIFICACION.sql` — SQL reproducible
8. `EVIDENCIA_RECTIFICACION_SKU111_112.json` — evidencia reproducible (fases A-E, hashes)
9. `MANIFIESTO_SHA256_RECTIFICACION.txt`
10. `DECISIONES_PROPETARIO_PENDIENTES.md`
