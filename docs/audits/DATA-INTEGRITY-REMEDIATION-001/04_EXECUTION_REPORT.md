# 04_EXECUTION_REPORT — Modificaciones realizadas

**Estado de producción al cierre:** las migraciones A/B/C están en este PR (pendientes de la decisión del propietario — NO se aplicaron a producción). Las únicas escrituras ejecutadas contra producción durante la misión fueron las 4 idempotentes de restauración R1 (§2) y la subida del addendum al bucket privado de respaldos. Todo lo demás fue verificación en el clúster local.

---

## 1. Migraciones SQL versionadas (en este PR)

| Migración | Contenido | Idempotencia verificada |
|---|---|---|
| `20261108140000_data_integrity_remediation_001_soft_refs.sql` | A: `parent_deleted_at`/`product_deleted_at`; DROP de las 4 FKs de las tablas de snapshot; backfill 72/18/10; 3 triggers de marcado; 2 triggers de validación de escritura (23503); 2 filas de auditoría en `audit_logs` | Triple ejecución OK, estado invariante |
| `20261108140100_data_integrity_remediation_001_storage_reconcile.sql` | B: **cero DML** — auditoría de la corrección del diagnóstico del Problema B (falso positivo documentado con causa raíz, registro de las 4 escrituras R1, estado del bucket: 31 filas, 10 con referencia viva, acción sobre datos: NINGUNA) | Doble ejecución OK |
| `20261108140200_data_integrity_remediation_001_prevention.sql` | C: `check_data_integrity()` (inventario de huérfanos/soft-refs) y `reconcile_storage_metadata()` (filas sin referencia / referencias sin fila), ambas con `ERR_PERMISSION_DENIED` + REVOKE anon/PUBLIC + GRANT authenticated/service_role; trigger `trg_stores_mark_orphan_versions` | Doble ejecución OK |

## 2. Escrituras ejecutadas en producción (inventario completo y exhaustivo)

| # | Operación | Objeto | Contenido | Verificación |
|---|---|---|---|---|
| 1–4 | `PUT /storage/v1/object/stores/...` (fase R1, antes del descubrimiento del falso positivo) | `store-banners/enervida-banner-1783144848029.png` (202 313 B), `store-promo-images/enervida-promo1-v2-...png` (162 581 B), `...promo2-v2-...` (101 344 B), `...promo3-...` (140 138 B) | Copias byte-exacta del repositorio (proveniencia git `e595fcda0`, 2026-07-05) subidas a sus **mismas rutas** — objetos que ya existían con esos mismos bytes | GET público 200 + SHA-256 idéntico al archivo del repo; sin efecto neto |
| 5 | `POST /storage/v1/object/respaldos-costpro/...` (subida addendum) | `respaldos/costpro-respaldo-addendum-storage-20261108-0056.7z` (24 622 850 B) | AES-256, 308 entradas: carpeta `storage/` completa (307 archivos de TODOS los buckets, incluidos los 153 anidados que faltaban) + manifiesto regenerado | Descarga + SHA-256 IDÉNTICO (`e66121c4…`) |

**No hubo ninguna otra escritura.** En particular: ningún UPDATE/DELETE de datos de producción, ninguna fila de `storage.objects` eliminada, ningún cambio en `stores`, `commission_*`, `purchase_*`, `profiles`.

## 3. Correcciones de herramientas (fuera del repo de la app, en `scripts/` de la misión)

- `12-descargar-storage.py` (descargador del respaldo): bug 1 — URL de descarga omite el prefijo de carpeta (`name` del list es relativo al prefijo) → todos los objetos anidados daban NoSuchKey y se clasificaban "fantasma" (31 de `stores`); bug 2 — la recursión de carpetas perdía el prefijo acumulado → `reports` (doble anidación) descargaba 0 archivos. Corregidos ambos; re-descarga completa: 307 archivos, 0 errores, 0 discrepancias de tamaño, manifiesto con SHA-256 por archivo regenerado.

## 4. Código de la aplicación (en este PR)

- `src/app/tienda/[slug]/StorefrontPage.tsx`: placeholders controlados para recursos inexistentes — banner con `onError` → banner oficial del repo (`/storefront-construccion-banner.png`); logo con `onError` → icono `Package` (identidad visual existente, nunca imagen ajena) en las 3 plantillas que lo muestran; carrusel de promos excluye las imágenes rotas (`brokenUrls`) y no se renderiza si todas fallan. Cero cambios de layout/estilo más allá del fallback.
- `scripts/reconcile-storage.mjs`: verificador read-only post-despliegue — HEAD público por cada referencia viva de `stores` (como un navegador), RPC `reconcile_storage_metadata()` para filas sin referencia; exit 1 si hay referencias rotas. Construye las URLs con la **ruta completa** de la referencia (no repite el bug del descargador).

## 5. Pruebas (en este PR)

- `src/__tests__/e2e/data-integrity-remediation-001.test.ts` — 23 asserts estáticos (cero red): idempotencia de A (ADD/DROP IF EXISTS, backfill IS NULL, auditoría NOT EXISTS), B sin DML + documentación del falso positivo, C con permisos correctos, triggers presentes, sin CASCADE destructivo ni `session_replication_role`, placeholders UI, verificador sin DELETE.
- `src/__tests__/e2e/replay-unblock-create-sale-v2.test.ts` — conteo del manifiesto replay actualizado 130→133 con las posiciones 131/132/133 certificadas (patrón establecido del repo; posiciones históricas 74/75/76/80 intactas).

## 6. Qué NO se hizo (deliberadamente)

- No se aplicaron las migraciones a producción (el PR queda abierto para revisión del propietario; las migraciones se aplicarán con el flujo establecido tras el merge).
- No se eliminó ni modificó ninguna fila de `storage.objects` (la eliminación R3 de la primera versión de la migración B se desechó al descubrirse el falso positivo; el clúster local donde se probó fue revertido re-restaurando el dump).
- No se recrearon reglas/tiendas/workers/perfiles muertos, ni se pusieron sus snapshots a NULL (conservación íntegra).
- No se tocaron los flujos de cálculo de comisiones, ventas, kardex ni el respaldo original (el 7z original permanece; el addendum lo complementa).
