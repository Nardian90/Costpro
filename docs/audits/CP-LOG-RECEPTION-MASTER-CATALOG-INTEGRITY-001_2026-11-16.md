# CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 — Informe final

**Fecha:** 2026-11-16 · **Rama:** `fix/recepciones-catalogo-maestro-20261116` · **Misión:** Corrección del reconocimiento, activación y creación de productos durante la importación Excel de recepciones (Inicio → Operación → Logística → Recepciones → Nueva Recepción → Importar Excel).

---

## 1. Causa raíz demostrada

**Frontend** — `src/components/views/terminal/views/inventory/useReceptionState.ts` (línea ~951 original), `handleImportFileSelect`:

```ts
await supabase.from('products').select('id, sku, name, cost_price, price, unit_of_measure')
  .eq('store_id', storeId).eq('is_active', true)   // ← SOLO locales ACTIVOS
```

El importador consultaba **únicamente** la tabla `products` de la tienda **filtrando `is_active = true`**. Nunca consultaba `master_products` ni `catalog_store_links`. En consecuencia:

- Producto del Catálogo Maestro **sin fila local** → no matchea → `status:'new'` → «se crearán nuevos productos».
- Producto del maestro con **asociación local inactiva** → no matchea (filtro `is_active`) → `new` → al registrar, `register_reception` reventaba con `ERR_SKU_EXISTS` (la unicidad SÍ considera inactivos) y **la recepción entera fallaba**.
- El matching por nombre usaba el catálogo local activo; sin vista del maestro, imposible distinguir «nuevo» de «existente en el catálogo de la organización».

**Backend** — `register_reception` (20261107120000), bloque `new_product`:
- **A6** (maestro archivado): creaba fila local **SIN vínculo** → huérfano en tienda conectada.
- **A7** (vínculo ocupado): creaba fila local **SIN vínculo** → huérfano.
- **A5** (maestro inexistente): creaba identidad maestra **sin chequear rol** del solicitante.
- `create_transfer` (20261020000001): «producto espejo» en destino **sin `master_product_id` ni `tenant_id`** → huérfano en destino conectado.
- `activate_master_product` (20261115120100): si la fila local vinculada existía inactiva devolvía `already_active` **sin activarla** (la «activación en tienda» no existía como operación completa).

**Otros escritores cubiertos:** INSERT directo del navegador (`useCreateProduct`, fail-open si la verificación de conexión fallaba) e ingesta legada (`fn_process_receipt*`) — ambos quedan bajo el guard de BD fail-closed.

## 2. Tablas y funciones implicadas

| Objeto | Papel |
|---|---|
| `master_products` | Identidad compartida por organización (SKU, nombre, barcode, UM; **nunca** datos comerciales) |
| `catalog_store_links` | Conexión (tenant, tienda) — `status='connected'` |
| `products.master_product_id` | Vínculo local ↔ maestro (`products_master_store_unique`) |
| `is_catalog_store_connected(tenant, store)` | Helper certificado de conexión |
| `register_reception` | Escritor canónico de la recepción (redefinido: fail-closed A5/A6/A7 + rol en A5) |
| `activate_master_product` | Activación canónica (redefinida: re-activa fila local inactiva + `ERR_LOCAL_CONFLICT`) |
| `create_transfer` | Traspasos (redefinido: espejo con identidad maestra + tenant) |
| `trg_products_master_link_guard` | **NUEVO** — regla estructural en BD (anti-huérfanos + coherencia de tenant del vínculo) |
| `fn_classify_reception_import_row` | **NUEVO** — helper interno de clasificación por fila |
| `classify_reception_import_rows` | **NUEVO** — previsualización READ-ONLY con resumen del backend |
| `resolve_reception_import_rows` | **NUEVO** — escritor canónico del importador (por fila transaccional, idempotente) |
| `reactivate_master_product` | **NUEVO** — reactivación GLOBAL gobernador-only (operación autorizada de la clase C) |

## 3. Comportamiento anterior → nuevo

| Situación | Antes | Ahora |
|---|---|---|
| Maestro activo + local activa vinculada | «Existente» (solo si local activa) | **A · Identificado**: «Producto identificado en el Catálogo Maestro. Se utilizará el producto existente.» |
| Maestro activo + local inactiva / sin fila local | «Nuevo» → recepción fallaba (`ERR_SKU_EXISTS`) o creaba silenciosamente | **B · Se activará**: «Producto existente en el Catálogo Maestro. Se activará en esta tienda.» (operación canónica; sin duplicados) |
| Maestro archivado | «Nuevo» → A6 creaba **huérfano** local | **C · Reactivación**: «Producto existente, actualmente inactivo en el Catálogo Maestro. Requiere reactivación.» — explícita, con aviso de alcance global, gobernador-only |
| No existe en absoluto | «Nuevo» → se creaba local (y maestro sin rol) | **D · Nuevo en maestro**: «Se creará en el Catálogo Maestro y se activará en esta tienda.» — primero maestro, después vínculo local, con autorización por rol |
| SKU duplicado / barcode contradictorio / ambigüedad | Coincidencia arbitraria o duplicación | **E · Revisión**: «No se creará ni activará ningún producto hasta resolver la identificación.» |
| Tienda NO conectada | Alta local pura | **Sin cambios** (comportamiento histórico preservado; escenario 17) |
| Alta local directa en tienda conectada (navegador, traspasos, ingesta legada) | Huérfanos posibles | **Denegada por el guard de BD** (`ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE`) |

## 4. Auditoría de huérfanos en producción (solo lectura, 2026-11-16)

- Tiendas conectadas: **4** (tenant Vitallcons `5364ccf8…`; 1 desconectada).
- Productos en tiendas conectadas: 380 filas (258 + 122), **todas vinculadas**.
- **Huérfanos activos: 0. Huérfanos inactivos: 0.** El estado actual está limpio; el guard estructural mantiene esa garantía hacia adelante.
- Maestros: 260 (1 archivado: `QA-CM-20261030-01`, producto de prueba técnica).
- Candidatos a «se activará en esta tienda» (clase B): SKU **184** en la tienda principal (5e6fe821…); tiendas 8eb56fa3/bc94e3d0 sin catálogo local (259 maestros disponibles para activar).
- Script re-ejecutable: `scripts/cp-log-reception-integrity-001-{prod-prestate,cuantificacion}.mjs` (sandbox).

## 5-8. Resultados (resumen ejecutivo)

- **Productos reconocidos y activados:** cualquier SKU del maestro sin fila local o con fila inactiva se clasifica B y se activa canónicamente (escenarios E2E 01-03, 09).
- **Nuevos verdaderos:** creados PRIMERO en el maestro (solo identidad) y después vinculados a la tienda con precios/costos propios del Excel (escenario 05); costo promedio inicial nominal 1 CUP.
- **Ausencia de duplicados:** reimportación idempotente (escenario 09: 0 maestros/0 filas nuevas, factura duplicada rechazada); concurrencia de dos tiendas → 1 solo maestro (escenario 10).
- **Integridad WAC y multitienda:** primera recepción sustituye el nominal con exactitud (4.50 exacto); segunda pondera (7.5 = (10×5+10×10)/20); dos tiendas con el mismo maestro conservan precios (50/80), WAC (5/8) y existencias (4/2) independientes (escenarios 11-13).

## 9. Batería E2E — 20/20 PASS

`e2e/reception-master-catalog-integrity.spec.ts` (BD aislada CostproE2E, guard fail-closed):

```
20 passed (2.1m) · [global-teardown] Guardrail PASS — net delta = 0
[data-hygiene-guard:AFTER] PASS — net delta = 0
```

| # | Escenario | # | Escenario |
|---|---|---|---|
| 01 | Activo en maestro y tienda: identificado, sin duplicación | 11 | Dos tiendas, mismo maestro: costos/precios propios |
| 02 | Asociación local inactiva: se activa localmente | 12 | Primera recepción: nominal → real exacto |
| 03 | Sin asociación local: se vincula y activa | 13 | Segunda recepción: ponderación 7.5 |
| 04 | Archivado global: reactivación explícita (gobernador) | 14 | Histórico vinculado: datos conservados |
| 05 | Nuevo: maestro primero, luego tienda | 15 | Huérfano local: identificado, sin duplicar, sin auto-vínculo |
| 06 | SKU duplicado en archivo: bloqueado | 16 | Alta local directa en conectada: denegada (guard BD, RLS real y service-role) |
| 07 | Barcode contradictorio/ajeno: bloqueado | 17 | Tienda no conectada: legacy preservado |
| 08 | Datos incompletos: no se crea | 18 | Clerk sin rol: creación y reactivación denegadas |
| 09 | Reimportación: cero duplicados | 19 | Fallo: aislamiento por fila + atomicidad total |
| 10 | Concurrencia mismo SKU: 1 maestro | 20 | Trazabilidad: master_change_log + audit_logs |

## 10. Migraciones creadas (NO aplicadas a producción — requieren autorización)

1. `supabase/migrations/20261116140000_cp_reception_master_catalog_integrity.sql` — regla estructural: trigger anti-huérfanos + coherencia de tenant; `reactivate_master_product`; `activate_master_product` (activación local + `ERR_LOCAL_CONFLICT`); `create_transfer` (espejo con identidad); `register_reception` (fail-closed A5/A6/A7 + rol A5). Guard fail-closed incluido.
2. `supabase/migrations/20261116140100_cp_reception_import_classification.sql` — motor: `fn_classify_reception_import_row` (interno), `classify_reception_import_rows` (READ-ONLY, resumen backend), `resolve_reception_import_rows` (escritor canónico). Guard fail-closed incluido.

Ambas idempotentes (CREATE OR REPLACE / DROP IF EXISTS), aplicadas y verificadas en la BD aislada E2E. **No se modificó ninguna migración ya aplicada.**

## 11. Controles ejecutados

| Control | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (`bun run lint`) | PASS (0 errores; 1569 warnings preexistentes) |
| Pruebas unitarias (`vitest run`) | **6116 pasan / 0 fallan** (95 skip normales); incluye 36 tests nuevos de migración y hook adaptados |
| E2E aislado (20 escenarios) | **20/20 PASS** + net delta 0 |
| SQL Security Gate (estático, 3 capas) | CONTRATO OK (0 bloqueantes; allowlist temporal source_of_truth para las 3 funciones redefinidas, patrón PR #1616, a retirar al re-certificar producción) |
| Security Audit (CI: ts-checks, BOLA, destructive guard) | PASS los tres |
| `check-writers` | OK (nuevo script de aplicación E2E declarado isolationProtected) |
| Guard de operaciones destructivas | CP-INFRA-020: sin destructivos sin guard |
| Manifiesto y replay de migraciones | Regenerado: 177 migraciones, `--check` MATCH |
| Build (`next build`) | **Compila exitosamente** (2× «✓ Compiled successfully»); la fase TS del builder excede la RAM del sandbox (4 GB) — en CI (16 GB) completa; `tsc --noEmit` independiente PASS |
| Escaneo de secretos en el diff | 0 coincidencias (`github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`, credenciales BD) |

## 12. SHA, CI y PR

- Rama: `fix/recepciones-catalogo-maestro-20261116` (desde `main` @ `337d45324`).
- Commits por fase (diagnóstico/infra → fix → pruebas/evidencia), push tras cada fase.
- PR: ver enlace en el encabezado del expediente (checks CI/Test Coverage automáticos; el workflow «E2E Aislado (CostproE2E)» es manual — filtro sugerido: `reception-master-catalog-integrity`).

## 13. Riesgos y limitaciones restantes

1. **Migraciones NO aplicadas a producción**: el despliegue requiere autorización expresa del propietario (runbook: aplicar 20261116140000 y 20261116140100 → re-certificar `contract-surface.sql` → retirar las 3 entradas `source_of_truth_baseline` del `ci-gate-allowlist.json`).
2. **Cambio de comportamiento deliberado (A6/A7)**: `register_reception` ahora RECHAZA (antes: creaba huérfano) ante maestro archivado o vínculo ocupado en tienda conectada. Cubierto por mensajes accionables; ninguna vía de la app usa ya ese camino (el importador bloquea antes).
3. **Rol exigido para crear maestros desde recepciones** (A5/importador D): en tiendas conectadas, usuarios sin rol admin/manager/encargado ya no pueden crear identidad maestra desde una recepción (misión §6.3/§11.18). Los vendedores pueden recibir sobre productos existentes/activados con normalidad.
4. **Ingesta legada** (`fn_process_receipt*`): queda bloqueada fail-closed por el guard en tiendas conectadas (por diseño); si algún flujo interno aún las usa sobre tiendas conectadas, debe migrarse al importador canónico. Hoy no hay llamadas en `src/`.
5. **Reactivación global**: es una decisión de gobernanza con alcance en TODAS las tiendas conectadas; queda auditada (`REACTIVATE_MASTER_PRODUCT`, `scope: global`) y exige confirmación explícita por fila.
6. **El archivo Excel de recepciones no trae barcode**: los controles de código de barras actúan cuando la fila lo aporta (API/OCR futuros); la plantilla actual no se modifica.
7. **CI build local**: el sandbox no sostiene la fase TS del builder (RAM); validado con compilación exitosa + `tsc --noEmit` independiente + suite completa. Vigilar el check «Build» del PR.

## 14. Criterios de aceptación (§14)

1. ✅ El importador reconoce productos del maestro aunque estén inactivos localmente (E2E 01-03).
2. ✅ El operador ve «Se activará en esta tienda» en lugar de «se creará uno nuevo» (E2E 02/03; UI rediseñada).
3. ✅ Los productos existentes no generan duplicados (E2E 01/09).
4. ✅ Los realmente nuevos se crean en el maestro ANTES de vincularse (E2E 05).
5. ✅ La previsualización informa las acciones antes de importar (resumen por clases + acción prevista por fila).
6. ✅ Ninguna vía cubierta puede crear productos independientes en tienda conectada (E2E 15-18; trigger de BD + redefiniciones).
7. ✅ Costos, precios y existencias propios por tienda (E2E 11).
8. ✅ Recepción y WAC íntegros (E2E 12-13; precio de venta no contaminado en 14).
9. ✅ E2E 20/20 + controles de seguridad PASS.
10. ⏳ PR abierto con checks — pendiente de CI de GitHub (build local limitado por RAM del sandbox).

**El criterio fundamental queda satisfecho a nivel arquitectónico:** la regla vive en la BASE DE DATOS (trigger) y en los escritores canónicos, no solo en la pantalla.
