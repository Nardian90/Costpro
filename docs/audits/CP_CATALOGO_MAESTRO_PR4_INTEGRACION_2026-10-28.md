# CP-CAT-MAESTRO · PR 4 — Integración de consumidores (2026-10-28)

**Misión**: Catálogo Maestro por Organización — etapas 5-6 del informe (separación de datos comerciales e integración con operaciones).
**Cadena**: PR 1 (#1518) → PR 2 (#1519) → PR 3 (#1520) → **este PR**.
**Estado**: implementado, migración aplicada en producción, superficie regenerada, pruebas verdes. NO fusionado.

## 1. Clasificación de consumidores (misión §11)

| Consumidor | Decisión | Justificación |
|---|---|---|
| POS (create_sale_v2) | SIN CAMBIO | lee precio/WAC/existencia de la fila local; el aislamiento cross-store ya fue cerrado en PR 1 |
| get_products_for_pos | EXTENDIDO | búsqueda/escaneo resuelve barcode canónico desde el maestro de la misma organización |
| get_paginated_products_v2 | EXTENDIDO | ídem para el catálogo paginado |
| Catálogo (UI) | NUEVO ACCESO | botón «Catálogo de la organización» + MasterCatalogModal con activación |
| Alta de producto (CreateProductModal) | EXTENDIDO | dedup previa por SKU contra el maestro; ofrece activar en vez de duplicar |
| Edición de producto (EditProductModal) | EXTENDIDO | SKU/nombre de solo lectura en filas vinculadas (el servidor coacciona por trigger) |
| Recepciones / kardex / transferencias / reportes / vitrina | SIN CAMBIO | consumen la fila local; ninguna RPC de negocio calcula desde el maestro |
| Importación masiva | SIN CAMBIO (ya endurecida en PR 1) | filas con tenant estampado; dedup por (sku, store_id) existente |

## 2. Migración 20261028120000 — barcode canónico en búsquedas

- Problema: el código canónico vive en `master_products`; las filas locales de las demás tiendas quedan con `barcode NULL` (no pueden repetir el código de la fila de origen por `products_barcode_unique`). Sin este ajuste, escanear el código en otra tienda conectada no encontraría el producto (matriz de pruebas de la misión, caso 8).
- Solución: criterio adicional en ambas funciones — `p.master_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM master_products m WHERE m.id = p.master_product_id AND m.barcode = <búsqueda> AND m.tenant_id = tenant de la fila local)`. Coste O(1) por fila candidata (índice propio + índice único parcial del maestro); coste cero para productos sin maestro.
- Método: extracción mecánica de las definiciones vigentes de `20261020000001` (script `scripts/gen_pr4_busquedas_maestro.py`, fuera del repo), cuerpo idéntico salvo el criterio; diff verificado.
- Aplicada en producción; contract surface regenerada (165 funciones, 0 divergencias).

## 3. Flujos de cliente

- `src/hooks/api/useMasterCatalog.ts`: hooks React Query que delegan en las RPC certificadas (`search_master_products`, `activate_master_product`, `connect/disconnect_store_catalog`, `update_master_product`, `propose_master_change`, `review_master_proposal`) + `findMasterBySku` (dedup de alta, fail-open si la tienda no está conectada).
- `MasterCatalogModal` + botón en CatalogView + flags en UI store + montaje global en TerminalShell.
- CreateProductModal: verifica el maestro ANTES del insert (`findMasterBySku` precede a `createProductMutation.mutateAsync` — probado); si existe y no está activado, confirmación → activación; si ya está activado, error claro.
- EditProductModal: consulta `products.master_product_id` y bloquea (disabled) SKU y nombre con aviso; el servidor además coacciona (defensa en profundidad).

## 4. Pruebas

- 7 casos nuevos en `src/__tests__/hooks/useMasterCatalog-catalogo.test.tsx` (contrato de RPC con parámetros exactos, filtro de disponibles, delegación de activación, match exacto case-insensitive, fail-open, cableado estático de los 3 componentes). Nota: el render completo de los modales se sustituyó por verificación de cableado porque arrastra primitivas de UI no cubiertas por el mock mínimo; la lógica está cubierta por los hooks.
- `src/__tests__/migrations`: 286 verdes. Replay manifest: 108 (posición 108 anotada). `tsc` focalizado: 0 errores.

## 5. Reversibilidad

Re-aplicar las definiciones de `20261020000001` restaura las búsquedas; revertir el commit elimina hooks/UI (el modelo del PR 3 no depende de ellos).

## 6. Limitaciones

1. La verificación visual completa (vitrina, POS en vivo) corresponde al entorno E2E aislado tras fusión.
2. El panel de gobernanza de la vista Organizaciones y las imágenes compartidas se entregan en el PR 5 (pendiente explícito documentado).
