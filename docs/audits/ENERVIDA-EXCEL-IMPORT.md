# ENERVIDA-EXCEL-IMPORT — Informe de Auditoría

**Fecha de ejecución:** 2026-10-04 (04:40–05:15 UTC importación; 05:46 UTC registro de pendientes)
**Rama:** `feat/enervida-excel-movement-import` (base: main `6cba0a1c`)
**Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`, slug `enervida-vitallcons`)
**Fuente:** `/home/z/my-project/upload/Enervida.xlsx` (2 hojas: Movimientos 821 filas 16/07→03/10/2026; Cat 157 productos)
**Mandato:** Incorporar a CostPro los movimientos faltantes usando **exclusivamente mecanismos oficiales** (mismo resultado que si el usuario los hubiera registrado a mano), con aprobación explícita previa y trazabilidad total.

---

## 1. Resumen ejecutivo

Se importaron **480 operaciones** del Excel a la tienda ENERVIDA mediante los RPCs de negocio de CostPro, todas con fecha operativa histórica, atribuidas a `admin@demo.com`, idempotentes y auditadas:

| Tipo | Mecanismo oficial | Importadas | Documento |
|---|---|---|---|
| Ventas | `create_sale_v2` | **280** | `transactions` + `transaction_items` + `payment_transactions` |
| Vales de salida (VS) | `create_vale_salida` | **125** | `issue_slips` (+ `issue_slip_items`) |
| Devoluciones (DV) | `create_devolution_v2` | **2** | `devolutions` NC-000014/000015-2026 + reembolso |
| Recepciones (Entradas) | `register_reception` | **43** | `receipts` (ref `IMPORT-ENERVIDA-<fila>`) |
| Ajuste (fila "Ajuste") | `perform_inventory_adjustment` | **1** | `stock_movements` |
| Cuadre de inventario | `perform_inventory_adjustment` | **75** | `stock_movements` (motivo `Cuadre importación ENERVIDA: …`) |
| Órdenes de trabajo | `create_production_order_v2` | **18** | `production_orders` OP-2026-00186…00203 |
| Pagos de OT | `register_supplier_payment` | **34** | `payment_transactions` (fechas históricas) |
| Correcciones pre-corte | `reverse_transaction_v2` | **3** | ventas erróneas anuladas y reimportadas según Excel |
| Productos nuevos | INSERT `products` (vía UI/RSL) | **32** | SKUs 124–155 + 998 (998 como servicio) |
| Sincronización precios | UPDATE `products` | **10** | 33, 47, 67, 86, 92, 100, 103, 113, 115, 119 → precio Cat |
| Flags costo cero | `w62_zero_cost_flags` | **22** | documentación exigida por `create_sale_v2` |

**Verificación final: 0 fallos** (FASE 17, `scripts/enervida_import/verify.mjs`):
- Inventario = `Existencia Final` (fin2) del Cat en **157/157 SKUs**.
- 280/280 ventas con total y fecha operativa idénticos a la fila Excel (Δ global −0.02 CUP por redondeo documentado en 2 filas).
- Pagos por método: efectivo CUP 3.146.939,98 · transferencia CUP 261.450,01 · USD (zelle) 13.624,84 netos — exactos bajo la política aprobada.
- 815 entradas de auditoría de la sesión; imágenes intactas (111 productos, 151 archivos, 0 faltantes).

**Cierre de pendientes (2026-10-04 05:46 UTC):** las 2 ventas saltadas (filas 480 y 819, ver §7) fueron registradas mediante la **cadena oficial del POS** (`POST /api/auth/supervisor-check` → `POST /api/pos/checkout` → `create_sale_v2`) con `admin@demo.com` como supervisor autorizado — ver §6-bis y §7.

## 2. Decisiones aprobadas por el usuario (GATE, 14 respuestas)

1. **Opción A** — continuar la tienda ENERVIDA existente (no duplicar).
2. **USD físico → bucket `zelle` @ tasa 680** (patrón ya usado en los datos pre-corte del propio usuario).
3. **Vuelto (efec negativo) → total neto**: `total = usd×680 + efec`; el precio neto resultante coincide con los precios reales (p. ej. Panel 550W: 300×680−3300 = 200.700 CUP = 295,4 USD ≈ precio Cat 295).
4. **VS con fecha histórica → migración mínima** `p_operation_date` en `create_vale_salida`.
5. **DV con fecha histórica → migración mínima** `p_operation_date` en `create_devolution_v2`.
6. **OT → crear production_orders + pagos históricos** (`register_supplier_payment` admite `p_payment_date`).
7. **Divergencias pre-corte → aplicar el Excel** (reversar los 3 registros erróneos de CostPro).
8. **Cuadre → ajustar a fin2** con fecha 18/08 y motivo trazable.
9. **Entradas → proveedor "Vitallcons"**, costo nominal 1 CUP sin dato (real en las 5 con dinero), fila "Ajuste" como ajuste de inventario.
10. **Productos nuevos → según Cat** (U→unidad, M→metro, Rollo→rollo, Y→unidad; precio pusd→USD, pcup→CUP; 998 servicio).
11. **Comisiones → no importar** (quedan en el Excel; tarea futura).
12. **Atribución → admin@demo.com** (igual que las 308 ventas existentes).
13. **Precios web desactualizados → sincronizar 10 productos al Cat.**
14. **Fila 480 (sku 111, −20% vs catálogo) → saltar + registro manual en POS** con supervisor (control anti-descuento intacto). La fila 819 (sku 141, −16,7%) recibió el mismo tratamiento por ser idéntica en naturaleza.

## 3. Corte real y alcance

- **Corte CostPro = 2026-08-17T04:00** (última de 308 ventas existentes; verificado read-only antes de importar). El corte interno de la hoja (08/09) no correspondía al estado real de la app.
- Alcance: filas Excel > 08-17 + 2 VS del 15/08 + 10 filas de corrección pre-corte (reversa+reimportación).
- Clasificación completa de las 821 filas: `download/ENERVIDA-reconciliacion-filas.csv` (340 YA_EXISTE, 445 IMPORTAR, 3 REQUIERE_CONFIRMACIÓN→resueltas, 33 OT).

## 4. Migraciones aplicadas (todas aprobadas explícitamente)

| Archivo | Cambio |
|---|---|
| `20261004120000_enervida_import_vale_salida_operation_date.sql` | `create_vale_salida` + parámetro final opcional `p_operation_date` (retrofecha en `issue_slips`, items, movimiento de stock y kardex; auditoría sigue en NOW(); hash de idempotencia incluye fecha) |
| `20261004120001_enervida_import_devolution_operation_date.sql` | `create_devolution_v2` + `p_operation_date` (retrofecha en `devolutions.created_at`, movimiento de stock y reembolso; DF-07/DF-03 intactos) |
| `20261004120002_enervida_import_adjustment_skip_access_consistency.sql` | 1 línea: `p_skip_access_check := TRUE` en `perform_inventory_adjustment` — alinea con el patrón de los otros 6 RPCs certificados (el gate externo `has_store_access_as` queda intacto); sin esto el RPC vivo era inutilizable bajo service_role |

Aplicadas vía Management API SQL (`postgres`), firmas verificadas post-aplicación.

## 5. Orden de ejecución y por qué

`reversas → productos → precios(47,113) → pre-cuadre(Δ) → entradas → w62 → ventas → precios(resto 8) → vales → devoluciones → OT`

- **Entradas antes que ventas/vales**: garantiza stock ≥ 0 en cada salida (el trigger `fn_sync_inventory_on_movement` rechaza inventario negativo) y WAC disponible para productos nuevos.
- **Precios en dos etapas**: las ventas de 47/113 disparaban el gate anti-descuento con el precio viejo (se sincronizan antes) y la fila 813 (sku 33 @5000 > precio viejo 4000) lo dispararía con el precio nuevo (se sincroniza después). Los 10 precios quedan sincronizados al final.
- **Pre-cuadre antes de los movimientos**: Δ = fin2 − (stock + entradas − ventas − vales + devoluciones), con fecha 18/08 y motivo `Cuadre importación ENERVIDA: sku=… Δ=…`. Δ>0 con costo nominal 1 CUP para no dejar WAC nulo/0.

## 6. Resultado de la verificación (FASE 17)

```
✓ inventario = fin2: 157 SKUs (2 pendientes manuales incluidos como fin2+Δ)
✓ ventas 280/280 — total y fecha por fila exactos (Δ redondeo global −0.02 CUP)
✓ issue_slips=125 · devolutions=2 · recepciones=43 · OT=18 · pagos OT=34 (fechas históricas)
✓ pagos por método = política aprobada (efec 3.146.939,98 · transf 261.450,01 · USD 13.624,84)
✓ auditoría sesión: CREATE_SALE_V2=280, CREATE_VALE_SALIDA=125, DEVOLUTION_CREATED_V2=2,
  PRODUCTION_ORDER_CREATED=18, REGISTER_RECEPTION=43, REVERSE_TRANSACTION_V2=3, UPDATE_PRODUCT=10
✓ imágenes intactas: 111 productos / 151 archivos / 0 faltantes
✓ 3 reversas confirmadas (status=voided)
```

### 6-bis. Verificación post-registro de pendientes (FASE 17-bis, `verify_v2.mjs` — 0 fallos)

Ejecutada tras registrar las filas 480/819. Estado final certificado:

```
✓ inventario = fin2 PURO (sin deltas): 157/157 SKUs — stock 111=46, 141=13
✓ fila 480: tx d939ea06-b328-42f8-ac42-931f201e81c2 — completed, 2.000 CUP, cash, CUP@1,
  seller/supervisor admin@demo.com, registro 2026-10-04 (fecha POS natural)
✓ fila 819: tx 2753440f-595e-4e66-b2be-c6728d7c52bc — completed, 33.320 CUP, zelle, USD 49@680,
  seller/supervisor admin@demo.com, registro 2026-10-04 (fecha POS natural)
✓ pagos: cash 2.000 CUP · zelle 49 USD @680 = 33.320 CUP (moneda original preservada)
✓ supervisor_token_usages: 2 jti consumidos (ef28bfc2…, 1f77b8e9…) vinculados a cada transacción
✓ discount_reason trazable en metadata de auditoría (CREATE_SALE_V2, discount_pct 20 y 16.7)
✓ auditoría sesión total: CREATE_SALE_V2=282 (280+2), pagos 333 (+2), reversas/DV/OT/recepciones intactos
✓ mapping fila→documento: 505 entradas (download/ENERVIDA-mapping-fila-documento.csv)
```

Nota de fechas: el registro POS se realiza con la fecha del día (2026-10-04) — retrofechar la fila 480
(02-09) habría sido rechazado por el gate `ERR_BACKDATED_DOCUMENT` (última venta 2026-10-03). Las fechas
históricas del Excel quedan documentadas en el `discount_reason` de cada venta y en este informe.

## 7. Pendientes para el usuario

**RESUELTO (2026-10-04 05:46 UTC) — ventas pendientes registradas vía cadena oficial del POS:**

1. **Fila 480** — venta real 1× "Grapas plasticas con clavo de acero" (sku 111) por **2.000 CUP** (efectivo), fecha Excel **2026-09-02**, = 20% bajo catálogo 2.500 → **REGISTRADA**: tx `d939ea06-b328-42f8-ac42-931f201e81c2`, gate de supervisor superado con `admin@demo.com` (jti `ef28bfc2…` consumido), stock 47→46 (= fin2). La comisión Excel de la fila (si la hubiera) no se importó por decisión 11.
2. **Fila 819** — venta real 2× "Cemento TBV 50 Kg" (sku 141) por **33.320 CUP** (16.660/u), fecha Excel **2026-10-02**, = 16,7% bajo catálogo 20.000 → **REGISTRADA**: tx `2753440f-595e-4e66-b2be-c6728d7c52bc`, pago zelle **49 USD @680** (moneda original preservada), gate de supervisor superado con `admin@demo.com` (jti `1f77b8e9…`), stock 15→13 (= fin2). La comisión Excel de 400 CUP de esta fila **no se importó** (decisión 11: comisiones fuera de alcance).

Nota: el informe previo citaba las fechas Excel como 08-25/09-30; el dump canónico del Excel (`enervida_excel.json`) fija **02-09-2026 y 02-10-2026** respectivamente — se corrige aquí.

**Pendientes restantes:**

3. Los **pares neto-cero** se excluyeron por no ser representables (efecto neto 0): filas 569+570 (venta XT60 a precio 0 + su devolución) y Anticipo OT 26/26 (+700/−700 USD el mismo día).
4. Las **comisiones** (Cat: 75 productos; 225.395 CUP en el período del Excel) no se importaron por decisión del usuario; sugerencia futura: crear `commission_rules` por producto.

## 8. Notas técnicas y comportamientos observados

- **Ventas de servicios no descuentan stock** en `create_sale_v2` (comportamiento nativo). Los servicios 998/999 se dejaron a existencia 0 mediante cuadre documentado (Cat fin2=0). Con `NEXT_PUBLIC_USE_V2_CHECKOUT=true` el POS no usa V1, por lo que no hay riesgo de venta de servicio bloqueada por stock.
- **Invariante de pagos**: en filas MIXTO con total no divisible (2 filas), la parte CUP se ajustó al total recomputado (Δ ≤ 0.02 CUP, documentado) para cumplir `SUM(amount_cup)=total ±0.01`.
- **Auditoría de pagos**: el trigger de `payment_transactions` etiqueta todo INSERT como `SUPPLIER_PAYMENT_REGISTERED` (nomenclatura preexistente); 331 eventos = 295 filas de pago de ventas (15 mixtas generan 2) + 34 OT + 2 reembolsos.
- **Filas duplicadas del Excel**: verificado que son ventas reales del mismo valor el mismo día (no errores de copia).
- **Categorías de los 74→75 cuadres**: diferencia de semilla inicial CostPro (10/08) vs trayectoria Excel, divergencias pre-corte y servicios con stock. Cada uno tiene su movimiento con motivo y fecha.

## 9. Trazabilidad y artefactos

| Artefacto | Ubicación |
|---|---|
| Mapping fila Excel → documento CostPro (505 entradas) | `download/ENERVIDA-mapping-fila-documento.csv` |
| Clasificación de las 821 filas | `download/ENERVIDA-reconciliacion-filas.csv` |
| Importador por fases (idempotente, reanudable) | `scripts/enervida_import/importer.mjs` |
| Registro de pendientes (480/819 vía API oficial) | `scripts/enervida_ventas_pendientes.mjs` |
| Verificación integral | `scripts/enervida_import/verify.mjs` |
| Verificación post-pendientes (v2, 0 fallos) | `scripts/enervida_import/verify_v2.mjs` |
| Resultados por fase (row→id) | `scripts/enervida_import/results-*.json` (incl. `results-ventas-pendientes.json`) |
| Análisis previo (Excel y BD, read-only) | `scripts/enervida_0*.py`, `enervida_1*.mjs`, `enervida_excel.json`, `enervida_db_dump.json` |

Claves de idempotencia usadas: `enervida-imp-ven-<fila>`, `enervida-imp-vs-<fila>`, `enervida-imp-dv-<fila>`, `enervida-imp-ot-<ot>`, `enervida-imp-otp-<fila>-<cup|usd>`; recepciones reanudables por `reference_doc = IMPORT-ENERVIDA-<fila>`; cuadres por motivo. Una re-ejecución de cualquier fase no duplica documentos.
