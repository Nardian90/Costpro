# AUDITORIA_PR_1587_IMPLEMENTACION.md

**Misión:** CP-PR-1587-AUDIT-CI-REMEDIATION-001 · **Fecha:** 2026-11-09
**PR auditado:** [Nardian90/Costpro#1587](https://github.com/Nardian90/Costpro/pull/1587) — «feat: clasificación operativa del catálogo + filtros avanzados del Listado de precios (CP-OPERATIONAL-CLASS-001)»
**SHA inicial auditado:** `71a4190f2` (head al inicio de la misión; base `main` @ `ce2161c60`)
**SHA final tras la remediación:** `9aebce04d` (sincronizado con `main` @ `99e1c0960`)

---

## 1. SHA inicial auditado

`71a4190f2` — cuarto commit del PR («fix: CP-OPERATIONAL-CLASS-002 — remediación de la migración…»). Historial auditado: `58b0f7b64` (implementación), `4e125fb2c` (re-dispatch CI), `f94057bea` (merge con main), `71a4190f2` (remediación v2 de la migración). Diff auditado: 33 archivos, +3.605/−41.

## 2. Objetivo real del PR

1. **Clasificación operativa** del catálogo (enum PG `product_operational_class`: venta · insumo · activo_fijo · util_herramienta) como dato **informativo POR TIENDA**, persistido en `products.operational_class` (nullable, NULL = «Sin clasificar», sin backfill del histórico): selector en `EditProductModal` (estado actual visible con `aria-live`), obligatoria en `CreateProductModal`, e importación Excel/CSV con parseo fail-closed.
2. **Persistencia transaccional** del alta: `create_master_product` y `activate_master_product` aceptan `p_operational_class` y lo escriben en la MISMA transacción que crea la fila local (sin UPDATEs secundarios ni éxito falso).
3. **Filtros avanzados del Listado de precios** (Ventas → Listado de precios): chips multi-select de clasificación (incluye «Sin clasificar») + estado del precio (Con precio / Sin precio), combinables con el rango de SKU; contador en vivo **≡ filas del documento** (pipeline único) y pie del PDF que declara los filtros aplicados.

Lo implementado coincide con lo comprometido (cuerpo del PR y comentario de remediación del propietario). El cambio de criterio de precio documentado en la remediación (Con precio = `price > 0`, hallazgo verificado: la columna es `numeric NOT NULL DEFAULT 0`) es coherente con el esquema real y está reflejado en código, tests y PDF.

## 3. Archivos revisados

- **Migración (nueva):** `supabase/migrations/20261108150000_cp_operational_classification.sql` (853 líneas — revisión completa).
- **Libs nuevas:** `src/lib/product-operational-class.ts`, `src/lib/price-list/operational-filters.ts` (revisión completa).
- **Modificados:** `src/lib/price-list/model.ts`, `src/lib/price-list/pdf.ts`, `src/hooks/api/usePriceListProducts.ts`, `src/hooks/api/useMasterCatalog.ts`, `src/components/modals/CreateProductModal.tsx`, `src/components/views/terminal/views/catalog/EditProductModal.tsx`, `.../CatalogView.tsx`, `.../inventory/InventoryView.tsx`, `.../price_list/PriceListView.tsx`, `src/services/catalog-service.ts`, `.../CatalogImportDialog.tsx`, `src/types/index.ts`, `src/validation/schemas.ts`, `src/validation/api-schemas.ts`.
- **Verificación E2E (nueva):** `scripts/e2e/verify-operational-classification-pg.mjs` (revisión completa: guard fail-closed, fases 0-7, limpieza acotada al fixture).
- **Tests:** 8 nuevos + 2 adaptados + `replay-unblock-create-sale-v2.test.ts` (manifiesto 139).
- **Infra:** `audit-evidence/INFRA-011/e2e-migrations-manifest.json`, `scripts/lib/writers.manifest.json`, `ci-gate-allowlist.json` (remediation).

## 4. Descripción funcional de la implementación

- **Persistencia:** columna `operational_class` en la capa OPERATIVA (`products`, por tienda); el catálogo maestro (`master_products`) NO se toca. Índice parcial `(store_id, operational_class) WHERE operational_class IS NOT NULL`.
- **RPCs recreadas con DROP (firma exacta, sin CASCADE) + CREATE** — PostgreSQL no permite cambiar el tipo de retorno con `CREATE OR REPLACE` (42P13): `get_paginated_products_v2` (con la rama `v_connected` del catálogo maestro íntegra: source `local|master`, `master_product_id`, locales sin vínculo, `operational_class` AL FINAL del retorno y NULL para filas exclusivamente maestras) y `get_products_for_pos` (imagen master-first intacta). `create_master_product`/`activate_master_product`: DROP de la firma antigua (evita sobrecargas vivas) + firma nueva con `p_operational_class DEFAULT NULL` (retrocompatible).
- **Frontend:** `product-operational-class.ts` como única fuente de verdad (opciones, etiquetas, iconos, `parseOperationalClassCell` fail-closed); filtros puros en `operational-filters.ts`; pipeline único `selectPriceListRows` (inclusión stock/activo → filtro combinado → rango SKU + orden) compartido por documento y contador en vivo.
- **Precio honesto:** `price > 0` = Con precio; `price NULL/≤ 0` = «Sin precio» (jamás «$0.00» falso en pantalla ni PDF).

## 5. Evaluación arquitectónica

**Adecuada.** Separación correcta (libs puras / hooks / vista / PDF), sin lógica duplicada (un solo pipeline de selección, verificado por test en 12 combinaciones), tipado estricto con el enum como tipo (`ProductOperationalClass`) y Zod **sin defaults inventados** (`productSchema`, `createProductInputSchema` conserva el campo; `bulkImportProductSchema` opcional/nullable), compatibilidad total con los patrones del repo (RPC gobernadas, hooks React Query con invalidación, modales existentes reutilizados). La re-declaración de `price` nullable está acotada SOLO al hook del listado (el POS y el resto de la app intactos).

## 6. Evaluación de integridad

**Íntegra.** Verificada en **PostgreSQL real (BD aislada CostproE2E, guard fail-closed)** — 34/34 checks re-ejecutados durante esta auditoría (`audit-evidence/CP-OPERATIONAL-CLASS-002/verificacion-postgresql-real.log`): la migración aplica sin errores, **ninguna tabla de datos cambia** (conteos pre/post idénticos; histórico sin backfill), firmas exactas, `operational_class` al final del retorno, clasificación por tienda (mismo maestro = venta en S1, insumo en S2, NULL sin fila local), ciclo de vida transaccional con `already_active` correctivo, retrocompatibilidad sin el parámetro, rechazo fail-closed de tienda ajena (42501) y de valores de enum inventados.

## 7. Evaluación de seguridad

**Sin hallazgos bloqueantes.**
- RLS **intacto** (cero cambios de políticas; verificado por test estático) — la columna pertenece a `products` y hereda sus políticas por tenant/tienda.
- Guardas de autorización preservadas en las 4 RPCs recreadas: `auth.uid()`, `is_admin()`, `has_store_access[_as]`, roles de tienda, `is_catalog_store_connected`; `SECURITY DEFINER` + `search_path` y OWNER/GRANT/REVOKE restaurados explícitamente (contrato del repo).
- **Sin CASCADE** (verificación previa de dependencias con `pg_depend`/`pg_rewrite`; prohibido por test).
- Sin exposición de datos entre tiendas: la clasificación es dato por tienda, jamás compartida (verificado en PG real).
- Verificación de la migración ejecutada EXCLUSIVAMENTE contra la BD desechable E2E (guard `assert-isolated-db` + ref hardcodeado; producción jamás tocada — la migración NO está aplicada en producción).
- Sin secretos en el diff (escaneado 5 patrones + binarios de evidencia).

## 8. Evaluación de pruebas

**Sólidas y con aserciones reales** (8 nuevos + 2 adaptados): los 3 caminos del alta asertan el payload real (`operational_class` en el insert local, `p_operational_class` en ambos RPCs) y el fallo sin éxito falso; contador ≡ modelo en 12 combinaciones filtro×rango; honestidad del precio en modelo y render PDF real; contrato estático de la migración (14 tests: enum exacto, nullable sin default, sin backfill, sin CASCADE, RLS intacto, sin escrituras financieras, permisos restaurados); replay manifiesto 139 con posiciones desplazadas documentadas. **No se eliminó ni debilitó ninguna prueba.** Cobertura de la lógica nueva alta; caso límite cubierto (solo «Sin clasificar», filtro vacío, precio 0, carrera de SKU por unique_violation en PG real).

## 9. Defectos encontrados

**Ninguno funcional, arquitectónico o de seguridad.** Observaciones:

| # | Observación | Severidad | Estado |
| --- | --- | --- | --- |
| O1 | Header doc de `operational-filters.ts` describía la premisa original «0 = Con precio», obsoleta tras el hallazgo del esquema real | Menor (doc) | **Corregida** en la remediación |
| O2 | La evidencia PostgreSQL real nunca se commiteó: la regla `*.log` de `.gitignore` la descartó silenciosamente — causa raíz del fallo de 2 checks CI | Alta (CI) | **Corregida** (regenerada en BD aislada + `git add -f`, precedente `audit-evidence/20260828/**/*.log`) |
| O3 | El surface LIVE (`contract-surface.sql`, 185 funciones) certifica las firmas antiguas `/11` y `/3`: la Capa C detecta correctamente que el replay ya no las reproduce — causa raíz del fallo de Security Audit | Alta (CI) | **Corregida** (baseline con expiración; ver REMEDIACION_CI_PR_1587.md) |
| O4 | **Preexistente, ajeno al PR:** `db-integration.test.ts` («superadmin sin membresías by design») contradice los datos de producción (2 membresías admin activas creadas el 5 y 7-11 en COSTPRO (Prueba) y SHADDAI). El suite se **salta en CI** (sin service-role key) y solo corre localmente. No se modificó el test ni los datos productivos | Media (observación separada) | **Documentada — requiere decisión del propietario** |
| O5 | Preexistentes: 2 warnings Capa C (`cancel_transfer/2→/3`, `reset_store_data/2→/3`) y 1.503 warnings de lint — ajenos al PR | Informativa | Sin cambios |

## 10. Clasificación de la auditoría

**B — Correcta con observaciones.** La implementación es funcionalmente correcta, completa, segura y coherente con la arquitectura COSTPRO (validada además contra PostgreSQL real). Las observaciones O1-O3 eran causa raíz de los fallos de CI y fueron corregidas en la remediación; O4 es preexistente y ajena al PR.

## 11. Correcciones realizadas

1. `audit-evidence/CP-OPERATIONAL-CLASS-002/verificacion-postgresql-real.log` — evidencia REAL regenerada (34/34) contra la BD aislada y commiteada con `git add -f`.
2. `ci-gate-allowlist.json` — 2 entradas `source_of_truth_baseline` (`create_master_product/11`, `activate_master_product/3`; regla `LIVE_FUNCTION_NOT_REPRESENTED`; added_by CP-OPERATIONAL-CLASS-002; expires 2027-01-31) con instrucción de retiro tras el despliegue autorizado.
3. `src/lib/price-list/operational-filters.ts` — header doc alineado al criterio implementado (0 líneas de código).
4. Sincronización de la rama con `main` vigente (`9620101bb`) — sin conflictos, manifiesto sin cambios (el PR #1588 no añadió migraciones).

## 12. Riesgos pendientes

- **R1 (proceso):** el `.gitignore` (`*.log`) seguirá descartando futuras evidencias `.log` — recomendar convención explícita (negación `!audit-evidence/**/*.log` o usar `.txt`).
- **R2 (despliegue):** al aplicar la migración 20261108150000 en producción (canal habitual, autorización del propietario) DEBE retirarse la excepción del baseline y regenerar `contract-surface.sql` (`scripts/export-contract-surface.cjs`) — está documentado en la razón de cada entrada.
- **R3 (datos):** decidir la premisa del test de integración del superadmin (O4): o actualizar el test al nuevo diseño (si las membresías son intencionales) o depurar las membresías — decisión del propietario, fuera del alcance de este PR.

## 13. Conclusión técnica

El PR #1587 **supera la auditoría de implementación (clasificación B)**: hace lo que declara, sobre datos reales, sin valores simulados, con RLS y aislamiento multi-tenant intactos, migración verificada en PostgreSQL real y pruebas con aserciones que detectan los defectos que pretenden prevenir. Los fallos de CI no revelaban defectos de implementación sino de **proceso de entrega** (evidencia descartada por `.gitignore` y surface pendiente de recertificación hasta el despliegue), ambos corregidos sin debilitar controles. Tras la remediación (`9aebce04d`), las verificaciones obligatorias del PR pasan en GitHub.
