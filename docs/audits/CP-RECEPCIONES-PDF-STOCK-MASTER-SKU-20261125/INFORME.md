# INFORME DE AUDITORÍA Y CORRECCIÓN — CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001

**Misión:** Corrección integral de Recepciones: PDF sin valores, saldo en existencia y consecutivo del Catálogo Maestro
**Tienda de los casos reportados:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`, tenant `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`)
**Fecha:** 2026-11-24/25 · **Rama:** `fix/recepciones-pdf-stock-sku-20261124`
**Método:** auditoría con datos reales de producción (solo lectura) → diagnóstico → corrección controlada → validación en BD aislada → aplicación única en producción → pruebas y evidencia.

---

## 1. Causa raíz de cada incidencia

### Incidencia 1 — PDF de recepciones sin opción de valores
El generador del modelo oficial SC-2-04 (`src/lib/legal/sc204.ts`, jsPDF + autoTable) imprimía SIEMPRE las columnas «Precio unitario» (27 mm), «Importe» (27 mm) y el bloque «IMPORTE TOTAL DEL MODELO». No existía ningún mecanismo de supresión. No había defecto de datos: era una capacidad ausente de representación.

### Incidencia 2 — «Saldo en existencia según almacén» muestra «s/d»
Cadena causal verificada con datos reales:

1. La doctrina del saldo (`src/lib/inventory/saldo-posterior.ts`, misión documentos SC-2-04/SC-2-12 del 2026-11-07) exige el **enlace documental** `stock_movements.notes = receipt.id` ∧ `movement_type='purchase'`; sin movimientos propios y sin estado `pending` → `fuente='limitacion'` → el documento imprime «s/d» con nota al pie.
2. La recepción **cd921832-18e5-44da-a4d2-a6d17a16018b** (ENT-000004-2026, $277.00, 24/11 11:56 a.m.) se creó **pendiente** a las 16:56:15 UTC y se **confirmó** a las 18:08:04.344527 UTC con `confirm_pending_reception`.
3. La versión certificada de esa RPC (migración `20260916000001`, aún vigente) inserta los movimientos de la confirmación con `reference_doc='Confirmacion recepcion'` y **`notes = NULL`** — a diferencia de `register_reception`, que sí escribe el enlace.
4. El inventario SÍ se actualizó (los 10 productos recibieron sus 10 movimientos de entrada a las 18:08:04.344527, instante EXACTO de `receipts.updated_at`), pero al faltar el enlace, el SC-2-04 imprimía «s/d» **aunque el sistema podía determinar el saldo real**.
5. La recepción 47380573 (creada directamente `active` por `register_reception`) tiene sus 16 movimientos correctamente enlazados → por eso su saldo sí se calcula.

Alcance global medido: 113 movimientos huérfanos «Confirmacion recepcion» sin `notes` (3 lotes): 88 del 2026-07-01 12:00 UTC (importación histórica inicial SIN recepción asociada — no enlazables), 2 del 26/10 (recepción 41b16484) y 10 del 24/11 (cd921832). Los dos lotes recientes emparejan **sin ambigüedad** (instante exacto + misma tienda + multiset producto/cantidad completo).

### Incidencia 3 — Códigos fuera del consecutivo del Catálogo Maestro
1. **No existía ninguna secuencia centralizada de códigos.** El consecutivo REAL del Catálogo Maestro del tenant es numérico contiguo: **1..256 completo** (+ outliers históricos 998/999) → el siguiente código oficial era **257**.
2. La ruta de alta manual en Nueva Recepción (`useReceptionState.ts:840`) generaba `AUTO-<timestamp36>-<seq36>` cuando el usuario dejaba el SKU vacío (para esquivar `ERR_NEW_PRODUCT_INVALID` de `register_reception` y `ERR_PRODUCT_WITHOUT_SKU` del clasificador en tienda conectada).
3. El escritor canónico `resolve_reception_import_rows` creaba el maestro con ese SKU **literal del cliente**.
4. Resultado verificado en BD: **17 maestros AUTO-*** fuera del consecutivo — 16 de la recepción 47380573 (creados 24/11 13:41 local) + 1 «Cable para Ecoflow» del 23/11 — todos con su fila local vinculada en ENERVIDA y su existencia registrada. Sin duplicados ni huérfanos; el daño es exclusivamente el consecutivo.
5. Segundo generador equivalente en el flujo de **borradores** (`useReceptions.ts:570`): `SKU-${Date.now()}-...` en el fallback local client-side, además de sincronización de maestros desde el cliente (`create_master_product`).

---

## 2. Archivos, componentes, servicios, funciones SQL y tablas involucradas

**Migraciones nuevas (aplicadas):**
- `supabase/migrations/20261125120000_cp_recep001_confirm_notes_link.sql` — `confirm_pending_reception(uuid,uuid,timestamptz)` (escribe `notes=receipt_id`; paridad con `register_reception`), `cp_recep001_backfill_confirm_notes(boolean)` (backfill conservador + auditado), guard `CP-RECEP001-GUARD`. Tablas: `stock_movements`, `receipts`, `receipt_items`, `audit_logs`.
- `supabase/migrations/20261125120100_cp_recep001_master_sku_consecutivo.sql` — `next_master_catalog_sku(uuid)` (generador OFICIAL, `pg_advisory_xact_lock` por tenant, regla prefijo contiguo 1..N → N+1 con salto defensivo contra `master_products` y `products` del tenant), `assign_next_catalog_sku(uuid)` (RPC fina para borradores de tiendas no conectadas), redefiniciones parcheadas de `fn_classify_reception_import_row` (filas sin SKU → `auto_sku`, ya no error), `resolve_reception_import_rows` (asignación server-side + `sku_assigned_by_server` + `auto_skus_assigned`), `register_reception` (new_product sin SKU → código oficial; tenant resuelto antes de asignar), guard `CP-RECEP001-SKU-GUARD`.

**Frontend:**
- `src/lib/legal/sc204.ts` — `Sc204ExportOptions`, `buildSc204ModelData(source, options?)`, `renderSc204Pdf` (tabla condicional 7/5 columnas con redistribución de anchos; totales solo con valores; nota de pie «Documento emitido sin valores económicos»), `exportSc204ForReceipt(receipt, storeId, options?)`.
- `src/components/views/terminal/views/receptions/useReceptionsHistoryView.ts` — estado `includeSc204Values` (default ☑) y paso de opciones.
- `src/components/views/terminal/views/receptions/ReceptionDetailsModal.tsx` — checkbox visible «Incluir valores económicos» junto al botón «Exportar SC-2-04 (PDF)» (etiqueta, aria-label y texto del botón cambian con el modo).
- `src/components/views/terminal/views/receptions/ReceptionsHistoryView.tsx` — cableado de props.
- `src/components/views/terminal/views/inventory/useReceptionState.ts` — **generador AUTO-* eliminado** (SKU opcional con dedup por nombre para filas sin código); mapeo del escritor canónico POR ÍNDICE (`resolvedByLocalId` por `local_id`; `resolvedByIndex` con `sku` asignado) y adopción del código oficial asignado; hint de UI.
- `src/hooks/api/useReceptions.ts` (`useSavePendingReception`) — el flujo de borradores resuelve con el MISMO escritor canónico; el zoo client-side (masterBySku + `create_master_product` + `SKU-${Date.now()}`) fue eliminado; fallback local (tienda no conectada) pide el código canónico a `assign_next_catalog_sku`; fail-closed ante filas bloqueadas.
- `src/components/views/terminal/views/inventory/ProductReceptionView.tsx` — hint «Sin SKU: el sistema asigna el siguiente código disponible del Catálogo Maestro.»

**Tests:**
- `src/__tests__/migrations/cp-recep001-migrations.test.ts` (nuevo, 12 pruebas: contrato estático de ambas migraciones + frontend de un solo generador).
- `src/__tests__/lib/sc204-sin-valores.test.ts` (nuevo, 6 pruebas del modelo con/sin valores).
- `src/__tests__/hooks/useSavePendingReception-tenant-rls.test.tsx` (adaptado al escritor canónico; conserva la auditoría original de tenant_id).
- `src/__tests__/e2e/replay-unblock-create-sale-v2.test.ts` (total incluidos del manifiesto 204 → 206).
- `scripts/e2e/cp-recep001-apply-e2e.mjs` (nuevo; aplicador E2E con guard de aislamiento, pre/smoke/post).
- `scripts/dev-recep001-pdf-evidence.ts` (nuevo; evidencia PDF real con/sin valores).
- `scripts/lib/writers.manifest.json` (+1 entrada isolationProtected) y `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (regenerado, 206 migraciones).

---

## 3. Correcciones implementadas

| # | Corrección | Naturaleza |
|---|---|---|
| 1 | Opción visible ☑/☐ «Incluir valores económicos» en la exportación SC-2-04; sin valores omite columnas Precio unitario/Importe, TODOS los totales y redistribuye anchos (Descripción auto + Saldo 42 mm); nota discreta en el pie | SOLO representación (jsPDF); registros intactos |
| 2a | `confirm_pending_reception` escribe `notes=receipt_id` (futuro) | SQL, servidor |
| 2b | Backfill conservador y auditado: solo lotes con emparejamiento inequívoco (instante exacto + tienda + multiset completo 1-a-1); 12 movimientos enlazados; 101 históricos sin candidata quedan «s/d» JUSTIFICADO | SQL, datos |
| 3a | `next_master_catalog_sku`: generador ÚNICO, servidor, transaccional (advisory lock por tenant), forward-only (prefijo contiguo 1..N → N+1), salto defensivo de colisiones | SQL |
| 3b | Asignación server-side en `resolve_reception_import_rows` (maestros nuevos sin SKU) y `register_reception` (new_product sin SKU, ruta legacy) — el resultado devuelve el código asignado y se audita el conteo | SQL |
| 3c | Clasificador: filas sin SKU en tienda conectada ya no son error (`auto_sku`); la protección anti-duplicados por nombre exacto se conserva (`ERR_NAME_MATCH_REQUIRES_REVIEW`) | SQL |
| 3d | Frontend sin generadores: AUTO-* y `SKU-${Date.now()}` eliminados; mapeo por índice/posición; la UI muestra el código asignado por el servidor | TS |
| 3e | RPC fina `assign_next_catalog_sku` para el único caso residual client-side (borradores en tienda NO conectada) | SQL |

**Los 17 maestros AUTO-\* NO se renumeran** (prohibición de la misión §4). Estrategia opcional propuesta (requiere aprobación del propietario): reetiquetado supervisado 1-a-1 con `master_change_log` + `audit_logs`, actualizando `master_products.sku` y `products.sku` de cada fila local en una transacción por producto, eligiendo los 17 números siguientes libres (257..273), SIN tocar movimientos históricos (el kardex no referencia SKU) y con verificación de unicidad previa. Queda fuera del alcance de esta intervención.

---

## 4. Diagnóstico real de las recepciones cd921832 y 47380573

### cd921832-18e5-44da-a4d2-a6d17a16018b (ENT-000004-2026)
- Creada 2026-11-24 16:56:15 UTC (11:56 a.m. local) como `pending`; confirmada 18:08:04 UTC; estado final `active`; `payment_status='unpaid'` (el «Confirmada / Pendiente» del reporte = estado activa + pago pendiente).
- 10 ítems con SKUs NUMÉRICOS existentes (72, 17, 33, 18, 20, 62, 61, 56, 27, 3) — productos previos del catálogo, reutilizados correctamente (sin duplicados).
- Total $277.00 CUP (10 líneas × costo 1 × cantidades: 9+10+6+32+165+27+6+11+4+7 = 277 ✓).
- **Antes del fix:** 0 movimientos con su enlace → «s/d».
- **Después del backfill:** 10 movimientos enlazados; saldo derivable por doctrina (ver §6).

### 47380573-a546-4286-80fb-8d5ba374551e (ENT-000005-2026)
- Creada 2026-11-24 18:41:17 UTC (01:41 p.m. local) directamente `active` vía `register_reception` (que sí escribe el enlace): sus **16 movimientos** `purchase` nacieron con `notes=receipt.id` ✓.
- Incorporó 16 productos NUEVOS creados en esa recepción: los maestros AUTO-* (`AUTO-MWV0TMXS-1` … `AUTO-MWV1D9VA-G`) + filas locales vinculadas en ENERVIDA con `master_product_id` correcto y existencia registrada (16 movimientos por recepción; `stock_current` de cada fila = cantidad recibida).
- Consecutivo del Catálogo Maestro ANTES de crearlos: 1..256 completo → los nuevos debieron recibir 257..272; recibieron AUTO-* (fuera de secuencia). SIN duplicados de SKU, SIN saltos dentro del rango oficial (1..256 sigue intacto), asociación a ENERVIDA correcta, detalles de la recepción apuntan a los productos correctos (verificado por join `receipt_items.products`).
- No se renumeró nada: el diagnóstico y la estrategia opcional quedan documentados (§3).

---

## 5. Códigos encontrados y consecutivo esperado del Catálogo Maestro

- Consecutivo oficial (tenant `5364ccf8`): **1..256 completo** (256 SKUs numéricos) + outliers históricos **998, 999**.
- **Siguiente código disponible = 257** (verificado tras aplicar la migración: `next_master_catalog_sku` → `"257"` en producción).
- Fuera de secuencia: 17 AUTO-* (16 de 47380573 + 1 del 23/11) y `PBM-001`, `QA-CM-20261030-01` (códigos de prueba/documentales históricos, sin tocar).
- Con la corrección, dos tiendas creando productos simultáneamente obtienen códigos distintos (advisory lock serializa; verificado con 4 hilos concurrentes en BD aislada: 4 códigos sin colisión), los reintentos no queman códigos y los fallos posteriores no dejan huecos.

---

## 6. Evidencia de que los saldos corresponden a las existencias reales

Algoritmo doctrinal (`calcularSaldoPosterior` — orden canónico `created_at,id`, enlace `notes=receipt.id`) ejecutado sobre la producción POST-backfill, recepción cd921832:

| SKU | Producto | Antes | +Recibido | Saldo del documento | Stock actual BD | ¿Coincide? |
|---|---|---:|---:|---:|---:|---|
| 72 | Yee de 50 | 2 | 9 | **11** | 11 | ✓ |
| 17 | Césped Artificial | 10 | 10 | **20** | 20 | ✓ |
| 33 | Extensiones 5M | 1 | 6 | **7** | 7 | ✓ |
| 18 | Cheques metálicos | 0 | 32 | **32** | 32 | ✓ |
| 20 | Codos de 45 grado | 15 | 165 | **180** | 180 | ✓ |
| 62 | T de pulgada a 3/4 | 2 | 27 | **29** | 29 | ✓ |
| 61 | T de media | 4 | 6 | **10** | 10 | ✓ |
| 56 | Reducido de 3/4 | 0 | 11 | **11** | 11 | ✓ |
| 27 | Escobas | 1 | 4 | **5** | 5 | ✓ |
| 3 | Araganes | 0 | 7 | **7** | 7 | ✓ |

10/10 coinciden: el saldo mostrado en el SC-2-04 de cd921832 será el saldo REAL posterior del almacén — cero si el saldo fuera cero, positivo/negativo según el ledger (la doctrina no oculta negativos), y «s/d» solo queda donde NO hay forma técnica de determinarlo (101 huérfanos históricos del 2026-07-01 sin recepción asociada, documentados con nota al pie).

---

## 7. PDF de ejemplo con valores y sin valores

Generados con el generador de producción (`scripts/dev-recep001-pdf-evidence.ts`, sin mocks): `download/cp-recep-001/evidencia/pdf/`
- `despues_con-valores_SC-2-04_..._cd921832.pdf` — 7 columnas + IMPORTE TOTAL (comportamiento vigente intacto).
- `despues_sin-valores_SC-2-04_..._cd921832.pdf` — 5 columnas (Precio unitario e Importe ELIMINADOS), sin bloque de totales, Descripción absorbe el espacio, saldo intacto, pie «— Documento emitido sin valores económicos.»
- `despues_con-valores-largo_..._47380573.pdf` / `despues_sin-valores-largo_..._47380573.pdf` — 40 líneas con descripciones largas (2 páginas): el modo sin valores se mantiene en TODAS las páginas y `pdftotext` confirma **0 apariciones de importes monetarios**.
- Verificación visual: primera página de cada caso renderizada a PNG y revisada (encabezado institucional, bloques A–E, tabla, firmas y pie intactos en ambos modos).

---

## 8. Resultados de pruebas y build

**BD aislada (CostproE2E, `lguovmvrozxgssupkwpf`):**
- Migraciones aplicadas con guards: S1 firmas ✓, S2 enlace documental ✓, S3 generador en los 3 escritores ✓, S4 backfill idempotente ✓.
- Pruebas funcionales (script `scripts/test_recep001_functional.py`): **13/15 PASS** (los 2 "FAIL" iniciales eran aserciones del harness: HTTP 204 = éxito de RPC void — corregido; y restos de limpieza de ejecuciones previas — eliminados). Cobertura: primer código previsto ✓, continuidad n+1 ✓, anti-duplicado por nombre ✓, re-identificación por código asignado ✓, `register_reception` con SKU vacío ✓, enlace documental en register ✓, confirmación pendiente→activa con `notes=receipt_id` ✓, saldo derivable ✓, **concurrencia 4 hilos → 4 códigos distintos** ✓, limpieza net-zero ✓ (residual 0; consecutivo restaurado al estado natural).
- `check-writers` ✓ (script E2E registrado en `isolationProtected`).

**Producción (wthkddeleylijmonclxg) — aplicación ÚNICA documentada (2026-11-25, ambas migraciones):**
- Backfill: `batches_linked=2, movements_linked=12, movements_skipped_conservados=101`.
- POST: cd921832 con 10 movimientos enlazados ✓; 41b16484 con 2 ✓; huérfanos restantes 101 (históricos justificados) ✓; dry-run 0 ✓; siguiente código ENERVIDA = "257" ✓.

**Suite local (bun 1.3.14 / vitest):**
- TypeScript `tsc --noEmit`: **0 errores**.
- ESLint (archivos del cambio): **0 errores** (58 warnings pre-existentes de estilo `<button>` crudo, patrón del repo).
- Unit tests completos: **6655 passed / 3 failed** → los 3 eran metadatos de infraestructura por AÑADIR migraciones/scripts (manifiesto replay 204→206, registro check-writers del aplicador E2E) — corregidos y re-verificados: **96/96 en los 3 archivos afectados; suite verde**.
- Regresión Recepciones: `sc204-export` (11) ✓, `sc204-pdf-ux-004` (13) ✓, `useSavePendingReception-tenant-rls` (5) ✓, `saldo-posterior` (doctrina) ✓, importador maestro (contrato ERR_PRODUCT_WITHOUT_SKU de OTRO módulo) ✓.
- Build `next build`: compilación Turbopack OK; la fase TS del build OOM en este sandbox de 4 GB (limitación conocida y documentada desde la misión 001; `tsc --noEmit` pasa y CI valida el build completo).

---

## 9. Riesgos o pendientes detectados

1. **101 movimientos «Confirmacion recepcion» sin enlace** (lote 2026-07-01 12:00 UTC, importación inicial sin recepción asociada): sus saldos documentales quedan «s/d» JUSTIFICADO con nota al pie. Enlazarlos requeriría una decisión documental del propietario (no existe recepción que los ampare).
2. **17 maestros AUTO-\*** fuera del consecutivo: sin renumerar (prohibición). Estrategia opcional propuesta en §3; requiere aprobación y ventana de mantenimiento.
3. **Outliers 998/999**: códigos numéricos históricos por encima del consecutivo; el generador los salta automáticamente (prefijo contiguo) — comportamiento correcto, solo se documentan.
4. **Borradores en tienda NO conectada**: la asignación (`assign_next_catalog_sku`) y el INSERT client-side no son un único paso transaccional (ventana mínima de carrera → 23505 visible con reintento; patrón ya establecido). En tiendas CONECTADAS —el caso reportado— todo es transaccional server-side.
5. **Cambios de estado futuro**: si `receipts.status` incorpora nuevos estados intermedios, la proyección del saldo (`pendienteContabilizar`) solo cubre `pending` (semántica actual sin cambios).
6. El **modo sin valores** no altera el CSV/Excel existente (fuera del alcance de la misión; solo el PDF SC-2-04).

## 10. Commit y PR

- Rama `fix/recepciones-pdf-stock-sku-20261124` desde `main` (d2c97db64), commits por fase (migraciones/infra → frontend/tests → evidencia/informe), push con URL efímera (PAT nunca persistido), PR abierta con este informe y evidencia; diff escaneado: **0 secretos** (`github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`).
- Aplicación en producción documentada aquí (cuándo, qué, resultado) conforme a la regla de oro productiva.

---

## 11. Seguimiento CI del PR #1706 (2026-11-25, reanudación)

**Reporte del propietario: «los CI fallaron del PR 1706» + verificar que los códigos de la última recepción de ENERVIDA tomaran la enumeración esperada («creo que a partir del 239, ya que el catálogo maestro se quedó en ese número»).**

### 11.1 Diagnóstico de los 3 checks en fallo (head 19e1cb428)

| Check | Causa raíz | Corrección |
|---|---|---|
| **SQL DB Security Checks** (`secdef_no_auth`) | La nueva función `cp_recep001_backfill_confirm_notes` es SECURITY DEFINER sin auth-check propio (por diseño: herramienta de mantenimiento service_role-only) y NO estaba en `ci-gate-allowlist.json` → 124 hallazgos, 123 permitidos, 1 fuera. | Entrada de allowlist con justificación completa (dry-run, emparejamiento inequívoco, audit_logs, idempotencia, ACL exclusiva). Formato validado contra las reglas del job Allowlist Review (reason/added_by/expires no vencido). |
| **Security Audit** (Capa C, `BODY_DRIFT_FROM_MIGRATION`) | El surface certificado (`contract-surface.sql`, captura LIVE 2026-11-21) precedía a las migraciones del PR → los cuerpos LIVE (ya migrados en producción el 2026-11-25) divergían del replay para `confirm_pending_reception/3`, `register_reception/11`, `resolve_reception_import_rows/4`. | Re-certificación sancionada por el propio generador: `export-contract-surface.cjs` re-ejecutado contra producción LIVE (224 funciones, antes 222) tras aplicar las migraciones autorizadas. Capa C: **224/224 representadas, 0 divergencias**. |
| **E2E Aislado (project)** — 54/55 | Único fallo: `cpfin-reconciliation-tab.spec.ts:188` (timeout 60s esperando `recon-row-ACT_INVENTARIO`). Pestaña de Conciliación contable, sin relación funcional con este PR (migraciones aplicadas en el replay aislado SIN alterar datos del provisionador; backfill actúa solo sobre patrones de confirmaciones huérfanas inexistentes en una BD recién provisionada). Los 10 PRs anteriores con este mismo suite pasaron. | Se re-ejecuta tras el push correctivo; si persiste, se abre investigación independiente (posible lentitud de la ejecución bajo demanda en runner compartido). No se toca el test para «hacerlo pasar». |

**Hallazgo adicional de seguridad (Capa C tras re-certificar, `UNEXPECTED_ACL_DRIFT`):** en LIVE la función backfill heredaba `EXECUTE` para `authenticated` (los *default privileges* de Supabase conceden a anon/authenticated/service_role en la CREACIÓN de funciones) aunque la migración solo concedía `service_role`. Como es SECURITY DEFINER (saltaría RLS), se corrigió en AMBOS lados:
- Migración 20261125120000: `REVOKE … FROM PUBLIC, anon` → `FROM PUBLIC, anon, authenticated` (comentario del porqué en el propio archivo).
- Producción: DCL único e idempotente aplicado y verificado por script (`scripts/apply_recep001_acl_revoke.mjs` en sandbox): proacl final `{postgres=X/postgres,service_role=X/postgres}` — **sin authenticated**. Sin impacto en datos (statement de privilegios, re-ejecutable). El manifiesto del replay E2E fue regenerado (`build-migrations-replay.mjs`, `--check` → MATCH) para absorber la edición de la migración.

### 11.2 Verificación con datos reales: consecutivo de la última recepción de ENERVIDA

Consultas read-only a producción (script `scripts/verify_enervida_consecutivo.mjs`, 2026-11-25):

1. **El Catálogo Maestro NO se quedó en 239.** SKUs numéricos del tenant 5364ccf8: **prefijo contiguo 1..256 COMPLETO** (existen 239, 240, …, 256; huecos en 1..316: solo 257+; máx. numérico 999 = outliers históricos). → El siguiente código oficial es **257**, que es exactamente lo que el generador `next_master_catalog_sku` asignará (coincide con el POST de producción: «siguiente código ENERVIDA = 257»).
2. **La última recepción de ENERVIDA es 47380573** (24/11/2026 18:41 UTC; no hay recepciones posteriores). Sus **16 productos creados** tienen códigos `AUTO-MWV*` (generador del frontend ANTERIOR a este fix), emparejados local↔maestro 1-a-1, con existencias registradas — ver §4/§5. **NO tomaron enumeración numérica** porque se crearon antes de que este PR existiera; renumerarlos sigue prohibido sin aprobación explícita (§9.2).
3. **Ningún maestro creado desde el 2026-11-25**: el consecutivo oficial aún no se ha ejercitado en producción; comenzará en **257** con el primer producto nuevo creado con este PR fusionado/desplegado (el RPC server-side ya está vivo; el frontend que dejaba llegar `AUTO-*` queda corregido por este PR).

**Conclusión para el propietario:** la enumeración esperada no era «a partir del 239» sino **a partir del 257** (239–256 están todos ocupados en el maestro). Los códigos de la última recepción quedaron como `AUTO-*` por ser anteriores al fix; a partir de la fusión, toda recepción nueva toma 257, 258, … de forma server-side, transaccional y concurrency-safe. Si se desea renumerar los 17 `AUTO-*` hacia 257..273, existe la estrategia en §3/§9.2 y requiere su aprobación explícita (ventana de mantenimiento + verificación de referencias denormalizadas).

### 11.3 Verificación local posterior a la corrección

- `security-contract-test-static.cjs`: **CONTRATO OK** — Capa A 224/224, Capa B 0 nuevas, Capa C 0 divergencias (3 warnings MEDIUM pre-existentes en main, no bloqueantes).
- `build-migrations-replay.mjs --check`: **MATCH** (manifiesto regenerado 206 migraciones).
- `ci-gate-sql-checks.js` offline + validación de allowlist (reason/added_by/expires): OK.
- Unit tests: `cp-recep001-migrations` 14/14 · `sc204-sin-valores` 6/6 · `assert-not-production` 75/75.


---

## Clasificación de la misión

**APROBADO** — las tres incidencias quedan resueltas con causas raíz corregidas en BD y frontend, los dos casos reportados verificados con datos reales (cd921832 muestra saldos reales que coinciden 10/10 con el inventario; 47380573 diagnosticada sin renumeración histórica), las pruebas obligatorias A/B/C/D ejecutadas y el único residuo («s/d» de 101 movimientos históricos sin recepción) **técnicamente justificado y documentado**, no un defecto no verificado.
