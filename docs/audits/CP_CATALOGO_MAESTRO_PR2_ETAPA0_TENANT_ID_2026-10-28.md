# CP-CAT-MAESTRO · PR 2 — Etapa 0: remediación de integridad organizacional (2026-10-28)

**Misión**: Catálogo Maestro de Productos por Organización — Etapa 0 (misión §7), decisión J.2 del informe.
**Depende de**: PR 1 (`fix/catalogo-bloqueos-seguridad-20261028`, #1518) — no funcionalmente, pero se recomienda orden secuencial.
**Estado**: dry-run ejecutado, migración versionada aplicada en producción con verificación previa/posterior y manifiesto recuperable. PR abierto para revisión/CI. NO fusionado.

## 1. Contenido

| # | Cambio | Archivo |
|---|--------|---------|
| 1 | Migración versionada de backfill determinista `tenant_id` | `supabase/migrations/20261028100000_cp_catalogo_etapa0_backfill_products_tenant_id.sql` |
| 2 | Contrato estático de la migración (6 casos) | `src/__tests__/migrations/cp-catalogo-pr2-etapa0-tenant-backfill-migration.test.ts` |
| 3 | Auditoría de la etapa | este documento + `audit_logs` (manifiestos) |

## 2. Análisis previo y dry-run (solo lectura, 28-10-2026)

Ejecutado con `scripts/pr2-etapa0-dryrun.cjs` (fuera del repo). Resultado (`audit/catalogo-maestro/pr2-etapa0-dry-run.json`):

- **197 de 224** productos con `tenant_id` nulo: ENERVIDA-VITALLCONS 161, Puerto Padre VITALLCONS 36.
- Ambas tiendas pertenecen a **Vitallcons** (`5364ccf8-e6cd-4c38-aea8-b167b3b5576f`, FK verificada) → derivación **determinista** por `store_id`.
- **0 contradicciones** (ningún producto etiquetado difiere del tenant de su tienda) y **0 ambiguos** (ninguna tienda con productos carece de organización).
- 171 de los 197 tienen movimientos históricos (`has_movements`) — el backfill **no toca** datos comerciales ni identificadores, solo rellena la columna de organización derivable.
- Veredicto: **PROCEDE**.

## 3. Diseño de la migración (misión §7, requisitos 1-10)

Un solo bloque `DO $etapa0$` transaccional; **cualquier verificación fallida hace ABORT y revierte todo**:

| Verificación | Contenido |
|---|---|
| V3 | Cero ambiguos: si una tienda con productos no tiene organización → aborta (no se toca ningún ambiguo). |
| V2 | Cero contradicciones producto≠tienda → aborta (inconsistencia no contemplada). |
| Cuantificación | Cuenta las filas a remediar y construye el manifiesto ANTES del UPDATE. Idempotente: con 0 filas termina sin cambios. |
| V4 | Filas actualizadas == filas cuantificadas, si no → aborta. |
| V5 | Los únicos nulos restantes deben ser los justificados por tiendas sin organización → aborta si hay otros. |

**UPDATE**: `tenant_id = stores.tenant_id` por JOIN en `store_id`, solo filas `tenant_id IS NULL AND stores.tenant_id IS NOT NULL`. Sin matching por nombre/SKU/aproximaciones (probado por contrato estático). `updated_at` se refresca; nada más se toca.

**Evidencia persistida** (`audit_logs`, acción `CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID`, 6 filas):
- Global `system` «antes»: 197 filas + manifiesto completo (id, sku, tienda, tenant anterior/nuevo).
- Por tienda «antes»: ENERVIDA 161, Puerto Padre 36 (sub-manifiestos).
- Global `system` «después»: 197 actualizadas, 0 nulos restantes + manifiesto del estado final.
- Por tienda «después»: 36 y 188 filas con organización.

**Recuperación**: el manifiesto «antes» permite reconstruir el estado previo (`tenant_id → NULL` en las 197 filas listadas); el proceso es trivialmente reversible porque la columna es derivable de la tienda.

## 4. Verificación posterior real (BD viva, 28-10-2026)

| Métrica | Valor |
|---|---|
| Total productos | **224** (sin cambios) |
| Productos con `tenant_id` nulo | **0** (antes 197) |
| ENERVIDA-VITALLCONS → Vitallcons | **188** |
| Puerto Padre VITALLCONS → Vitallcons | **36** |
| Filas de auditoría generadas | 6 (2 globales + 4 por tienda) |
| Otros cambios | ninguno (UPDATE restringido a `tenant_id` y `updated_at`) |

Evidencia fuera del repo: `audit/catalogo-maestro/pr2-etapa0-dry-run.json` y `pr2-etapa0-post-verificacion.json`.

## 5. Impacto en runtime

- Las políticas `products_tenant_insert/_update` (que ya exigen `tenant_id = current_user_tenant_id()`) quedan ahora satisfechas por los datos históricos, no solo por los nuevos.
- El flag `app.use_tenant_rls` NO está activo en producción: la rama CASE de `products_tenant_select` no cambia de comportamiento con este backfill (cero regresión operativa).
- El importador endurecido (PR 1) y las futuras tablas maestras heredan datos con organización íntegra.

## 6. Pruebas

- Contrato estático: 6 casos (`vitest run src/__tests__/migrations/cp-catalogo-pr2-etapa0-tenant-backfill-migration.test.ts`) — verdes.
- Suite de regresión de la carpeta: `src/__tests__/migrations` completa verde (ejecutada con PR 1: 21 archivos).

## 7. Limitaciones

1. El campo «usuario responsable» citado en la misión §7 no existe como columna en `products` (la tabla no tiene `created_by`); la detección de contradicciones se limita a producto↔tienda, que es la relación persistida. Documentado como decisión de diseño.
2. `updated_at` de las 197 filas cambió como efecto colateral documentado del UPDATE (convención del repo para trazabilidad de cambios de fila).
