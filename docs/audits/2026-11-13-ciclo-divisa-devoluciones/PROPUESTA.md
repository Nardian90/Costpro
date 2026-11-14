# PROPUESTA TÉCNICA — Ciclo económico completo de la venta en divisa: devoluciones, reembolsos y anulación

**Rama:** `fix/ciclo-divisa-devoluciones-20261113` (base: `fix/semantica-ventas-usd-20261114`, PR #1615)
**Migración:** `20261114140000_cp_fin_ciclo_devolucion_divisa.sql`
**Validación:** `scripts/validar-ciclo-divisa-devoluciones.mjs` — PASS TOTAL 37/37 + NET DELTA 0 en BD E2E aislada (`lguovmvrozxgssupkwpf`), evidencia en `docs/audits/2026-11-13-ciclo-divisa-devoluciones/validacion-bd-aislada.txt`
**Dependencia:** PR #1615 (contiene sus commits; el #1616 apila sobre él — fusionar #1615 primero, o fusionar #1616 que ya lo incluye).

---

## 1. Problema (petición del propietario, apartado 1 de la misión final)

El PR #1615 corrigió la semántica de `fin_compute_metrics('VENTA')` (total_amount ya es CUP-equivalente) pero su propia validación reconoció dos limitaciones:

- **C7**: devoluciones en USD siguen produciendo `ERR_UNBALANCED`.
- **C5**: ventas con pago parcial, pendientes de política de Cuentas por Cobrar.

La investigación de esta fase encontró **dos defectos reales** en el ciclo de devolución en divisa:

### Defecto (a) — Doble conversión en las métricas de DEVOLUCION_VENTA

`fin_compute_metrics('DEVOLUCION_VENTA')` computaba `total_cup := total_amount × tasa` cuando la devolución estaba marcada en divisa. Pero **`devolutions.total_amount` ya es el total canónico CUP**: `create_devolution_v2` lo construye como `Σ cantidad × price_at_sale_cup` (precio CUP de la venta original ponderado por cantidad) y el campo `currency` queda siempre 'CUP'. Multiplicar por la tasa inflaba el total (demostración sintética C7′: débitos 25.432.000 vs créditos 37.400 — ×930 sobre 37.400 canónicos).

### Defecto (b) — Deriva de céntimos en la fila del reembolso USD (vía REAL, no sintética)

`create_devolution_v2` derivaba el importe físico del reembolso USD como `round(total_canónico / tasa_histórica, 2)`. La columna GENERADA `amount_cup = amount × exchange_rate` dejaba de coincidir con el total canónico (p. ej. 100.000 CUP / 930 = 107,5268… → redondeado 107,53 USD → 107,53 × 930 = 100.002,90 ≠ 100.000). El asiento de DEVOLUCION_VENTA caía en `ERR_UNBALANCED` con débitos 100.800,00 vs créditos 100.802,90 (deriva de 2,90 CUP + par de costo). Esto rompía la invariante **documentada por el propio RPC**: «amount = canónico / tasa para USD ⇒ amount_cup generado conserva el total canónico».

## 2. Corrección (4 cambios anclados)

| # | Función | Cambio |
|---|---------|--------|
| M1 | `fin_compute_metrics` | `DEVOLUCION_VENTA.total_cup := total_amount` (canónico CUP; sin ×tasa). Igual que el fix de VENTA del PR #1615. |
| M2 | `fin_compute_metrics` | `store_credit_cup := Σ store_credit_ledger.amount` (canónico CUP; antes `amount × tasa` si el doc estaba en divisa). |
| M3 | `create_devolution_v2` | Fila de reembolso USD simple con **tasa EFECTIVA exacta** `v_total / v_refund_amount` ⇒ `amount_cup = v_total` exacto. El importe físico sigue en céntimos USD reales; la tasa histórica de la venta permanece en `v_rate_sale` y en `audit_logs` (`rate_sale`). |
| M4 | `create_devolution_v2` | Componente USD del reembolso AS_PAID con tasa efectiva `(v_total − v_comp_cup) / v_comp_usd` (misma invariante para reembolsos multi-moneda). |

**Sin cambios deliberados:**
- Reglas (`fin_rule_versions`): plantilla DEVOLUCION_VENTA v1 intacta — solo cambia el VALOR de las métricas (mismo criterio que el PR #1615).
- Rama VENTA de las métricas (la del PR #1615): intacta.
- Topes por moneda, chequeos físicos de caja, validación AS_PAID y store_credit del RPC: intactos — solo cambia la precisión de la tasa de la fila insertada.
- `direction='refund'/'recovery'` ya exentos de PT001/PT006 (trigger vigente 20261024400000): la tasa efectiva no rompe invariantes de pago.
- **La migración NO reescribe filas históricas** de reembolso: corrige la creación going-forward. La D1 pre-fix conserva su error documentado en la validación — hoy producción tiene **0 devoluciones USD** (las 2 reales son CUP canónicas exactas), por lo que no existe deriva histórica real que corregir.

## 3. Escenarios validados (los 9 pedidos + extras) — BD E2E aislada, vía RPC REAL

| Escenario | Resultado |
|---|---|
| Venta USD completamente cobrada en USD (tasa 930 no divisible) | PASS — asiento D ACT_BANCOS 100.000 / C ING_VENTAS 100.000 + COGS 800, `currency_origin=USD` |
| Venta USD cobrada en CUP | PASS |
| Venta USD con pago mixto (zelle USD + cash CUP) | PASS |
| **Venta USD con devolución TOTAL** (post-fix, tasa no divisible) | PASS — D ING_DEVOLUCIONES 100.000 / C ACT_BANCOS 100.000 + par de costo; fila de reembolso amount=107,53 USD, amount_cup=100.000 exacto |
| **Venta USD con devolución PARCIAL** (1 producto de 2) | PASS — solo el costo del producto devuelto (500, cost_at_sale original) |
| **Anulación y reversión** (`fin_post_annulment_safe`) | PASS — asiento espejo con sentidos invertidos e importes idénticos; idempotente (2ª llamada no añade); asiento de la venta intacto |
| **Venta CUP con devolución CUP** | PASS — sin regresión |
| **Conservación del costo del producto devuelto** | PASS — usa `cost_at_sale` ORIGINAL de la venta (400×2=800), NO `cost_average` (999) |
| **Ausencia de doble reconocimiento** | PASS — re-publicar venta/devolución no duplica; 1 solo movimiento ING_VENTAS por venta |
| (extra) Devolución AS_PAID multi-moneda | PASS — C ACT_EFECTIVO_CUP 20.000 + C ACT_EFECTIVO_USD 80.000 / D ING_DEVOLUCIONES 100.000 |
| (extra) Defecto (a) sintético pre-fix | PASS — ERR_UNBALANCED 25.432.000 vs 37.400 demostrado ANTES del fix |
| (extra) Defecto (b) vía RPC REAL pre-fix | PASS — ERR_UNBALANCED 100.800,00 vs 100.802,90 demostrado ANTES del fix |

Restauración verificada: ambas funciones con hash idéntico al original tras la corrida; NET DELTA 0 (sin residuos).

## 4. Venta parcialmente pagada — comparativa de alternativas (SIN elección: es política contable del propietario)

> C5: «venta USD con pago parcial (100 de 550 USD)» → hoy `ERR_UNBALANCED` por diseño: el asiento de reconocimiento exige Σcobros = total_cup.

### Opción A — Reconocer el ingreso y registrar la parte pendiente como Cuentas por Cobrar

- **Compatibilidad con el catálogo:** SÍ — la categoría `ACT_CXC` («Cuentas por cobrar a clientes», activo_corriente, orden 13) **ya existe** en `fin_categories`.
- **Compatibilidad con la arquitectura:** SÍ, con cambios acotados y versionados:
  1. Nueva métrica `cob_pendiente_cup := total_cup − Σ cob_<método>_<moneda>_cup` en `fin_compute_metrics('VENTA')`.
  2. Nueva versión de regla (v2) para VENTA en `fin_rule_versions` con un movimiento condicional: `D ACT_CXC` por `cob_pendiente_cup` cuando > 0. La infraestructura de versionado de reglas ya existe; la anulación compensatoria (espejo) ya funcionaría automáticamente.
  3. **Cobros tardíos**: hoy VENTA solo contabiliza en el evento `reconocimiento` (agregando los pagos existentes); los eventos `pago` solo existen para RECEPCION y SERVICIO_RECIBIDO. Habría que diseñar el evento `pago` para VENTA (`D efectivo/bancos / C ACT_CXC`) o re-procesar el asiento completo (anulación + re-publicación) al completarse el cobro. Es la pieza de arquitectura pendiente más sustancial.
- **Efecto en estados:** ingreso completo en el período + activo por cobrar; la venta a crédito queda representada como hecho económico íntegro. Las devoluciones sobre ventas a crédito requerirían una regla coherente para consumir ACT_CXC.
- **Aplicabilidad inmediata a los datos actuales:** las 3 ventas parciales reales (1df5d727, 8ab7becf, 28e94349) y las 165 legacy podrían contabilizarse bajo A solo tras definir la regla v2 y el evento de cobro.

### Opción B — Mantener la venta fuera del asiento financiero hasta completar el cobro

- **Compatibilidad:** ES el comportamiento actual del motor **sin ningún cambio**: Σcob ≠ total_cup → `ERR_UNBALANCED` → `fin_posting_errors` → el documento queda fuera de los estados financieros (bloqueado, no perdido; re-procesable cuando llegue el dato del cobro).
- **Aplicabilidad inmediata:** las 165 ventas legacy pasan a contabilizarse con la migración de cobros (expediente aparte de esta misión); las 3 inconsistentes permanecen bloqueadas por decisión del propietario.
- **Efecto en estados:** los ingresos y activos reflejan solo lo cobrado íntegramente; la actividad crediticia real queda invisible en los estados mientras existan pendientes.
- **Coste:** cero cambios de código; el riesgo es de política (subrepresentación del hecho económico), no técnico.

### Nota técnica (sin política)

Ambas opciones son compatibles con la arquitectura; B es el estado actual sin cambios; A requiere regla v2 + métrica nueva + diseño del cobro tardío. **La elección entre A y B es una decisión contable del propietario** — este expediente no la toma.

## 5. Seguridad y restricciones cumplidas

- Producción **no tocada** (la migración vive en la rama; solo BD E2E aislada).
- Sin merge, sin despliegue, sin backfill, sin recalculo histórico, sin modificación de documentos.
- Escaneo de secretos en el diff: 0 coincidencias (los patrones del escáner no
  se citan literalmente aquí, siguiendo el convenio anti-falsos-positivos del
  expediente del PR #1612).
- El validador reinstala las funciones originales al terminar (hash idéntico verificado) y deja NET DELTA 0.
