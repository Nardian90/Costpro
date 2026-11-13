# INFORME RECONCILIADO — DRY-RUN DEL BACKFILL HISTÓRICO (CP-FIN · F1)

**Fecha:** 2026-11-13 · **BD:** PRODUCCIÓN (`wthkddeleylijmonclxg`) · **Modo:** DRY-RUN **read-only** (sin escrituras; conteos ANTES=DESPUÉS idénticos → BD intacta).
**Script re-ejecutable:** `scripts/fin-backfill-dryrun.mjs` (rama `feat/fin-backfill-dryrun-20261113`) — guard CP-INFRA-019 `ALLOW_PROD=read-only` + bloqueador estático de sentencias no-SELECT.
**Informe máquina:** `download/fin-backfill-dryrun-informe.json` (cada cifra de este documento sale de ahí; generado por el propio script, sin retoques manuales).

> **Corrección respecto a la entrega anterior:** el resumen anterior reportaba 4.678 movimientos; la cifra correcta es **4.694** (4.662 de reconocimiento + 32 de pagos: 16 asientos de pago × 2 movimientos). El error era una suma manual en el Markdown; este informe se genera directamente desde el JSON comprobado y el script ahora incluye los pagos en las dos pasadas y en el hash.

## 1. Documentos originales elegibles

**Total: 1.342** documentos originales elegibles (estado postable del tipo y sin asiento previo en `fin_entries`; hoy `fin_entries=0` → todo el histórico acumulado).

Por tienda (docs y CUP-equivalente):

| Tienda | Docs elegibles | Importe CUP-equivalente |
|---|---:|---:|
| ENERVIDA-VITALLCONS | 1.047 | 7.807.462.377.8 CUP |
| COSTPRO (Prueba) | 218 | 19.509.893.43 CUP |
| PUERTO PADRE | 77 | 2.117.931.5 CUP |

Por tipo documental (asientos de reconocimiento):

| Tipo | Asientos | Movimientos |
|---|---:|---:|
| VENTA | 989 | 3.956 |
| DEVOLUCION_VENTA | 2 | 4 |
| RECEPCION | 96 | 192 |
| SERVICIO_RECIBIDO | 16 | 32 |
| VALE_SALIDA | 235 | 470 |
| AJUSTE_INVENTARIO | 1 | 2 |
| COMISION | 1 | 2 |
| NOMINA | 0 | 0 |
| FLUJO_CAJA | 2 | 4 |
| **Σ reconocimiento** | **1.342** | **4.662** |

## 2. Asientos de reconocimiento

**1.342** asientos de reconocimiento (uno por documento original elegible). Todos balanceados (Σdébitos = Σcréditos = `total_cup`, tolerancia 0,01): **1.342 balanceados / 0 desbalanceados**.

## 3. Asientos de pagos posteriores

**16** asientos de pago por `payment_transactions` de servicios (evento `pago`, dirección `in`, sin asiento previo con `payment_ref`). Importe total: 33.215 CUP. Pagos con moneda distinta a la del documento: **0**. Resumen por ref_type: `service` × 16.

Estructura del asiento de pago: `PAS_CXP_PROV` débito / `ACT_EFECTIVO_CUP` crédito (importe `amount_cup` del pago).

## 4. Movimientos de reconocimiento

**4.662** movimientos de reconocimiento (por tipo: VENTA 4, DEVOLUCIÓN/RECEPCIÓN/SERVICIO/VALE/AJUSTE/COMISIÓN/FLUJO 2, NÓMINA 3).

## 5. Movimientos de pagos

**32** movimientos de pagos (16 asientos × 2 movimientos/asiento).

## 6. Totales generales

| Concepto | Asientos | Movimientos |
|---|---:|---:|
| Reconocimiento | 1.342 | 4.662 |
| Pagos posteriores | 16 | 32 |
| **TOTALES GENERALES** | **1.358** | **4.694** |

## 7. Hash SHA-256 de cada pasada y alcance exacto de los datos

| Pasada | Asientos (recon/pago) | Movimientos (recon/pago) | Hash SHA-256 |
|---|---|---|---|
| PASADA 1 | 1.342 / 16 | 4.662 / 32 | `32109d55dd3fb0db098f160b369add2c3a253e8f59fd2b762e092caac30945b4` |
| PASADA 2 | 1.342 / 16 | 4.662 / 32 | `32109d55dd3fb0db098f160b369add2c3a253e8f59fd2b762e092caac30945b4` |

**Idempotencia: SÍ (hash y conteos idénticos en ambas pasadas)** — los pagos posteriores están incluidos en ambas pasadas y en el cálculo del hash.

**Alcance exacto de los datos incluidos en cada hash:** Por cada doc de RECONOCIMIENTO (orden: TIPO_SQL en orden de clave, filas en orden SQL): "tipo|id|total_cup|debitos:creditos". Por cada PAGO posterior (orden pt.id): "PAGO|pago_id|total_cup|debito:credito". La lista de elegibles y el importe total_cup de cada doc/pago son los datos que determinan el hash.

## Reclasificación de la numeración documental (requisito del propietario)

El análisis anterior agrupaba por número documental GLOBAL (sin tienda) y clasificaba 716 ventas y 95 recepciones "sin número" como duplicados. Reclasificado por **tienda + tipo + número documental**:

- **Documentos SIN numeración (numeración ausente, NO duplicados): 811** en documentos postables:
  - RECEPCION · COSTPRO (Prueba): 3
  - RECEPCION · ENERVIDA-VITALLCONS: 87
  - RECEPCION · PUERTO PADRE: 5
  - VENTA · COSTPRO (Prueba): 213
  - VENTA · ENERVIDA-VITALLCONS: 434
  - VENTA · PUERTO PADRE: 69
- **Duplicados REALES (misma combinación tienda+tipo+número, con numeración presente): 0**. Los tres pares `VS-000002/3/4-2026` del análisis anterior son de **tiendas distintas** (la numeración de vales es POR TIENDA): no hay ningún par dentro de una misma tienda.
- **Duplicados de CONTABILIZACIÓN (documento con >1 asiento en `fin_entries`): 0** — hoy `fin_entries=0`, necesariamente vacío.

Claves de idempotencia de pagos repetidas (tienda+`idempotency_key`): 0.

## Exclusiones (motivo y conteo)

| Tipo | Motivo | n |
|---|---|---:|
| VENTA | ESTADO_NO_POSTABLE | 38 |
| RECEPCION | ESTADO_NO_POSTABLE | 2 |
| SERVICIO_RECIBIDO | ESTADO_NO_POSTABLE | 50 |
| VALE_SALIDA | ESTADO_NO_POSTABLE | 12 |
| NOMINA | ESTADO_NO_POSTABLE | 2 |
| **Σ excluidos** | | **104** |

## Anulaciones e inconsistencias

Anulados (voided) por tipo: `RECEPCION` × 0, `SERVICIO_RECIBIDO` × 5, `VALE_SALIDA` × 1. Documentos anulados ya contabilizados: 0.

Inconsistencias: ninguna.

## Verificación cruzada independiente (reconciliación contra PostgreSQL)

Consultas SQL independientes del script (canal Management API read-only, script `scripts/reconciliar-f1-cifras.py` preservado) confirmaron:

- Elegibles por tipo: mismas cifras fila a fila (VENTA 989, RECEPCIÓN 96, SERVICIO 16, VALE 235, etc.).
- `fin_entries = 0` y `fin_movements = 0` hoy → 0 duplicados de contabilización, 0 anulados ya contabilizados.
- Pagos posteriores sin asiento: 16 (`service`), 33.215,00 CUP; 0 con moneda distinta al documento.
- Duplicados reales tienda+tipo+número: 0 (los pares VS-000002/3/4-2026 son de tiendas distintas).
- Aritmética de movimientos: 4.662 (reconocimiento) + 32 (pagos) = 4.694; asientos 1.342 + 16 = 1.358.

## Estado de autorización

Este dry-run NO autoriza la ejecución del backfill. Producción permanece en modo exclusivamente lectura; ninguna escritura fue ejecutada (conteos ANTES = DESPUÉS en las 13 tablas de referencia).
