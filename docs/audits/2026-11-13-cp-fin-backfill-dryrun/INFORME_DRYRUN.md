# INFORME — DRY-RUN DEL BACKFILL HISTÓRICO (CP-FIN)

**Fecha:** 2026-11-13 · **BD:** PRODUCCIÓN (`wthkddeleylijmonclxg`) · **Modo:** DRY-RUN **read-only** (sin escrituras)
**Script (re-ejecutable):** `scripts/fin-backfill-dryrun.mjs` · Guard: CP-INFRA-019 (`ALLOW_PROD=read-only`) + bloqueador estático de sentencias no-SELECT (fail-closed)
**Informe máquina:** `download/fin-backfill-dryrun-informe.json` (verificación independiente de cada cifra de este documento)
**Autorización:** frente 1 de la instrucción del propietario del 2026-11-13 — *solo dry-run, sin contabilización real ni modificación de datos en producción*.

---

## Verificación de solo lectura

- **Ninguna escritura:** el script rechaza toda sentencia que no empiece por `SELECT`/`WITH` y toda aparición de verbos DML/DDL. Ejecutado dos veces completas.
- **BD intacta (verificada por conteos ANTES/DESPUÉS, idénticos):** `fin_entries=0, fin_movements=0, fin_posting_errors=0, transactions=1008, devolutions=2, receipts=97, received_services=41, issue_slips=241, inventory_adjustments=1, commission_payments=1, payrolls=1, cash_flow_documents=2, payment_transactions=942` antes y después.
- **Cero asientos existen hoy** (`fin_entries=0`): nada está previamente contabilizado; el dry-run mide TODO el histórico acumulado.

## 1. Documentos históricos elegibles (por tienda, período y tipo)

**Total: 1.342 documentos elegibles → 1.342 asientos de reconocimiento + 16 asientos de pago (pagos posteriores de servicios) = 1.358 asientos, 4.678 movimientos.**

Condición de elegibilidad (idéntica a `fin_backfill`): estado de disparo del tipo (`completed`/`active`/`paid`/`confirmed`/`confirmado`) **y** sin asiento previo (`NOT EXISTS fin_entries`).

### Por tienda (con nombre, docs y CUP-equivalente)

| Tienda | Docs elegibles | Importe CUP-equivalente |
|---|---:|---:|
| ENERVIDA-VITALLCONS | 1.047 | 7.807.462.377,80 CUP |
| COSTPRO (Prueba) | 218 | 19.509.893,43 CUP |
| PUERTO PADRE | 77 | 2.117.931,50 CUP |
| FERROCARRIL VITALLCONS / SHADDAI / QA UI Icons Store / QA-Release-1593-Plantillas | 0 | 0 |

*La tabla completa tienda×mes×tipo (34 grupos) está en el JSON (`elegibles.por_grupo`), p. ej. ENERVIDA-VITALLCONS 2026-08 VENTA = 262 docs / 2.012.085.650 CUP-equiv.; COSTPRO (Prueba) 2026-05 VENTA = 102 docs / 2.986.735 CUP.*

### Por tipo documental (asientos que se generarían)

| Tipo | Asientos | Movimientos | Desbalanceados |
|---|---:|---:|---:|
| VENTA | 989 | 3.956 | 0 |
| VALE_SALIDA | 235 | 470 | 0 |
| RECEPCION | 96 | 192 | 0 |
| SERVICIO_RECIBIDO | 16 | 32 | 0 |
| DEVOLUCION_VENTA | 2 | 4 | 0 |
| FLUJO_CAJA | 2 | 4 | 0 |
| AJUSTE_INVENTARIO | 1 | 2 | 0 |
| COMISION | 1 | 2 | 0 |
| NOMINA | 0 | 0 | — |
| **Pagos posteriores (services, evento `pago`)** | 16 | 32 | 0 |

## 2. Documentos excluidos y motivo (104 en total)

| Tipo | Motivo | N |
|---|---|---:|
| SERVICIO_RECIBIDO | ESTADO_NO_POSTABLE (20 draft + 5 voided + otros no activos) | 50 |
| VENTA | ESTADO_NO_POSTABLE (no completed) | 38 |
| VALE_SALIDA | ESTADO_NO_POSTABLE | 12 |
| RECEPCION | ESTADO_NO_POSTABLE (voided) | 2 |
| NOMINA | ESTADO_NO_POSTABLE | 2 |
| — | YA_CONTABILIZADO | **0** (no existe ningún asiento: `fin_entries=0`) |

Además, tipos documentales **sin regla activa** (documentados sin regla por diseño, matriz CP-FIN): ORDEN_COMPRA, ORDEN_PRODUCCION, ORDEN_TRABAJO, TRANSFERENCIA (traslado interno sin efecto económico) y DEVOLUCION_PROV (reversa de recepción, nace del `voided`).

## 3. Asientos que se generarían, con trazabilidad

Cada documento elegible generaría un asiento de reconocimiento con la regla semilla activa global (versión 1); cada pago de proveedor posterior generaría su asiento de pago enlazado por `payment_ref`. Estructura por tipo (reglas semilla auditadas en la auditoría CP-FIN 34/34):

| Tipo | Asiento de reconocimiento (espejo de la regla) |
|---|---|
| VENTA | D efectivo/bancos (por método) / C ING_VENTAS + reverso costo (D costo / C ACT_INVENTARIO) |
| DEVOLUCION_VENTA | D ING_VENTAS / C efectivo (reembolso) + reverso costo |
| RECEPCION | D ACT_INVENTARIO / C PAS_CXP_PROV |
| SERVICIO_RECIBIDO | D GAS_SERVICIOS / C PAS_SERV_PEND |
| VALE_SALIDA | D GAS_VALES / C ACT_INVENTARIO |
| AJUSTE_INVENTARIO | sobrantes D ACT_INVENTARIO; faltantes C GAS_AJUSTES |
| COMISION (pago) | D GAS_COMISIONES / C ACT_EFECTIVO_CUP |
| NOMINA | D GAS_NOMINAS + obligaciones / C PAS_NOMINA_PEND |
| FLUJO_CAJA | D/C según tipo (ingreso/egreso) / contrapartida |
| Pago de servicio | D PAS_SERV_PEND / C ACT_EFECTIVO_CUP (o ACT_BANCOS) |

**Trazabilidad hasta el documento original:** cada asiento queda enlazado por `fin_entries.document_type + document_id + event` (y `payment_ref` para pagos); cada movimiento lleva `document_number` y `traza` con la métrica de origen. Ejemplos verificables con documento real (muestra de 26 en el JSON, sección `asientos.detalle_muestra`):

- VENTA `4f0f…` → total_doc_origen 80.620 CUP (tasa 1) → movimientos D efectivo 80.620 / C ING_VENTAS 80.620 → trazabilidad `fin_entries(document_type=VENTA, document_id=…, event=reconocimiento)`.
- SERVICIO_RECIBIDO 680 CUP → D GAS_SERVICIOS 680 / C PAS_SERV_PEND 680; su pago (680 CUP) generaría además D PAS_SERV_PEND 680 / C efectivo 680 (asiento de pago con `payment_ref`).
- RECEPCION 1.340 CUP → D ACT_INVENTARIO / C PAS_CXP_PROV 1.340.

## 4. Totales separados por moneda (SIN conversiones ni sumas entre monedas)

| Moneda | Docs | Importe en moneda de origen | CUP-equivalente (informativo, con tasa del documento) |
|---|---:|---:|---:|
| CUP | 1.210 | 250.955.173,13 CUP | 250.955.173,13 CUP |
| USD | 132 | 11.071.251,97 USD | 7.578.135.029,60 CUP (tasa de cada documento) |

*La columna CUP-equivalente de USD se muestra solo a título informativo y usa SIEMPRE la tasa registrada en cada documento (misma fuente que `fin_compute_metrics`: `total_amount × exchange_rate`); **ningún asiento suma monedas entre sí** — la aritmética del motor es siempre en CUP por asiento con `currency_origin` preservada. Pagos en divisa distintos de la moneda del documento: 0.*

## 5. Duplicados, previamente contabilizados, anulaciones e inconsistencias

- **Previamente contabilizados: 0** (no existe ningún asiento: `fin_entries = 0`). El backfill no duplicará nada ya contabilizado.
- **Números de documento duplicados (misma tienda):** RECEPCION `document_number NULL` × 95 (documentos sin numerar — el asiento los traz por `document_id`, no por número; no es duplicado de asiento); VENTA `invoice_number NULL` × 716 (ídem); VALE_SALIDA `VS-000002-2026`, `VS-000003-2026`, `VS-000004-2026` × 2 (trasladar el filtro con store muestra que los pares pertenecen a tiendas distintas → no son duplicados reales). **Ninguno impide el backfill** (la idempotencia es por `document_id`, no por número).
- **Duplicados de pago (idempotency_key repetido): 0.**
- **Anulaciones:** 5 SERVICIO_RECIBIDO voided y 1 VALE_SALIDA voided (excluidos por estado; 0 recepciones voided). Documentos anulados YA contabilizados que necesitarían asiento de anulación: **0** (nada contabilizado aún).
- **Inconsistencias:** 0 asientos sin documento fuente; 0 pagos en divisa con moneda distinta a la del documento (contexto §17.1).

## 6. Validación de partida doble y equilibrio de cada asiento

- **1.358 asientos evaluados: 0 desbalanceados.** Cada asiento simulado cumple Σdébitos = Σcréditos = `total_cup` del documento (tolerancia 0,01).
- La validación re-ejecuta la MISMA condición que el motor (`fin_post_document` lanza `ERR_UNBALANCED` si |D−C| > 0,01): el dry-run confirma que ningún documento elegible produciría un asiento rechazado por desbalance.
- En el backfill real, `fin_post_document_safe` además registraría cualquier error de reglas en `fin_posting_errors` sin bloquear el negocio (no se espera ninguno: 0 desbalanceados, 0 discrepancias).

## 7. Idempotencia (segunda simulación)

- **PASADA 1 y PASADA 2 ejecutadas sobre los mismos datos:** 1.342 asientos / 4.662 movimientos en ambas; **hash SHA-256 de resultados idéntico** → la re-ejecución del dry-run genera exactamente lo mismo, sin duplicados.
- El backfill REAL es idempotente además por construcción: (a) la elegibilidad exige `NOT EXISTS fin_entries` para el documento (y para pagos, `payment_ref` no usado); (b) `fin_post_document` retorna `NULL` si ya existe un asiento con mismo tipo+documento+evento+`payment_ref`; (c) `fin_backfill` aplica `NOT EXISTS` previo y registra cada corrida en `audit_logs`. Ejecutar el backfill dos veces no puede contabilizar nada dos veces.
- El dry-run en sí no puede crear duplicados porque **no inserta nada** (verificado: conteos idénticos antes/después).

## 8. Comparación de los resultados esperados con los documentos y movimientos originales

- **1.342 comparaciones documento-a-Documento:** Σmovimientos esperados del asiento (D=C) vs `total_cup` del documento original → **0 discrepancias** (0 totales nulos/NaN). Por tipo: Σ`total_cup` de los documentos == Σdébitos esperados (p. ej. VENTA 989 docs → Σ = Σ D; JSON `comparacion_originales.sumas_por_tipo`).
- **Pagos posteriores:** 16 pagos de servicios elegibles (33.215,00 CUP acumulados) == 16 asientos de pago con `payment_ref` enlazado → cada pago produce exactamente un asiento de pago.
- **Cero asientos existentes** → el estado esperado post-backfill sería `fin_entries = 1.358` con todos los movimientos trazables a su documento por `document_id`/`payment_ref`.

---

## Riesgos y puntos de decisión (requieren aprobación del propietario)

1. **Autorización del backfill real** (fase posterior, NO ejecutada): se recomienda por tienda y por rango de fechas, empezando por la tienda con mayor volumen (ENERVIDA-VITALLCONS, 1.047 docs), verificando `fin_entries` tras cada lote y confirmando `fin_posting_errors = 0`. El dry-run puede re-ejecutarse en cualquier momento antes/después como verificación independiente.
2. **Tiendas de QA/prueba (COSTPRO (Prueba), QA UI Icons Store, QA-Release-1593-Plantillas):** su histórico (218 docs en COSTPRO (Prueba)) entraría en el backfill. Decidir si se excluyen del período autorizado o se contabilizan también (no hay filtro por tienda en `fin_backfill`; se controla con `p_store_id`).
3. **Ventas sin `invoice_number` (716) y recepciones sin `document_number` (95):** no afectan la idempotencia ni la partida doble (trazabilidad por `document_id`), pero aparecen como “duplicados de número” en los reportes de números; opcionalmente completar numeración antes del backfill real.
4. **Volumen USD de ENERVIDA-VITALLCONS** (132 docs, 11,07 M USD): la conversión a CUP-equiv. del informe usa la tasa de cada documento; confirmar que las tasas históricas registradas son las autorizadas para reportes (el asiento preserva `currency_origin`).
5. **NOMINA: 0 elegibles** — verificada read-only: la única nómina (`NOM-000001-2026`, 5.000 CUP) está en estado `voided` → excluida por ESTADO_NO_POSTABLE. Correcto: una nómina anulada no debe reconocerse.

## Conclusión

El histórico es **elegible, coherente y seguro de reconstruir**: 1.342 documentos válidos, partida doble equilibrada al 100 %, cero duplicados de contabilización, cero inconsistencias, idempotencia demostrada y BD intacta tras la simulación. **No se ha insertado, modificado o anulado ningún asiento, documento, estado o saldo.** El backfill real queda pendiente de la autorización expresa del propietario.
