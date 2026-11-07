# INFORME DE CIERRE — RECONCILIACIÓN ENERVIDA ↔ CATÁLOGO MAESTRO + SINCRONIZACIÓN DESDE RECEPCIONES

Expediente: `docs/audits/2026-11-08-catalogo-maestro-enervida-recepciones/`
Fecha: 2026-11-08 · Rama: `fix/catalogo-maestro-enervida-recepciones-20261107` · PR: #1565
Actor de la reconciliación: gobernador del catálogo de la organización Vitallcons
(owner del tenant `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`).

## A. Diagnóstico inicial (cerrado — ver DIAGNOSTICO.md)

1. **Causa exacta del desfase**: los productos nuevos creados desde Recepciones nacían
   sin vínculo al maestro (`register_reception` insertaba en `products` sin
   `master_product_id`); solo llegaban al Catálogo Maestro cuando alguien ejecutaba a mano
   el backfill `incorporate_store_products_to_master`. Evidencia: SKUs 187–196 de Enervida
   creados 2026-11-06 14:45 por recepción, incorporados 2026-11-07 17:03.
2. **Causa exacta de la no-incorporación**: mismo defecto (bloque `new_product` de la RPC
   `register_reception`, migración `20261105140000`, líneas ~1327-1372).
3. **Implicados**: RPC `register_reception` (ruta única online+offline), migración
   `20261107120000` (corrección canónica, ya aplicada en producción por CP-CAT-MAESTRO-003),
   RPC `incorporate_store_products_to_master`, RPC `reconcile_store_catalog_shared_data`
   (nueva, 20261108120000), UI (`useReceptionState`, `ReceptionSuccessModal`,
   `ProductReceptionView`, `useSavePendingReception`), ruta `/api/catalog/bulk-import`
   (estampado de identidad compartida pre-upsert), helpers `is_catalog_store_connected`,
   `is_catalog_governor`, `fn_master_apply_identity_changes`.

## B. Resultado de la reconciliación (producción, ejecutada 2026-11-08)

| Concepto                                        | Cantidad |
| ------------------------------------------------| -------: |
| Productos existentes en Enervida                |      198 |
| Productos correctamente vinculados inicialmente |      198 |
| Productos maestros creados (esta pasada)        |        0 |
| Relaciones nuevas creadas (esta pasada)         |        0 |
| Relaciones corregidas                           |        0 |
| Datos compartidos actualizados                  |        0 |
| Duplicados detectados                           |        0 |
| Conflictos pendientes de revisión               |        0 |
| Productos reconciliados finalmente              |      198 |

Notas de la tabla:
- El desfase histórico ya había sido reparado por las ejecuciones de backfill del
  2026-10-31 y 2026-11-07 (198 eventos `INCORPORATE_PRODUCT_TO_MASTER` auditados); esta
  pasada confirma que NO quedan pendientes y que el proceso es idempotente.
- 1 maestro sin correspondencia en Enervida: `QA-CM-20261030-01` («QA CM-004 Producto de
  prueba tecnica v2», estado `archived`, sin vínculos) — **conservado** por diseño
  (misión §3.5: no eliminar maestros que no aparecen en Enervida). Reportado para revisión
  de gobernanza; no interfiere con el catálogo (estado archived).
- Verificación independiente post-reconciliación (`evidencia/enervida_estado_final.json`):
  198/198 vinculados, 0 divergencias de SKU/nombre/imagen, 0 duplicados de SKU,
  0 SKU inválidos, 0 conflictos.

Mecanismo ejecutado (con `p_user_id` del gobernador; auditado en `master_change_log` y
`audit_logs`): vista previa (`p_dry_run=true`) → aplicar → segunda pasada. Evidencias
íntegras en `evidencia/reconciliacion_1..6*.json`:

| Paso | RPC | Resultado |
| --- | --- | --- |
| 1 Preview | `incorporate_store_products_to_master` (dry-run) | total_candidates=0, conflicts=0 |
| 2 Aplicar | `incorporate_store_products_to_master` | created=0, linked=0, conflicts=0 |
| 3 Preview | `reconcile_store_catalog_shared_data` (dry-run) | 198 filas revisadas, 0 desfasadas, 0 conflictos |
| 4 Aplicar | `reconcile_store_catalog_shared_data` | identity=0, image=0, local_image=0 |
| 5-6 2ª pasada | ambas | 0/0/0 → **IDEMPOTENCIA OK** |

## C. Resultado de la corrección funcional (Pruebas obligatorias — E2E BD aislada)

Spec `e2e/master-catalog-receptions-sync.spec.ts` — **6/6 PASS** + guardrail de higiene
net-zero contra la BD aislada CostproE2E (`lguovmvrozxgssupkwpf`):

- **P2 (Prueba 2)** — recepción en Enervida-análoga conectada, SKU nuevo: producto local +
  maestro + `products.master_product_id` + `master_change_log` + `audit_logs`
  (`RECEPTION_PRODUCT_LINKED_MASTER`) en UNA transacción; nombre, SKU e inventario local
  correctos. La sincronización es automática; sin pasos manuales.
- **P3 (Prueba 3)** — SKU ya registrado en el maestro: NO se crea un segundo maestro; la
  fila local se vincula al maestro correcto y la identidad canónica del maestro prevalece
  (trigger de identidad), conservando los datos comerciales locales.
- **P4 (Prueba 4)** — tienda NO conectada: producto creado solo local, sin maestro, sin
  vínculo (CASO B intacto).
- **P5 (Prueba 5)** — seguridad: un no-gobernador no puede reconciliar (ERR_UNAUTHORIZED);
  reconciliar una tienda de otra organización se rechaza; vincular un maestro de otra
  organización falla (ERR_STORE_MISMATCH); el tenant del maestro SIEMPRE se resuelve en el
  servidor desde la tienda (jamás del cliente).
- **P6 (Prueba 6)** — fallos y reintentos: un item inválido revierte la recepción COMPLETA
  (producto, maestro y receipt incluidos — atomicidad); el reintento válido prospera sin
  duplicados; la factura duplicada produce `ERR_INVOICE_DUPLICATE` sin efectos residuales.
- **P1 (Prueba 1)** — reconciliación: 2ª pasada de `incorporate` con 0 creaciones/0
  vínculos; drift simulado de nombre detectado por `reconcile_store_catalog_shared_data`
  (dry-run reporta `would_update_master`), corrección con auditoría old/new en
  `master_change_log`, datos comerciales locales intactos (stock=4, costo=9 tras la
  propagación) y segunda pasada en 0 (idempotente).

Confirmaciones exigidas (misión §8C): sincroniza automáticamente solo cuando la tienda está
conectada ✔ · reutiliza maestros existentes ✔ · no duplica productos ni maestros ✔ ·
mantiene los datos locales de cada sucursal (precio/costo/existencia verificados en P1/P2)
✔ · los errores se informan de forma comprensible (clasificadores UI + mensajes ERR_*) ✔.

## D. Evidencias técnicas

- **Migraciones**: `20261107120000_cp_catalogo_maestro_sync_register_reception.sql`
  (CP-CAT-MAESTRO-003, aplicada en producción 2026-11-07) y
  `20261108120000_cp_catalogo_reconciliacion_datos_compartidos.sql` (esta sesión, aplicada
  en producción 2026-11-08 vía `scripts/apply-migration.mjs --target prod --confirm-prod`
  con guard CP-INFRA-019, HTTP 201 + pgrst reload).
- **Archivos del PR** (desde la rama `fix/catalogo-maestro-enervida-recepciones-20261107`):
  migraciones citadas, `src/app/api/catalog/bulk-import/route.ts`,
  `src/hooks/api/useReceptions.ts`, `src/components/views/terminal/views/inventory/{useReceptionState,ReceptionSuccessModal,ProductReceptionView}.tsx`,
  `scripts/apply-migration.mjs`, `supabase/security-contract/contract-surface.sql`,
  tests `cp-catalogo-m003-register-reception-master-sync.test.ts`,
  `cp-catalogo-reconciliacion-datos-compartidos.test.ts`,
  spec `e2e/master-catalog-receptions-sync.spec.ts`, evidencias en `audit-evidence/CP-CAT-MAESTRO-003/`
  y en este expediente.
- **RPCs**: `register_reception` (corregida, firma 11 params intacta, SECURITY DEFINER),
  `reconcile_store_catalog_shared_data` (nueva), `incorporate_store_products_to_master`
  (reutilizada), `e2e_hard_delete_store/e2e_hard_delete_user` (higiene).
- **Pruebas**: estáticas de migración (39 asertos entre ambos archivos), unitarias del
  import (mocks) y E2E 6/6. Suite local: `bunx vitest run` verde en los archivos tocados;
  `tsc --noEmit` limpio; `bun run lint` sin errores (warnings preexistentes del repo).
- **CI/PR**: commits `d537f8a51`/`c6a6b49ef` (mi rama, reorganizados), `fa2cee07e` (push a
  la rama del PR #1565). CI corre automáticamente en el PR.
- **Higiene E2E**: `data-hygiene-guard.cjs` → `PASS — net delta = 0` (limpieza de residuos
  preexistentes y de semillas de run documentada).

## E. Resultado final

1. **CATÁLOGO MAESTRO ACTUALIZADO** ✔ — 198/198 productos de Enervida vinculados a su
   maestro con SKU, nombre e imagen coherentes; 0 duplicados; 0 conflictos; operación
   idempotente re-ejecutable con vista previa (dry-run) y trazabilidad completa.
2. **SINCRONIZACIÓN AUTOMÁTICA FUNCIONAL** ✔ — cualquier producto nuevo creado desde
   Recepciones en una tienda conectada se incorpora al Catálogo Maestro y queda vinculado
   en la misma transacción (verificado E2E y en producción); tiendas no conectadas sin
   cambios; protección cross-organización estructural.

La solución es genérica para TODAS las tiendas conectadas (decisión por
`is_catalog_store_connected`, no por tienda), reutiliza la arquitectura vigente
(sin mecanismos paralelos) y no convierte datos comerciales locales en datos globales.
