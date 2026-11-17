# CP-FIN-NEGATIVE-WAC-REMEDIATION-013
## NEGATIVE_WAC_ROOT_CAUSE_REPORT — Investigación y resolución de los cinco WAC negativos detectados después de RECT-011 (hallazgo F-012-1)

| Campo | Valor |
|---|---|
| Misión | CP-FIN-NEGATIVE-WAC-REMEDIATION-013 |
| Fecha | 2026-11-17 |
| Naturaleza | Investigación forense 100 % read-only en producción + prototipo E2E en BD aislada + propuesta de corrección gobernada (SIN ejecución en producción) |
| Objeto | SKU117 · SKU83 · SKU90 · SKU40 · SKU37 (tienda ENERVIDA `5e6fe821-5465-48b1-b3f1-3aa3182edc38`) — hallazgo F-012-1 de la certificación 012 |
| Misión previa | CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012 · PR #1642 · main `ebe6be5cc` |
| main de referencia | `ebe6be5cc` (verificado: PR #1642 merged; sin migraciones contables posteriores) |
| Guards activos | CP-INFRA-019 (read-only) · CP-INFRA-020 (por consulta) · T12 (tgenabled=O) · RLS · writers manifest · guard WAC `w62_guard_wac_writer` (probado en E2E) |
| **Escrituras en producción** | **CERO** |

**Veredicto ejecutivo**: los cinco WAC negativos **no son un resultado normal ni un error aritmético del asiento**: son el residuo, en cinco productos concretos, de una misma causa raíz con dos capas — (1) **preexistente**: la recepción FAC-VITALLCONS-001 (2026-07-01) nunca actualizó el `cost_average` de sus productos (0 filas en `wac_change_log` para ella) y todas las salidas históricas se registraron a costo ≈0, de modo que el valor libro de estos productos (wac_old × stock ≈ 29,68 CUP en total) jamás contuvo el costo de la recepción, que permaneció como residuo obsoleto dentro de ACT_INVENTARIO; y (2) **de ejecución RECT-011**: el modelo m074/lote C computó `wac_new = (wac_old×stock − (uc_old−1)×fvc_rem)/stock` sin acotar el crédito de inventario al valor libro real del producto; donde el crédito (2.657.375,00 para los 5) superó al valor libro (29,68), el resultado fue negativo. La misma premisa falsa generó, en el mismo asiento, **saldos acreedores anómalos en las tres cuentas de gasto** (COGS −16.677.175,95 · VALES −5.105.078,39 · PÉRDIDA −9.691.011,00) — ingreso fantasma del que los 5 WAC negativos son la porción de producto. La corrección propuesta (RECT-013-A, 2.657.379,32 CUP, equilibrada al centavo, probada en E2E 16/16 PASS) restaura la valoración de los 5 productos a la economía autorizada (1,00 CUP/u) sin reabrir RECT-011 ni alterar FAC-VITALLCONS-001 (CXP neta 5.861,50 intacta), y deja cuantificado por separado el componente B de regularización para autorización específica.

**Batería: 16/16 veredictos E2E PASS · diferencia aritmética de 280.106,21 CUP explicada al centavo · 5/5 identidades de cantidades cuadradas · 0 escrituras en producción.**

---

## §1. Los cinco WAC negativos, verificados (control §3 del mandato)

| SKU | Producto | Stock (u) | WAC unitario = cifra informe 012 | **Valor total = WAC × stock** |
|---|---|---:|---:|---:|
| SKU117 | Inversor | 1 | −2.175.998,00 | **−2.175.998,00** |
| SKU83 | Cripiadora Roja con 6 dabas rojas | 2 | −122.398,00 | **−244.796,00** |
| SKU90 | Cable Solar Rojo 6mm | 3 | −78.176,248120300752 | **−234.528,74** |
| SKU40 | Latiguillo de media por 3/8 | 3 | −665,857142857143 | **−1.997,57** |
| SKU37 | J de techo | 25 | −1,00 | **−25,00** |
| **TOTAL** | | **34** | — | **−2.657.345,32** (Σ exacta −2.657.345,315789473 → Q2) |

**Naturaleza de cada cifra (§3 del mandato)**: las cinco cifras del informe 012 son el **costo unitario promedio** (`products.cost_average`, WAC en CUP/u), no valores totales ni saldos contables ni ajustes de capa. El total declarado en 012 (−2.657.345,32) es Σ(wac × cantidad kardex).

**Explicación de la diferencia de 280.106,21 CUP**: sumar los WAC unitarios tal cual produce −2.377.239,11; multiplicar cada uno por su cantidad añade (qty−1)×wac por SKU: SKU83 +122.398,00 · SKU90 +156.352,50 · SKU40 +1.331,72 · SKU37 +24,00 · SKU117 +0,00 (qty=1) = **+280.106,21** → −2.657.345,32. Verificación con `Decimal` exacto sobre producción: −2.657.345,315789473 − (−2.377.239,11) = **−280.106,21 EXACTA** (los céntimos de SKU90 y SKU40 provienen del redondeo a 2 decimales de sus WAC: −78.176,248120… y −665,857142…). **EXPLICADA al centavo** (hoja «Control aritmético» de `FIVE_SKU_RECONCILIATION.xlsx`).

## §2. Instante exacto y preexistencia (§4 del mandato)

- **Instante exacto**: `2026-11-16 19:59:14.38156+00` — acción de auditoría `SYSTEM_RECT011_WAC`, trace `RECT011-PROD`, **lote C (m076), pasada 1 de RECT-011**. Los 6 registros muestran `old_data.wac` **positivo** para los 5 SKU + SKU31 y `new_data.wac` negativo para los 5.
- **¿Existía antes de RECT-011?** NO. Todos los WAC eran positivos hasta ese instante (1,00 · 1,00 · 0,7518796992 · 0,1428571428 · 0,96). El valor negativo **fue producido durante la ejecución** de RECT-011 (lote C). La certificación 012 ya lo clasificó como artefacto del modelo m074/loteC (POST_EXECUTION) con causa raíz preexistente — esta misión lo confirma movimiento a movimiento.
- **¿La hipótesis del drift (salidas a WAC≈0) se sostiene?** SÍ, verificada por tres vías independientes:
  1. **Kardex**: las salidas históricas de los 5 SKU están registradas a unit_cost ≈0 (p. ej. SKU117: venta 07-27 a 0, ajuste 08-18 a 0; SKU90: 18 de 22 movimientos de venta a 0; SKU37: venta de 10 u a 0; SKU40: venta a 0) mientras sus capas FVC llegaron a 50–2.176.000 CUP/u.
  2. **wac_change_log**: la recepción FVC (2026-07-01) no tiene NINGUNA fila para estos productos (el WAC quedó en 0); las filas históricas son las correcciones nominales de octubre (`wac_correction` 0→1 para SKU117/83; `adjustment_plus` → 0,96/0,1429; `reception_in` de la capa ajena de SKU90 → 0,7519 por dilución sobre ca=0).
  3. **Libro mayor**: los créditos de RECT-011 a las cuentas de gasto (21,45M + 5,91M + 9,69M) no tienen débitos históricos proporcionales que los sustenten (los gastos reales registrados por las salidas de los 5 SKU suman ≈125,38 CUP).

## §3. Reconstrucción por SKU (§4) — cantidades, capas e identidad

Identidad de cantidades: **existencia inicial + entradas − consumo neto = existencia final — 5/5 CUADRAN** (y SKU31 de control también):

| SKU | Entrada FVC | Otras recepciones | Ajustes + | Consumo neto | Existencia final | ¿Cuadra? |
|---|---:|---:|---:|---:|---:|---|
| SKU117 | 6 | 0 | 0 | 5 (1 venta + 2 vale + 2 pérdida) | 1 | **OK** |
| SKU83 | 3 | 0 | 0 | 1 (vale) | 2 | **OK** |
| SKU90 | 173 | 100 (rec. ajena 30538c95 @1, consumida) | 0 | 270 (123 venta + 126 vale + 21 pérdida) | 3 | **OK** |
| SKU40 | 7 | 0 | 1 (@1) | 5 (1 venta + 4 vale) | 3 | **OK** |
| SKU37 | 11 | 0 | 24 (@1) | 10 (venta) | 25 | **OK** |

- `stock_current == Σ kardex` para los 5 (drift 0; coherente con la 012).
- **Capas**: los 4 SKU sin capas ajenas tienen SOLO la capa FVC (ya a 1 CUP tras RECT-011). **SKU90** es el único de los 5 con capa ajena: recepción `30538c95` (IMPORT-ENERVIDA-679) de 100 u @ 1,00 — **consumida** (94 por vale VS-000106 + 6 por venta 09-25, neto FIFO) y **intacta en su costo**. Las 3 u restantes de SKU90 valen 1,00 CUP/u con independencia de la capa de origen (FVC ahora @1; ajena @1).
- Nota preexistente documentada (no atribuible a RECT-011): el kardex de SKU90 presenta `balance_after` inconsistente en sus reversas y atravesó saldos intermedios negativos durante las importaciones de julio–agosto (drift histórico). El NETO (3 u) concilia con `stock_current`.

## §4. La lógica real del WAC (§5) y por qué falló con el drift

- **Motor canónico**: `fn_recalc_wac` (D-01): entradas `ca_new = (S·ca_prev + q·uc)/(S+q)`; salidas puras: WAC invariante; escritura única protegida por `trg_guard_wac_writer` / `w62_guard_wac_writer` (token `app.wac_writer='fn_recalc_wac'`). **El blend canónico jamás produce negativos con entradas positivas** — el negativo no salió de `fn_recalc_wac`.
- **RECT-011/lote C** usó el «patrón sellado» (token + UPDATE directo + fila explícita en `wac_change_log`), con los `wac_new` del modelo m074: **`wac_new = (wac_old×stock − (uc_old−1)×fvc_rem)/stock`** — consistente con el crédito de inventario del asiento (por diseño: valor libro = wac×stock − crédito INV).
- **¿Es matemáticamente correcto con salidas históricas a costo cero?** La fórmula es exacta en el mundo «sin drift» (donde el valor libro contiene la recepción: uc_old×fvc_rem). Con el drift real (valor libro ≈0), el crédito `(uc_old−1)×fvc_rem` **carece de cota sobre el valor libro** y el resultado puede ser negativo. Fue lo que ocurrió exactamente donde `(uc_old−1)×fvc_rem > wac_old×stock`:

| SKU | wac_old | Valor libro pre (CUP) | Crédito INV aplicado (CUP) | **Exceso (CUP)** |
|---|---:|---:|---:|---:|
| SKU117 | 1,00 | 1,00 | 2.175.999,00 | **2.175.998,00** |
| SKU83 | 1,00 | 2,00 | 244.798,00 | **244.796,00** |
| SKU90 | 0,7519 | 2,26 | 234.531,00 | **234.528,74** |
| SKU40 | 0,1429 | 0,43 | 1.998,00 | **1.997,57** |
| SKU37 | 0,96 | 24,00 | 49,00 | **25,00** |

- **No se forzó promedio negativo deliberadamente ni se impuso 1 CUP a saldos negativos en RECT-011**: el 1,00 CUP/u que se propone ahora no es un「forzado」— es el valor de las capas legítimas existentes (todas a 1,00 CUP/u tras RECT-011 y en las capas ajenas), es decir, la valoración que el kardex FIFO real sostiene.
- **SKU31 y SKU90 (capas de otras recepciones), verificados expresamente**: SKU31 (110 u ajenas @1 en 0fab1e37 y 55ed12df) acabó con WAC=1,00 **coherente con todas sus capas** (sin negatividad porque su stock diluye el crédito). SKU90 sí quedó negativo pese a tener todas las capas a 1 CUP/u — por el exceso de crédito (234.528,74 > 2,26), agravado por la atribución del modelo m074 (fvc_rem=69 modelado vs 3 u reales: el modelo atribuyó al inventario el delta de unidades que en realidad salieron por canales no modelados por el drift). Las capas legítimas **no se alteran** en la corrección propuesta.

## §5. Clasificación de causa raíz por SKU (§7)

**Clasificación común: G — combinación de varias causas**, con la misma estructura probada para los 5:

- **(B) Historial de salidas a costo cero — PREEXISTING, causa primaria.** La recepción FVC nunca entró al WAC y las salidas se registraron a ≈0: el valor libro preexistente (29,68 en total) no contenía la recepción (2.176.000/122.400/3.400/1.000/50 CUP/u). Evidencia: kardex + wac_change_log + libro mayor (§2, §4).
- **(A) Error de cálculo del WAC en el lote C — POST_EXECUTION, causa inmediata.** El modelo m074 no acotó el crédito de inventario al valor libro real (falta de un guard tipo «inv_credito ≤ valor_libro − valor_objetivo»), y su simulación FIFO fuerza la capa FVC al frente sin manejar el período de stock negativo del drift (SKU90: fvc_rem 69 vs 3 reales). Evidencia: fórmula + exceso por SKU (§4) + instantánea SYSTEM_RECT011_WAC.
- **No es (C) capas mal consumidas** (el consumo de capas no revaloriza costos), **ni (D) reversas mal tratadas** (las 3 reversas de SKU90 están casadas con sus ventas), **ni (E) ajustes sin contrapartida** (los ajustes de cuadre @1 son coherentes en el kardex; su tratamiento contable —sin asiento— es parte del drift preexistente), **ni (F) divergencia operativo-contabilidad per se** (esa divergencia global es F-012-3, preexistente y protegida; aquí lo nuevo es el signo negativo del WAC).
- **El asiento RECT-011 permanece balanceado y la economía del documento intacta** (cadena 192.039.436 − 151.299.851 − 40.733.723,50 = 5.861,50 exacta): la anomalía es de **atribución por producto/canal**, no de totales.

## §6. Valor real del inventario por producto (§B) y diferencias entre bases (§C)

**Valor real (economía autorizada: todas las capas de estos SKU a 1,00 CUP/u)**:

| SKU | Stock | Valor kardex/FIFO real | WAC hoy (negativo) | Valor contable hoy | Diferencia a restaurar |
|---|---:|---:|---:|---:|---:|
| SKU117 | 1 | **1,00** | −2.175.998,00 | −2.175.998,00 | +2.175.999,00 |
| SKU83 | 2 | **2,00** | −122.398,00 | −244.796,00 | +246.798,00 |
| SKU90 | 3 | **3,00** | −78.176,2481 | −234.528,74 | +237.528,74 |
| SKU40 | 3 | **3,00** | −665,8571 | −1.997,57 | +2.000,57 |
| SKU37 | 25 | **25,00** | −1,00 | −25,00 | +50,00 |
| **TOTAL** | **34** | **34,00** | — | **−2.657.345,32** | **+2.657.379,32** |

**Diferencias entre bases (hoy)**: kardex valorado de los 5 SKU (capas a 1 CUP × existencias) = **34,00** · valoración de producto (wac×stock) = **−2.657.345,32** · atribución en ACT_INVENTARIO = **11.361.574,62** (residuo obsoleto del modelo de la 011: Σ item 14.018.950 + otros débitos 125 − costos registrados 125,38 − créditos INV 2.657.375,00; la cuenta global es 34.435.061,24 y contiene además el residuo del resto de productos — divergencia F-012-3, PREEXISTING y protegida, que esta misión NO reabre). La propuesta RECT-013-A alinea el valor de producto con el kardex (34,00) y libera del atributo ficticio de la cuenta la parte correspondiente al exceso de crédito (2.657.379,32).

## §7. Corrección necesaria y propuesta (§8 / §D / §E)

### Componente A — RECT-013-A (restauración del defecto F-012-1; recomendada para autorización y ejecución)

- **Lote A · WAC** (token sellado + wac_change_log `rect013_restauracion` + auditoría `SYSTEM_RECT013_WAC`): los 5 `cost_average` → **1,00 CUP/u** (valor de sus capas legítimas). Existencias, movimientos y capas SIN cambios.
- **Lote B · asiento** (`AJUSTE_INVENTARIO`/`ajuste_manual` · `document_id` NULL · `economic_date` = fecha de ejecución · `movements_snapshot` por SKU):

| Categoría | Sentido | Importe (CUP) | Criterio |
|---|---|---:|---|
| GAS_COSTO_VENTAS | débito | **566.546,45** | reparto proporcional a los créditos de RECT-011 de los 5 SKU |
| GAS_VALES | débito | **1.072.918,27** | (base 11.361.375,00 = créditos de gasto de los 5 SKU en RECT-011) |
| GAS_PERDIDA_INV | débito | **1.017.914,60** | residuo de reparto al centavo |
| ACT_INVENTARIO | crédito | **2.657.379,32** | liberación de la atribución ficticia de inventario |
| **Σ debe = Σ haber** | | **2.657.379,32** | **D−C = 0,00** |

- **Semántica**: el importe es exactamente el exceso de crédito de inventario de RECT-011 sobre el valor libro de los 5 productos, ajustado al valor verdadero (2.657.375,00 de sobre-crédito + 34,00 − 29,68 de ajuste a valor real = 2.657.379,32). La contrapartida debita las cuentas de gasto que RECT-011 acreditó sin sustento (**reduce el ingreso fantasma** en la misma proporción) y acredita ACT_INVENTARIO (libera el atributo ficticio). **No toca PAS_CXP_PROV**: la economía autorizada de FAC-VITALLCONS-001 (5.861,50) queda intacta; no re-ejecuta RECT-1/RECT-2/RECT-011; las 101 líneas siguen a 1 CUP.
- **Alternativa documentada** (sugerencia del informe 012): concentrar la contrapartida íntegra en GAS_PERDIDA_INV (DR 2.657.379,32 / CR ACT_INVENTARIO 2.657.379,32).
- **Procedimiento exacto**: el prototipo E2E (`m092`) ES el runbook — 1 llamada = 1 transacción (guard YA_APLICADO + advisory lock + lote A + lote B), idempotente, reversible, con verificación V1–V10 integrada.

### Componente B — regularización de la asignación contable (CUANTIFICADO POR SEPARADO; NO ejecutar sin autorización específica, §10)

| Concepto | Importe (CUP) |
|---|---:|
| Liberación del residuo obsoleto de los 5 SKU en ACT_INVENTARIO (tras A) | 8.704.161,30 |
| — contrapartida: débito a COGS/VALES/PÉRDIDA deshaciendo el fantasma restante (11.361.375,00 − 2.657.379,32) | 8.703.995,68 |
| — contrapartida: re-costeo a 1 CUP/u de los consumos históricos netos de los 5 SKU (venta +107,93 · vales +34,69 · pérdida +23,00, netos de los costos ya registrados 125,38) | 165,62 |
| (Mismo tratamiento para los otros 96 productos recalculados — misión posterior si se autoriza) | fuera de alcance |

El componente B afecta el resultado acumulado y las bases divergentes F-012-3 (protegidas): **se presenta para decisión del propietario, sin ejecutar**.

## §8. Efectos sobre otros movimientos y recepciones (§F / integridad)

- **Otras recepciones**: la capa ajena de SKU90 (30538c95, 100 u @1) conserva su costo; las capas de SKU31 (0fab1e37, 55ed12df @1) intactas; las 66 capas de otras recepciones con uc≠1 (fuera de los 25 recalculados) no se tocan.
- **Otras tiendas**: SKU117 y SKU90 existen en PUERTO PADRE con WAC 1,00 positivo y `updated_at` 2026-10-10 (anterior a la misión) — intactos; los saldos de 43a4dabc… (12.258.163,67 INV / −12.258.163,67 CXP) y 899d2503… (1.616,50) constantes.
- **Movimientos históricos**: NO se reescriben (el kardex es append-only y no se insertan movimientos); los costos registrados de las salidas históricas quedan como evidencia del drift; el componente B los regulariza CONTABLEMENTE (asiento trazable), no reescribiendo fechas ni movimientos.
- **Precios de venta, pagos, servicios, trabajadores**: sin efecto (la propuesta solo toca 5 `cost_average` y 4 líneas de un asiento nuevo).
- **Auditoría de la misión 011** (183 filas RECT011-PROD) y de la 009 (14 filas RECT-PROD): intactas.

## §9. Prueba E2E aislada (§9 / §G) — 16/16 PASS

Ejecutada en **CostproE2E** (`lguovmvrozxgssupkwpf`, NUNCA producción) con fixture fiel (6 productos con WAC negativos exactos, 55 movimientos replicados, wac_change_log histórico, asientos con importes reales de los 5 SKU): **estado inicial negativo → corrección → WAC final matemáticamente válido (1,00 = valor de capas) → conservación de cantidades y capas ajenas → reconciliación exacta (Δ ACT_INVENTARIO −2.657.379,32 · CXP intacta) → idempotencia (guard YA_APLICADO, estado hash-idéntico) → rollback (aborto deliberado → 0 persistencia) → reaplicación (tras aborto y ciclo completo desde cero) → ausencia de duplicaciones → NET DELTA = 0**. Detalle completo en `E2E_CORRECTION_EVIDENCE.md`. Descubrimiento adicional: el guard `w62_guard_wac_writer` rechazó en E2E una escritura de WAC sin token — la corrección propuesta es la única vía escritora válida.

## §10. Criterios de aceptación (§12)

| Criterio | Estado | Evidencia |
|---|---|---|
| Los cinco WAC negativos comprobados | ✅ PASS | repro F-012-1 (5 filas exactas) + auditoría SYSTEM_RECT011_WAC |
| Diferencia aritmética de 280.106,21 CUP explicada | ✅ PASS | §1 (Decimal exacto: −280.106,21) |
| Valores unitarios y totales correctamente diferenciados | ✅ PASS | §1 + hoja «Exposición por SKU» |
| Causa raíz determinada para cada SKU | ✅ PASS | §5 (G = B preexistente + A lote C, con exceso cuantificado por SKU) |
| Cadena FIFO reconstruida | ✅ PASS | §3 + `FIFO_LAYER_RECONSTRUCTION.xlsx` (11 capas) |
| Capas de otras recepciones protegidas | ✅ PASS | §8 + E2E V10 |
| Cantidades y kardex conciliados | ✅ PASS | identidad 5/5 OK; drift 0 |
| COGS y gastos conciliados | ✅ PASS | §2/§6 (créditos sin sustento cuantificados; A los debita; B cuantificado por separado) |
| Propuesta contable equilibrada | ✅ PASS | RECT-013-A D−C = 0,00 (al centavo) |
| E2E completo, idempotente y reversible | ✅ PASS | 16/16 (E2E_CORRECTION_EVIDENCE.md) |
| Producción sin escrituras durante esta misión | ✅ PASS | triple guard + canal SELECT-only |
| Expediente completo e integrado | ✅ PASS | este expediente (9 entregables) |

## §11. Publicación (§H)

| Ítem | Valor |
|---|---|
| Rama | `docs/cp-fin-negative-wac-remediation-013-20261117` (desde `main` = `ebe6be5cc`) |
| Commits | 1) maquinaria m090/m091/m092/m093 + writers manifest · 2) expediente completo · 3) cierre (worklog + PR + SHA256SUMS) |
| PR | **#1643** — https://github.com/Nardian90/Costpro/pull/1643 (head `21fabc9d0`) |
| Checks | **5/5 success** (TypeCheck+Lint+Build · Unit & Integration Tests · E2E Aislado · Security Audit · Vercel Preview Comments) · mergeable_state clean |
| Merge | **MERGED** → **main = `c060ba88b`** (merge API, 2026-11-17) · expediente y SHA256SUMS 8/8 OK verificados en main |
| Expediente | `docs/audits/cp-fin-negative-wac-remediation-013/` (9 entregables, SHA256SUMS) |

## §12. Conclusión

Los cinco WAC negativos quedan **totalmente explicados**: no son un resultado aceptable ni un error del asiento en sus totales, sino el residuo por producto de una premisa falsa del modelo de la 011 (el valor libro nunca contuvo la recepción por el drift preexistente) aplicada sin cota por el lote C. La misión 013 deja: la causa raíz probada movimiento a movimiento, la valoración real de cada producto (34,00 CUP en total), la diferencia aritmética de 280.106,21 CUP resuelta al centavo, la corrección RECT-013-A diseñada, equilibrada, trazable y probada en E2E (16/16), el componente de regularización cuantificado por separado para autorización, y producción 100 % intacta. La ejecución de RECT-013-A queda lista para el procedimiento gobernado cuando el propietario lo autorice.
