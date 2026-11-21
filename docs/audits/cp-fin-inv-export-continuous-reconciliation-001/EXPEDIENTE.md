# EXPEDIENTE — CP-FIN-INV-EXPORT-AND-CONTINUOUS-RECONCILIATION-001

**Fecha:** 2026-11-21 · **Repositorio:** Nardian90/Costpro (rama `main`, SHA `281d1df4d1f4f9cfd9edd2eb6f9ea0788cb91c5a`)
**Tienda objeto:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) · **Generación activa:** GEN-2 (`7db60abf-401c-4ec9-ae36-4d49b8e94d42`)

---

## 1. Diagnóstico de la contabilidad (OBJETIVO A)

### 1.1 Verificación del estado real

- SHA de `main` verificado por clonación íntegra (2.372+ commits, 8.074 archivos).
- **Limitación de entorno**: esta ejecución NO tuvo credenciales de Supabase/Vercel/GitHub-push (solo lectura pública del repo). Producción y CostproE2E no fueron accesibles desde el sandbox: las cifras del corte 20/11/2026 se verificaron aritméticamente contra la evidencia registrada (expedientes CP-FIN-003/004, gen2-validate.json, dashboard-gen2.json) y se entregan **scripts SQL de solo lectura** para la re-verificación contra producción por el propietario (§4 de este expediente).
- La migración SQL fue validada con el parser real de PostgreSQL (libpg-query): 35 + 6 statements OK, cuerpos PL/pgSQL OK.

### 1.2 Puente de conciliación del mayor ACT_INVENTARIO (corte 20/11/2026)

| Componente | Importe CUP | Fuente |
|---|---:|---|
| Recepciones (débito, `total_cup` de receipt_items) | 2,961,795.90 | mayor GEN-2 |
| Devoluciones (débito, `costo_devuelto_cup`) | 2.00 | mayor GEN-2 |
| Anulaciones de ventas (débito, compensatorio) | 18,226.61 | mayor GEN-2 |
| Ventas (crédito, `costo_productos_cup` = Σ cost_at_sale congelado) | 4,525,083.91 | mayor GEN-2 |
| Vales de salida (crédito, `total_cost` al confirmar) | 810,567.06 | mayor GEN-2 |
| Ajustes (crédito, `valor_faltante_cup`) | 1.00 | mayor GEN-2 |
| **Saldo del mayor** | **−2,355,627.46** | **= débitos − créditos, exacto al céntimo** |

Verificado con código (verificación Decimal): 2,980,024.51 − 5,335,651.97 = −2,355,627.46. **No hay diferencia aritmética sin explicar en el propio mayor.**

### 1.3 Diferencia de 23.57 CUP entre validación GEN-2 y RPC actual — EXPLICADA

- Validación GEN-2 (2026-11-20 16:24 UTC): ACT_INVENTARIO = −2,355,603.89 y GAS_COSTO_VENTAS = 4,506,831.73.
- Corte de producción (misión): −2,355,627.46 y créditos por ventas 4,525,083.91.
- Delta = (18,226.61 + 2.00) − (4,525,083.91 − 4,506,831.73) = 18,228.61 − 18,252.18 = **−23.57 exacto**.
- Causa: movimientos operacionales **posteriores al snapshot de validación** (nuevas ventas por 18,252.18 de COGS, una anulación de venta que devuelve 18,226.61 y una devolución de 2.00). El ajuste de 1.00 ya existía en la validación (GAS_PERDIDA_INV = 1 presente en gen2-validate.json). **No es un error del motor**: las estadísticas de validación son un punto en el tiempo; la RPC lee la generación viva. El comportamiento es correcto y trazable.

### 1.4 Causa raíz del inventario negativo (demostrada)

1. **Origen**: la recepción FAC-VITALLCONS-001 importó precios de venta en CUP como costos en USD → recepción original de 192,039,436.00 CUP → contaminación del WAC de la era.
2. **Rectificaciones** (misiones 002/003/009/013/014, ejecutadas en producción): RECT-1 151,299,851.00 + C1 40,733,723.50 + RECT-013 33,842,533.00 + cadena posterior → valor final de la recepción corregida **5,861.50 CUP**; `receipt_items`, `receipts.total_cost`, kardex y `wac_change_log` corregidos; WAC actual limpio (82 productos con stock por 6,981.1 u valorizados en 594,747.87 CUP).
3. **El residual**: las ventas y vales de la era contaminada conservan sus costos **congelados** (`transaction_items.cost_at_sale`, DF-02: WAC snapshot al vender; vales a `cost_average` de su momento). La re-derivación pura de GEN-1/GEN-2 re-deriva desde esos snapshots (política documentada en CP-FIN-003 §5.1: no reescribir transacciones históricas).
4. **Resultado**: débitos de recepción ya corregidos (2.96 M) vs créditos a costos congelados de la era contaminada (4.53 M + 0.81 M) → saldo −2,355,627.46 con brecha operacional-contable estable de **2,950,375.33 CUP** (594,747.87 − (−2,355,627.46)), idéntica antes y después de los movimientos post-validación (la operación neta fue valor-neutra: −23.57 en ambas fuentes).
5. **Decisión contable respetada**: SIN asientos artificiales ni revalorización retroactiva del histórico. El residual queda IDENTIFICADO y cuantificado (misión §4: «si un residual no puede determinarse documentalmente, debe permanecer identificado como pendiente»). Su descomposición por SKU/documento se produce con los scripts de auditoría (§4) contra producción.

### 1.5 Defecto latente corregido (PR A §7 de la migración)

La regla `DEVOLUCION_VENTA` v3 (CP-FIN-004, línea d-credit) referencia la categoría **PAS_CREDITO_TIENDA que NO EXISTE** en `fin_categories` (la semilla crea `PAS_ANTICIPOS_CLI`). Una devolución pagada con crédito de tienda fallaría por FK → quedaría sin asiento (fin_posting_errors). Corregido con la regla **v4** (misma lógica, cuenta real), idempotente por marcador de notas, con sanity check fail-closed que impide reactivar una regla con la categoría inexistente.

## 2. Implementación (OBJETIVO B — PR A `feat/cp-fin-reconciliation-tab-001`)

- **Migración** `20261121230000_cp_fin_reconciliation_operativa_contable.sql`:
  - `fin_get_reconciliation` — matriz por cuenta en UNA sentencia (snapshot consistente): 14 cuentas de corte + 10 de período conciliables + resto del catálogo como NO CONCILIABLE; lado operacional SIEMPRE desde tables operativas (products, kardex, payment_transactions, receipts, transactions, devolutions, issue_slips, received_services, payrolls, commission_payments, cash_flow_documents, production_orders, store_credit_ledger, fin_opening_balances) — **nunca fin_movements** (prohibición de circularidad).
  - Convención documentada: `Diferencia = operacional − contable` (naturaleza-aware).
  - Estados CONCILIADO/DIFERENCIA/ALERTA/INCOMPLETO/NO_CONCILIABLE/PENDIENTE con **tolerancias por cuenta** (`fin_reconciliation_config`, sembrada; monetarias exactas 0.01/1.00 CUP; inventario 100 CUP/1%; períodos 100 CUP/0.5%).
  - Hallazgos globales: documentos sin asiento por tipo, asientos con documento inexistente, ventas con fallback USD.
  - Detalle de inventario (§5.2): productos positivos/cero/negativos, cantidad, WAC, valor kardex, costo documental, sin costo, top-15 productos, pendientes y sin respaldo.
  - `fin_reconciliation_snapshot_save` (recalcula server-side, exige `can_manage_store_as`) + `fin_reconciliation_snapshots` (RLS lectura por membresía, escritura solo service_role) + `fin_reconciliation_history` — evolución histórica (§5.7).
  - RLS + REVOKE anon/authenticated + GRANT service_role + sanity checks fail-closed (§8).
- **API** `/api/fin/reconciliation` (GET ejecutar/historial + POST snapshot con Zod, withAuth, canManageStore).
- **UI** `ReconciliationTab.tsx`: pestaña «Conciliación» en Estados Financieros con ejecución bajo demanda (PENDIENTE inicial), barra de ejecución (fecha/hora, corte, generación, período, frescura de fuentes), resumen, filtros (estado/clase/búsqueda), matriz con estados y %, detalle expandible con metodología + drill-down reutilizado (CategoryDetailPanel embebido), snapshot + historial. Selector de tienda = el selector global del terminal (patrón de todas las vistas financieras).
- **Tests**: 17 de componente/migración (estado PENDIENTE, ejecución, alerta con saldos positivos, filtros, detalle, reintento, re-ejecución con refreshKey; contrato SQL: guard, RLS, ACL, no-circularidad, tolerancias, sanity).

## 3. Implementación (OBJETIVO C — PR B `feat/cp-fin-exports-excel-pdf-001`, apilada sobre A)

- **Migración** `20261121230100_cp_fin_category_detail_export_fields.sql` (aditiva): `exchange_rate` por fila + `generacion`/`saldo_inicial`/`clase` en la respuesta de `fin_get_category_detail`.
- **`movement-exporters.ts`**:
  - `fetchAllCategoryMovements` — TODAS las páginas (200/página) hasta igualar el total del servidor; integridad obligatoria: duplicados → aborta; cuenta ≠ total → aborta; **nunca archivo parcial**.
  - **Excel** (hoja «Movimientos»: 19 columnas, importes numéricos, `amount_origin` nulo → celda vacía, nunca inventado; hoja «Resumen»: tienda, cuenta, código, clase, período/corte, generación, cantidad, saldo inicial, débitos, créditos, **saldo final reconstruible** por secuencia contable, fecha).
  - **PDF** (jsPDF+autoTable A4 horizontal): encabezado (tienda, cuenta, código, período, generación, fecha), tabla con encabezados repetidos por página, negativos en rojo, resumen final (saldo inicial/débitos/créditos/saldo final/nº movimientos), pie con numeración. **Mismo conjunto de datos que el Excel** para igual cuenta/período/generación.
- **`ExportPeriodDialog.tsx`** (§7.1): diálogo obligatorio con Desde/Hasta (ambas requeridas, desde ≤ hasta, tope hoy), Cancelar/Generar PDF; el PDF NO se genera al pulsar el botón.
- **`CategoryDetailPanel.tsx`**: botones «Exportar movimientos a Excel» y «Exportar movimientos a PDF» (conserva drill-down y «Ver más» intactos; los PDF de Situación/Rendimiento no se alteran).
- **Tests**: 8 de integridad de exportación y diálogo (paginación 500>200, integridad, duplicados, <20, validación de fechas, cancelación, rango del PDF consultado del servidor).

## 4. Scripts de auditoría para producción (solo lectura)

`supabase/audit/cp-fin-inv-reconciliation-001/` (copiados también a los entregables):
- `01_verificacion_mayor_inventario.sql` — puente del mayor por evento/documento + identificación de los movimientos post-validación que explican los 23.57 CUP (IDs de documento).
- `02_descomposicion_brecha_sku.sql` — brecha 2,950,375.33 por SKU: costo congelado vendido/vale vs costo corregido; kardex vs mayor por producto.
- `03_cobertura_documental.sql` — documentos postables sin asiento y asientos sin documento por tipo (generación activa).
- `04_integridad_fuentes.sql` — kardex vs inventory vs products; costos cero/no verificables; recibos activos vs CxP.
- `README.md` — política de ejecución (solo lectura; REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS; ventana y límites de log).

## 5. Gates ejecutados (evidencia)

- **Unit/component/migration tests**: 32/32 PASS (25 misión + 7 replay).
- **SQL**: libpg-query parse OK ambas migraciones; manifiesto de replay regenerado (192 migraciones) y `--check` MATCH sin deriva; test de replay actualizado 190→192.
- **TypeScript**: `tsconfig.mision-recon.json` — 0 errores en los archivos de la misión (3 errores preexistentes en archivos ajenos: ParticleBackground/CostSheetFlatTable/CameraBarcodeScanner, presentes en `main`).
- **Pendientes en el entorno del propietario** (requieren credenciales): `security-contract-test.cjs` (LIVE), `apply-migration.mjs --target e2e`, E2E aislado (`e2e/cpfin-reconciliation-tab.spec.ts`), ESLint/build completos (RAM del sandbox insuficiente para el build completo).

## 6. Límites respetados

Producción en solo lectura (sin conexión disponible; nada ejecutado contra ella). Sin merge, sin migraciones productivas, sin despliegues, sin secretos. El propietario conserva merge, migraciones y despliegue.
