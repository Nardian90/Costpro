-- ============================================================================
-- CP-CORRECCIONES-VENTAS-ALMACÉN-001 — INCIDENCIA 1
-- Corrección del nombre desactualizado del SKU 176 (ENERVIDA-VITALLCONS).
--
-- SÍNTOMA REPORTADO POR EL PROPIETARIO
--   · Vender (POS) e Inventario mostraban el nombre antiguo
--     «Brecker 125 A» / «Brecker de 125A».
--   · La edición del producto mostraba el texto correcto
--     «Bateria 12.8V x 100Amp» en el campo Descripción.
--
-- CAUSA RAÍZ (trazabilidad sobre la fila real, 2026-10-30)
--   products (id 8d8df1be-91ed-4ec8-aa77-b85dc4c57887, store
--   5e6fe821-5465-48b1-b3f1-3aa3182edc38, sku '176'):
--     name        = 'Brecker de 125A'          ← campo canónico, desactualizado
--     description = 'Bateria 12.8V x 100Amp'   ← la corrección se guardó aquí
--   El sistema usa `products.name` como campo CANÓNICO de identidad y
--   visualización en TODAS las vistas (get_products_for_pos en Vender,
--   InventoryTableView/Mobile/Card en Inventario, product-presentation.ts
--   para Vitrina/Telegram). No hay bug de binding en EditProductModal
--   (name→name, description→description) ni de caché (useUpdateProduct
--   invalida las 3 familias de queries). La corrección del nombre se
--   escribió en `description`, dejando `name` desactualizado.
--   ENERVIDA NO está vinculada al Catálogo Maestro (master_product_id NULL):
--   la incidencia NO proviene del maestro ni se corrige vía maestro.
--
-- CORRECCIÓN
--   Actualización QUIRÚRGICA del campo canónico de UNA fila. Idempotente
--   (no-op si ya está corregido). NO modifica precios, costos, existencias,
--   barcode, ni ningún otro producto (prohibición expresa de la misión).
--   La descripción se conserva tal cual (no se pierde información).
--
-- VERIFICACIÓN POST-APLICACIÓN (read-only, usada por el informe)
--   SELECT sku, name, description FROM products
--    WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND sku='176';
--   → name = 'Bateria 12.8V x 100Amp'
-- ============================================================================

UPDATE public.products
SET name = 'Bateria 12.8V x 100Amp'
WHERE id = '8d8df1be-91ed-4ec8-aa77-b85dc4c57887'
  AND store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND sku = '176'
  AND name IS DISTINCT FROM 'Bateria 12.8V x 100Amp';
