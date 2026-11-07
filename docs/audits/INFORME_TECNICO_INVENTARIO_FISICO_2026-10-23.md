# INFORME TÉCNICO — Módulo de Inventario Físico, Conciliación y Ajustes Documentales

**Proyecto:** COSTPRO 4 Multitienda (repo `Nardian90/Costpro`)
**Misión:** 2026-10-23 · **PR:** #1456 · **Rama:** `feat/physical-inventory-module-20261023` · **Commit:** `9d20ec389`
**Autor:** Agente de desarrollo (Z.ai) · **Entorno de ejecución:** sandbox Linux 4GB RAM, proyecto Supabase `wthkddeleylijmonclxg` (dev/demo)

---

## 1. Diagnóstico de la arquitectura existente

Antes de implementar se auditó el repositorio completo (40+ migraciones relevantes, superficie de funciones certificada en `20260916000001_rem_inv_6`, rutas API y vistas UI):

| Área | Hallazgo | Decisión |
|---|---|---|
| **Existencias** | Modelo híbrido: `inventory` (primary, por tienda/producto, con `version`) + `products.stock_current` (derivado por trigger). Sin tabla `product_stores`: el catálogo ya es por tienda (`products.store_id`). | Reutilizar `inventory` como fuente de saldo actual |
| **Kardex** | `stock_movements` = ledger inmutable (RLS deny-write a clientes); `kardex_entries` escrita SOLO por el trigger `trg_auto_kardex`. Escritor canónico: `register_stock_movement/12` (service_role). | Todas las variaciones de stock del módulo pasan por el mecanismo oficial — cero escrituras directas |
| **Ajustes documentales** | `inventory_adjustments` + `inventory_adjustment_items` con ciclo `pending → confirmed/reversed/voided`; `confirm_inventory_adjustment` aplica delta vía `register_stock_movement`. RPCs de reversión/duplicación existentes. | Los ajustes del módulo se generan como BORRADORES `pending` en estas MISMAS tablas (sin vista alternativa) |
| **physical_counts** | Infraestructura de conteo previa (2026-07) EXISTE pero sin uso por UI y sin: fecha de corte real (tomaba `stock_current` al crear), alcance, ceguera, vinculación con ajustes, hojas versionadas, importación validada ni estados de autorización. | Tablas NUEVAS `physical_inventories*` (justificado en §Modelo); `physical_counts` no se toca |
| **Roles/RLS** | Membresías por tienda (`user_store_memberships`), roles `admin/manager/encargado/clerk/warehouse/usuario/costo`, helpers `has_store_access`, `has_store_role`, `is_admin` en BD. | Autorización en 3 capas: API wrapper → RPC (barrera final) → RLS |
| **Navegación** | SPA `/?view=<id>`; fuente única `navigation-definition.ts` → Sidebar/CommandPalette/breadcrumbs derivados. | Entrada nueva bajo `almacen_gestion` siguiendo el patrón exacto |
| **PDF/Excel** | `jspdf`+`autotable` lazy con preview `bloburl`+iframe (patrón `buildIpvVentasPdf`); `@e965/xlsx` lazy con patrón de importación en 2 pasos (`CatalogImportDialog`). | Replicados al 100% |
| **Bug preexistente** | `InventoryAdjustmentsView` tenía el embed `creator:profiles(full_name)` AMBIGUO (PGRST201) desde que v2.2 añadió el FK `confirmed_by` — **la vista no cargaba documentos**. | Corregido con hint `!fk_created_by` (parte del PR) |

## 2. Diseño y flujo de trabajo implementado

**Ciclo de vida** (validado por trigger `fn_validate_pi_transition`, igual que el patrón documental existente):

```
draft → prepared → in_progress → counted → in_reconciliation →
pending_authorization → conciliated → closed          (+ voided antes de conciliar)
```

**Flujo operativo completo:**
1. **Crear** (admin/manager/encargado): tienda, fecha de corte (≤ ahora), descripción, responsable, alcance (catálogo completo / por categoría / selección), modo ciego, observaciones → estado `draft`.
2. **Preparar**: genera las líneas y **congela la existencia teórica a la fecha de corte**:
   - corte reciente (≥ ahora−5 min) → `inventory.quantity` (fuente primaria), `theoretical_source='inventory'`;
   - corte histórico → `Σ stock_movements.quantity_change (created_at ≤ corte)` (patrón canónico de `useProductKardex`); si el ledger presente no concuerda con `inventory` → `theoretical_source='ledger_drift'` y la conciliación lo ADVIERTE — **nunca se inventa el saldo histórico** (limitación documentada).
   - Snapshot verificable en `snapshot_meta` (método, fecha, líneas, deriva).
3. **Iniciar conteo** (más roles: +warehouse/clerk).
4. **Contar**: manual (captura rápida con autosave discreto y bloqueo optimista por línea) o **importación Excel** con validación previa. Campo vacío = pendiente; 0 explícito = contado en cero. Progreso persistido y reanudable.
5. **Completar** (admite pendientes solo con aceptación explícita).
6. **Conciliar** (admin/manager/encargado): diferencias = `contado − teórico al corte`, revisión de motivos por línea, indicadores (match/faltantes/sobrantes/deriva/post-corte).
7. **Autorizar y generar ajustes**: borradores SEPARADOS por faltantes (`STOCKTAKE_SHRINKAGE`) y sobrantes (`STOCKTAKE_SURPLUS`) con `expected = saldo actual` (bloqueado) y `counted = cantidad física` → al confirmar, el stock queda exactamente en lo contado. **La generación no toca existencias.**
8. **Confirmar/aplicar** desde el propio módulo o desde Ajustes Documentales (misma RPC oficial `confirm_inventory_adjustment`, que ahora referencia «Ajuste por inventario físico IF-XXXX» en el kardex).
9. **Cerrar** (admin/manager): bloqueado mientras haya ajustes vinculados `pending`. Rectificación de un conciliado: reversión del ajuste (nunca reescritura de historia).

## 3. Archivos y componentes

**Nuevos (backend):**
- `supabase/migrations/20261023000000_create_physical_inventory_module.sql` (1.362 líneas: 5 tablas, 4 triggers, 14 RPCs, RLS, grants)
- `src/app/api/physical-inventory/route.ts` (GET lista + POST crear)
- `src/app/api/physical-inventory/[id]/route.ts` (detalle ciego-seguro)
- `src/app/api/physical-inventory/[id]/transition/route.ts` (8 transiciones)
- `src/app/api/physical-inventory/[id]/count/route.ts` (lotes; 409 conflictos)
- `src/app/api/physical-inventory/[id]/review/route.ts` · `reconciliation/route.ts` · `sheet/route.ts`
- `src/lib/physical-inventory-access.ts` (autorización por documento)

**Nuevos (frontend):** `src/components/views/terminal/views/physical_inventory/` → `PhysicalInventoryView.tsx`, `PhysicalInventoryDetail.tsx` (4 pestañas), `CreatePhysicalInventoryModal.tsx`, `CountSheetModal.tsx`, `ImportCountDialog.tsx`, `pi-pdf.ts`, `pi-excel.ts`, `pi-types.ts`.

**Modificados:** `navigation-definition.ts` (+entrada menú, +VALID_VIEWS), `src/store/index.ts` (ViewType), `TerminalShell.tsx` (case+dynamic), `viewRegistry.ts`, `view-tips.ts`, `InventoryAdjustmentsView.tsx` (etiqueta PI persistida + FIX PGRST201).

**Pruebas/evidencia:** `src/__tests__/components/physical-inventory/pi-pdf.test.ts`; `scripts/pi-smoke-test.cjs`, `pi-smoke-test-2.cjs`, `pi-e2e-functional.cjs` (+ JSON de resultados); `audit-evidence/physical-inventory/` (11 capturas).

## 4. Modelo de datos

| Tabla | Contenido |
|---|---|
| `physical_inventories` | Cabecera: `pi_number` IF-YYYY-##### (trigger por tienda/año), `cutoff_date`, alcance (`scope_type` + `scope_category_names` texto + `scope_products`), `blind_mode`, `snapshot_meta`, indicadores derivados por trigger, y TODOS los momentos separados (creación/inicio/conciliación/autorización/cierre/anulación con usuario y timestamp) |
| `physical_inventory_items` | Líneas: `line_number`, teórica congelada (`theoretical_qty`/`unit_cost`/`source`), `counted_qty` NULL=pendiente, `difference` GENERATED, estado, revisión, `updated_at` (bloqueo optimista) |
| `physical_inventory_count_log` | Historial inmutable de capturas: acción, valor anterior→nuevo, origen (manual/excel), usuario, timestamp |
| `physical_inventory_sheets` | Versiones de hojas PDF: seq, modo, líneas, generador |
| `physical_inventory_adjustments` | Vínculo PI↔ajuste con `kind` (shortfall/surplus) |
| `inventory_adjustments` (ALTER) | + `source_physical_inventory_id` (FK) — etiqueta verificable, sin texto manual |

**RLS (5 tablas, ENABLE + policies):** SELECT por membresía de tienda; INSERT/UPDATE solo roles privilegiados; **ciego real**: en `blind_mode` la policy SELECT de items EXCLUYE a no privilegiados (su única vía es la RPC que omite teóricas); DELETE denegado en todo (historial intacto). `EXECUTE` revocado a `anon`.

## 5. Importación Excel y generación de PDF

**Excel:** plantilla oficial generada por la app (hoja Información con instrucciones + hoja Conteo con `Nº/ID Línea/Código/Producto/Unidad/[Teórica informativa]/Cantidad Física/Observaciones`); en ciego SIN teóricas. Importación: identificación por **ID de línea estable** (nunca por nombre), informe de validación (válidas/errores/duplicadas/ajenas/sin cantidad/ceros explícitos/conflictos), confirmación en 2 pasos con reemplazo explícito de valores ya capturados, y aplicación por lotes transaccionales vía RPC (un lote fallido no deja estado parcial).

**PDF (jsPDF+autotable lazy):** A4 vertical, encabezado completo en página 1 y compacto repetido, numeración «Página X de Y», casillas cómodas (minCellHeight 22), bloque de firmas, pie con versión auditable (registrada en BD ANTES de generar) y previsualización fiel (`bloburl`+iframe del MISMO documento). **Modalidad ciega verdaderamente ciega**: sin columna teórica, sin diferencias y sin valores — verificado por test unitario a nivel de bytes (`expect(text).not.toContain('(966)')`).

## 6. Evidencia de conteo ciego

- **BD**: policy SELECT de items bloquea a warehouse/clerk en blind_mode (probado: 0 filas en SELECT directo).
- **RPC**: `get_physical_inventory_count_lines` devuelve líneas SIN `theoretical_qty/difference/theoretical_source` para no privilegiados (claves verificadas).
- **RPC**: `get_physical_inventory_reconciliation` y `register_physical_inventory_sheet(mode='with_theoretical')` RECHAZADOS a no privilegiados en modo ciego (400).
- **PDF/Excel**: sin teóricas en plantilla ni hoja (test de bytes 4/4).
- **UI**: el contador no privilegiado no ve columnas teóricas (showTheoretical=false).

## 7. Ejemplos de diferencias y ajustes (datos reales de prueba)

| Escenario | Teórica al corte | Contada | Dif. | Ajuste generado | Tras confirmar | Kardex |
|---|---|---|---|---|---|---|
| B — Faltante | 11 | 9 | −2 | `STOCKTAKE_SHRINKAGE` (IF-2026-00017) | 11 → 9 ✓ | `adjustment −2 · «Ajuste por inventario físico IF-2026-00017»` |
| C — Sobrante | 3 | 6 | +3 | `STOCKTAKE_SURPLUS` (IF-2026-00018) | 3 → 6 ✓ | entrada por ajuste (no venta/recepción) |
| A — Sin diferencias | 13 | 13 | 0 | ninguno (cerrado directo) | — | — |
| H — Fraccionario | 2.5 | 2 | −0.5 | shortfall decimal (IF-2026-00022) | 2.5 → 2 ✓ | −0.5 exacto |
| F — Corte histórico | 212 (ledger) | 212 | 0 | ninguno; 2 mov. post-corte neto −3 visibles sin diferencias falsas | — | — |

## 8. Resultados de las pruebas

| Prueba | Resultado | Detalle |
|---|---|---|
| Smoke SQL (flujo completo vía REST con usuario real) | **23/23** | `scripts/pi-smoke-result.json` |
| Ceguera BD + concurrencia optimista + roles | **15/15** | incl. conflicto 409 sin sobrescritura |
| **Escenarios A–H de la misión vía API de la app** | **36/36** | `scripts/pi-e2e-result.json` |
| Suite unitaria completa del repo (vitest) | **3794 OK / 0 fallos** | 234 archivos (2 skipped preexistentes) |
| PDF builder unitario | **4/4** | ciego a nivel de bytes |
| TypeScript (`tsc --noEmit`) | **sin errores** | |
| ESLint | **0 errores** | warnings de estilo preexistentes (1.402 en todo el repo) |
| Verificación navegador (agent-browser) | **OK** | menú, listado, detalle 4 pestañas, creación real desde UI, PDF preview blob, etiqueta en Ajustes + navegación; consola sin errores |
| `next build` | **no completado en sandbox** | OOM-killed (sandbox 4GB RAM; verificado en dmesg). El CI de GitHub ejecuta el build igual que en main (`NODE_OPTIONS=--max-old-space-size=4096`). Sin cambios de configuración de build en este PR. |

## 9. Limitaciones y riesgos pendientes

1. **`next build` local**: no verificable en el sandbox por RAM (arriba). Cobertura alternativa: tsc + suite completa + compilación dev de todas las rutas nuevas (HTTP 200) + CI en el PR.
2. **Deriva ledger↔inventory en cortes históricos**: si un producto tiene saldo sembrado sin movimientos, la reconstrucción histórica se marca `ledger_drift` y se advierte en conciliación; NO se resuelve automáticamente (decisión de diseño — no inventar saldos).
3. **Movimientos durante el conteo**: no se bloquea la tienda (decisión de la misión: no bloquear globalmente). La conciliación muestra los movimientos post-corte por producto y el ajuste parte del saldo ACTUAL para dejar el stock en lo contado (regla temporal documentada en la UI). Oportunidad futura: control granular de movimientos opt-in.
4. **Ventana generación→confirmación**: si hay movimientos entre la generación del borrador y su confirmación, el delta documental se aplica sobre el stock del momento de confirmar (comportamiento del flujo documental EXISTENTE, respetado).
5. **Cierre de caja de la numeración**: `IF-YYYY-#####` usa COUNT por tienda/año (patrón `physical_counts`); bajo concurrencia extrema podría duplicarse número — mismo riesgo aceptado en los documentos existentes del sistema.
6. **Membresía demo reactivada**: para las pruebas se reactivó la membresía `warehouse` de `almacen@demo.com` en TIENDA CENTRAL (usuario fixture de demostración, tienda de pruebas).

## 10. Estado real del despliegue

- **Servidor:** reactivo bajo **pm2** (`ecosystem.config.js`: costpro + 2 pollers, `pm2 save` persistido), `bun server.ts` en puerto 3000, HTTP 200, logs limpios.
- **Base de datos:** migración **aplicada al proyecto Supabase en vivo** (`wthkddeleylijmonclxg`) vía Management API con el método oficial del repo (`scripts/apply-sql-migration.js`). Es idempotente (re-aplicable segura).
- **Datos de prueba dejados en BD (TIENDA CENTRAL, tienda demo):** inventarios IF-2026-00001…00022 con sus ajustes confirmados/revertidos/anulados según cada escenario — son la EVIDENCIA auditable de las pruebas; no se eliminaron para no falsificar el rastro. Los productos afectados quedaron con el stock exactamente contado en cada escenario (verificado).
- **PR:** #1456 abierto hacia `main` — https://github.com/Nardian90/Costpro/pull/1456 (1 commit, 40 archivos).
