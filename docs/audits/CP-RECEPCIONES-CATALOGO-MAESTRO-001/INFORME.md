# INFORME FINAL — CP-RECEPCIONES-CATALOGO-MAESTRO-001

**Misión:** Auditoría, corrección y normalización de códigos de productos creados desde Recepciones + edición completa de borradores.
**Aplicación:** COSTPRO 4 Multitienda · **Módulo:** Inicio → OPERACIÓN → Logística → Recepciones · **Tienda afectada:** ENERVIDA-VITALLCONS.
**Fecha:** 2026-11-25 · **Rama:** `fix/recepciones-catalogo-maestro-20261125` · **Método:** auditoría forense de producción (solo lectura) → validación en BD aislada CostproE2E → aplicación única en producción → pruebas + evidencia.

---

## 1. Causa raíz del problema de edición de borradores

**Capacidad ausente, no un botón bloqueado.** El modal «Editar» de una recepción pendiente (ReceptionDetailsModal + PATCH `/api/inventory/receptions/[id]` + RPC `update_reception_items`) permitía modificar cantidades/costos de líneas existentes, marcar eliminaciones (cantidad 0) y editar cabecera — pero **no existía ninguna vía para AGREGAR productos**: ni UI, ni backend (el contrato del PATCH solo acepta `itemUpdates {id, quantity, unit_cost, deleted}`; la RPC solo hace UPDATE/DELETE). El usuario guardaba un borrador, lo reabría y el sistema no ofrecía forma de continuar la recepción. Adicionalmente, tras guardar, las queries (`receipt-items`, `receptions`) no se invalidaban, de modo que la UI podía mostrar datos previos al guardado.

## 2. Causa raíz de la generación incorrecta de códigos

Dos generadores paralelos al consecutivo oficial convivió con el oficial:

1. **`AUTO-<timestamp36><random>-<seq36>`** en `useReceptionState.ts` (alta manual sin SKU; **eliminado en PR #1706**). La última recepción de ENERVIDA — **ENT-000005-2026 (47380573), 24/11 18:41** — lo usó para 16 productos: el escritor canónico `resolve_reception_import_rows` creó 16 maestros con ese SKU **literal del cliente**, fuera del consecutivo 1..256 del Catálogo Maestro.
2. **`OCR-${Date.now()}-${idx}`** en el importador OCR de la misma vista (**eliminado en esta misión**, fase 2): los ítems sin SKU detectado viajaban con ese placeholder como SKU provisto → maestros OCR-* fuera de secuencia.

Los «dos valores» por producto de la tabla de la misión son **mitades de un único SKU concatenado**: `AUTO-MWV0T` + `MXS-1` = `AUTO-MWV0TMXS-1`. Los «AUTO-* repetidos» son prefijos-timestamp comunes de productos consecutivos, no duplicados.

## 3. Tablas, funciones, triggers y componentes modificados

| Objeto | Cambio |
|---|---|
| `supabase/migrations/20261125130000_cp_catmaestro001_renumber_enervida_auto.sql` | **NUEVO** — RPC `cp_catmaestro001_renumber_auto_masters` (renumeración supervisada: transaccional, advisory lock del generador, master_change_log + audit_logs, idempotente, fail-closed, snapshots de integridad) + guard `CP-CATMAESTRO001-GUARD` + REVOKE a PUBLIC/anon/authenticated |
| `supabase/migrations/20261125131000_cp_catmaestro001_add_reception_items.sql` | **NUEVO** — RPC `add_reception_items` (altas en borradores vía escritor canónico, emparejamiento posicional, tienda no conectada con código canónico, idempotencia de reintento, anti-duplicados, recálculo de total, auditoría, cero inventario) + RPC `save_pending_reception_changes` (cabecera+updates+altas en UNA transacción) + grants a authenticated/service_role + guard |
| `src/app/api/inventory/receptions/[id]/route.ts` | PATCH acepta `newItems`; con líneas nuevas → `save_pending_reception_changes` (ruta histórica intacta sin líneas nuevas) |
| `src/components/views/terminal/views/receptions/ReceptionAddItemsPanel.tsx` | **NUEVO** — panel «Agregar productos» (búsqueda de existentes + filas del Catálogo Maestro + producto nuevo sin SKU) |
| `src/components/views/terminal/views/receptions/ReceptionDetailsModal.tsx` | integra el panel (solo `pending`), recolecta `newItems`, valida líneas antes de enviar, botón «Guardar cambios (+N)» |
| `src/components/views/terminal/views/receptions/useReceptionsHistoryView.ts` | `handleUpdateSubmit` envía `newItems`, invalida queries (`receipt-items`, `receptions`, `reception-product-lines`), toast con códigos asignados |
| `src/components/views/terminal/views/inventory/useReceptionState.ts` | **fase 2:** eliminado el fallback `OCR-${Date.now()}` (SKU vacío → asignación oficial del servidor) + dedup por nombre |
| `scripts/cp-catmaestro001-apply-prod.mjs` | aplicador gobernado de la renumeración en producción (guard CP-INFRA-019 + doble flag + post-verificación) |
| `scripts/e2e/cp-catmaestro001-*.mjs` | 4 auditorías read-only de fase 0, 2 validadores E2E (renumeración y altas) + setup/playwright/cleanup de la fase visual |
| `scripts/lib/writers.manifest.json` | 6 scripts nuevos declarados (guardProtected/isolationProtected) |
| `audit-evidence/INFRA-011/e2e-migrations-manifest.json` | regenerado (208 migraciones, `--check` MATCH) |

**Tablas de datos tocadas (solo producción, una vez):** `master_products` (16 SKU), `products` (16 SKU de ENERVIDA, coerción del trigger de identidad), `master_change_log` (16), `audit_logs` (16 + 1 lote). **Sin tocar:** receipts, receipt_items, stock_movements, kardex, precios, cantidades, existencias.

## 4. Los 15 productos corregidos (16 reales): códigos anteriores → definitivos

La recepción ENT-000005-2026 (Fact24112026-II, Laudelina Olivera (Lary), 756 CUP, 24/11) contiene **16 ítems** — la tabla de la misión lista 15; el 16.º es «Tornillo autorroscante chiquito» (qty 500, mismo instante de creación 18:41:18.706603; Σ qty×costo = 756 = total_cost confirma los 16). Corregidos TODOS los de la recepción (§8 protege productos *ajenos*: el «Cable para Ecoflow» AUTO-MWTIJE8Y-1 pertenece a la recepción ENT-000003-2026 del 23/11 y **no se tocó**; tampoco los SKUs de prueba QA antiguos).

| ID producto (local) | Código anterior | Código nuevo | Producto maestro | Sucursal |
|---|---|---|---|---|
| 15be3d69…d827 | AUTO-MWV0TMXS-1 | **257** | eb80bb3b…2a1c | ENERVIDA |
| 2f151b1a…4472 | AUTO-MWV0V3S5-2 | **258** | a87e6303…1433 | ENERVIDA |
| 1f1a6421…f747 | AUTO-MWV0VX72-3 | **259** | a5ea594a…e96f | ENERVIDA |
| a5568216…e634 | AUTO-MWV0X1ST-4 | **260** | dcf2f232…9e92 | ENERVIDA |
| 12c2f817…810f | AUTO-MWV0YD5A-5 | **261** | b1397e83…ab67 | ENERVIDA |
| 4512d60c…cfcc | AUTO-MWV11BYE-6 | **262** | 8a72bb13…a984 | ENERVIDA |
| 0e82da93…c15b | AUTO-MWV13KQF-7 | **263** | e612ba20…739a | ENERVIDA |
| 6d0322f2…5b3d | AUTO-MWV15R5H-8 | **264** | f0794b60…312c | ENERVIDA |
| 33df7416…4a1e | AUTO-MWV178WC-9 | **265** | 6b23b9d9…4b99 | ENERVIDA |
| ea8b5411…a404 | AUTO-MWV18JNH-A | **266** | c085ec03…f4aa | ENERVIDA |
| ca85c10a…c52a | AUTO-MWV18ZM5-B | **267** | 2056225d…b3fe | ENERVIDA |
| d72124c9…5c01 | AUTO-MWV19DJY-C | **268** | 360eb4c8…978e | ENERVIDA |
| 6dc35b08…bf99 | AUTO-MWV19V72-D | **269** | e6b25f7c…6a0d | ENERVIDA |
| 44c589f2…fd80 | AUTO-MWV1ABD9-E | **270** | fcc11b6b…beb5 | ENERVIDA |
| 6b8a2bcf…1c9a | AUTO-MWV1C5KV-F | **271** | 0b3f4c6c…5888 | ENERVIDA |
| 753103cb…3ec6 | AUTO-MWV1D9VA-G | **272** | ae245c8e…1ad5 | ENERVIDA |

## 5. Evidencia de que el consecutivo procede del Catálogo Maestro

- Dry-run en producción (antes de aplicar): `to_renumber=16`, códigos **257..272** — el primer hueco del prefijo contiguo real (1..256 + outliers 998/999), calculado por **la misma función `next_master_catalog_sku`** (advisory lock por tenant). La aplicación llamó al generador oficial por cada maestro, dentro de la transacción y bajo su MISMO advisory lock.
- Post-verificación: 16 maestros 257..272, filas locales sincronizadas (coerción del trigger de identidad), 16 entradas `master_change_log` (field 'sku'), 16 `audit_logs` CP_CATMAESTRO001_SKU_RENUMBER + 1 de lote.
- La fase 5 (BD aislada): producto nuevo sin SKU creado desde la edición de un borrador obtuvo el código **«3»** (siguiente consecutivo del fixture 1..2) con `sku_assigned_by_server=true`.

## 6. Evidencia de concurrencia e idempotencia

- **Concurrencia (E2E aislada, fase 3-F):** dos llamadas PARALELAS de `add_reception_items` con productos nuevos → códigos **5 y 6** distintos y consecutivos (advisory lock del generador; un maestro y una fila local por código). La renumeración comparte el mismo lock → se serializa contra tiendas creando productos.
- **Idempotencia:** (a) re-ejecutar la renumeración en producción → `already_renumbered=16, applied=0`, cero escrituras; (b) `add_reception_items` con lote idéntico ya aplicado → `idempotent_skipped=1, added=0`; (c) duplicado con datos distintos → `ERR_PRODUCT_ALREADY_IN_RECEIPT` con remedio en el mensaje; (d) fila bloqueada → `ERR_ROWS_BLOCKED` y **rollback de TODO** (incluidos maestros creados: 9→9).
- **RLS/permisos (E2E):** usuario autenticado sin acceso a la tienda → `ERR_UNAUTHORIZED`; recepción confirmada → `ERR_NOT_EDITABLE`. El manifiesto de escritores (`check-writers`) declara los 6 scripts nuevos del repo.

## 7. Evidencia de las pruebas de edición de borradores

- **E2E BD aislada (fase 3): 19/19** — alta de existente, idempotencia, duplicados, producto ajeno, nuevo con código oficial, concurrencia, fail-closed atómico, confirmada no editable, guardado atómico (header+qty+alta), autorización, cero movimientos de inventario, cleanup.
- **UI (Playwright, BD aislada, 12/12):** crear recepción → guardar Pendiente → reabrir con Editar → ver el ítem previo → agregar existente + **producto nuevo sin SKU** («código por asignar») → Guardar → **recarga completa de página** → reapertura: **las 3 líneas persisten** y el producto nuevo muestra el código oficial «3» → listado con badge ⏳ Pendiente. Móvil 390×844: edición y panel de altas accesibles. Capturas: `docs/audits/CP-RECEPCIONES-CATALOGO-MAESTRO-001/evidencia/`.
- **Suite completa:** 490+ archivos, **6674 pruebas en verde** (3 fallos iniciales por los sistemas de seguridad del repo — manifiesto de escritores y conteo de migraciones — corregidos según el patrón del proyecto).
- **Unitarias:** 14/14 contrato estático de las migraciones + eliminación del generador OCR + integración del panel.

## 8. Existencias y movimientos históricos intactos

- Renumeración en producción: `receipt_items 16→16`, `stock_movements 16→16`, `kardex 16→16` (verificación intra-transacción + post-verificación); saldos por producto idénticos antes/después (9, 2, 50, 3, 9, 20, 30, 20, 100, 6, 1, 1, 1, 1, 3, 500); total de la recepción 756 intacto; precios, importes, U.M. sin cambios; otras sucursales: **cero** filas locales de los 16 maestros fuera de ENERVIDA (verificado antes y guardado en runtime).
- `add_reception_items` no escribe stock_movements/kardex/WAC (guard de migración: prohibidos por patrón); el inventario aplica solo al confirmar. Higiene de datos: **PASS — delta neto = 0**.

## 9. Migraciones y procedimiento de reversión

| Migración | Aplicada en producción | SHA |
|---|---|---|
| 20261125130000 (renumeración) | 2026-11-25 ~13:35 UTC (función + renumeración aplicada 16/16) | 5052adca4 |
| 20261125131000 (altas borradores) | 2026-11-25 ~13:20 UTC (solo DDL; idempotente) | dfb25556d |

**Reversión de la Fase 1** (por registro, documentada): `UPDATE master_products SET sku='<anterior>' WHERE id='<id>'; UPDATE products SET sku='<anterior>' WHERE master_product_id='<id>';` — la coerción del trigger de identidad sincroniza la fila local; el historial vive en `master_change_log`/`audit_logs`. **Fase 3:** `DROP FUNCTION` de ambas RPC (la ruta degrada al flujo histórico) — sin datos que revertir. Ambas migraciones son CREATE OR REPLACE + guard (re-aplicables sin daño).

## 10. Commit y PR

- Rama `fix/recepciones-catalogo-maestro-20261125` con 4 pushes por fase (auditoría → renumeración → fases 2+3 → informe).
- PR: el creado al final de esta misión con este expediente como cuerpo. Diff escaneado: **cero** secretos.
- Estado del servidor al cierre: PM2 online con el **.env PRINCIPAL** restaurado, health 200.

## Restricciones y decisiones documentadas

1. Se corrigieron los **16** productos de la recepción objetivo (los 15 de la tabla + el 16.º del mismo instante y documento); el criterio §8 se interpretó como «ajenos = otros documentos/sucursales» (Cable para Ecoflow y QA antiguos intactos).
2. El generador oficial ya existía (PR #1706); esta misión cerró el resquicio OCR, aplicó la renumeración pendiente y construyó la capacidad de altas en borradores con el MISMO escritor canónico — **cero segunda fuente de verdad**.
3. `.env*` jamás commiteado (verificado con `git check-ignore`); réplica legible en `download/costpro-env.txt`.

---

# ADENDA (2026-11-25, cierre del CI del PR #1710)

Autorización del propietario en la misma sesión de entrega: «si es correcto renumera Cable para
Ecoflow» (recepción ENT-000003-2026) «y además revisa los CI del PR 1710 que están fallando».

## A. Renumeración del «Cable para Ecoflow» (ENT-000003-2026)

El único SKU AUTO-* restante de todo el catálogo (antes fuera de alcance por §8, ajeno a la
recepción objetivo) fue renumerado con la MISMA maquinaria auditable de la fase 1
(`cp_catmaestro001_renumber_auto_masters`, parámetros explícitos, dry-run validado primero):

| Registro | Antes | Después |
|---|---|---|
| Maestro 59935685 (Catálogo Maestro, tenant 5364ccf8) | `AUTO-MWTIJE8Y-1` | **273** |
| Fila local a69286d3 (ENERVIDA-VITALLCONS) | `AUTO-MWTIJE8Y-1` | **273** |

Integridad verificada post-renombrado: ítem de recepción qty=1 costo=1 intacto;
stock_movements=1 y kardex=2 idénticos a la línea base; total de la recepción (1) y estado
(active) intactos; **cero SKU AUTO-* en toda la base**; consecutivo 1..273 contiguo (+ outliers
998/999 preexistentes). Evidencia: `evidencia/cable-ecoflow-renumeracion.txt`.

## B. Causa raíz de los checks rojos del CI (SQL DB Security Checks)

El gate lee el estado VIVO de producción. Los 3 hallazgos provenían de las 2 migraciones de
esta misión:

1. **secdef_no_auth (1)**: `cp_catmaestro001_renumber_auto_masters` — SECURITY DEFINER sin
   auth-check interno (por diseño one-shot: solo Management API/service_role; ACL exclusiva).
2. **secdef_public_grant (2)**: `add_reception_items` y `save_pending_reception_changes` — la
   migración 20261125131000 otorgó EXECUTE a `authenticated, service_role` pero NO revocó el
   grant implícito de **PUBLIC** ni el materializado de `anon` → una SECURITY DEFINER ejecutable
   por anónimos (vector de escalada aunque la RPC verifique `has_store_access_as` internamente).

## C. Corrección (raíz, sin excepciones en allowlist)

| Migración | Contenido | Aplicada |
|---|---|---|
| **20261125132000** | `REVOKE EXECUTE ... FROM PUBLIC, anon` en ambas RPC + re-grant canónico (`authenticated, service_role`) + guard fail-closed sobre `proacl` | BD aislada y producción (2026-11-25, verificado TODO PASS) |
| **20261125133000** | `DROP FUNCTION IF EXISTS` de la herramienta one-shot (ya usada por completo: 16+1 renumeraciones; firma con UUIDs de producción hard-coded) + guard fail-closed | BD aislada y producción |

Además, la migración original 20261125131000 se endureció en origen (REVOKE antes de los
GRANTs) para que los replays futuros nazcan con la ACL canónica. La retirada de la herramienta
one-shot se prefirió a una entrada en allowlist: mejor postura de seguridad que documentar una
excepción permanente para código muerto; la herramienta sigue versionada en 20261125130000
(recreable) y su historial vive en `master_change_log`/`audit_logs`/este expediente.

## D. Verificación con la MISMA maquinaria del gate de CI

`node scripts/ci-gate-sql-checks.js` + ejecución contra producción + `scripts/ci-gate-evaluate.js`
(canario incluido) — resultado idéntico al que hará el workflow:

```
✅ secdef_no_auth: 126 hallazgo(s), 126 en allowlist, 0 NO permitidos
✅ secdef_public_grant: 0 hallazgo(s), 0 en allowlist, 0 NO permitidos
✅ tables_no_rls: 0 hallazgo(s), 0 en allowlist, 0 NO permitidos
✅ Resultado: TODO PASS
```

Evidencia completa: `evidencia/gate-fix-sql-security.txt` (incluye la aplicación en la BD
aislada PRIMERO — regla de oro — y la prueba de idempotencia de la re-ejecución).

## E. Contrato de pruebas actualizado

- `src/__tests__/migrations/cp-catmaestro001-migrations.test.ts`: +9 pruebas (ACL endurecida
  en origen, contrato de ambas migraciones nuevas, guard fail-closed, idempotencia, ausencia de
  efectos colaterales) — 23 en verde.
- Manifiesto de replay E2E regenerado (209 → **211**) y conteo del test replay-unblock
  actualizado con la entrada histórica del cierre.
- `scripts/lib/writers.manifest.json`: los 3 scripts nuevos de la continuación declarados
  `guardProtected` (check-writers OK).
