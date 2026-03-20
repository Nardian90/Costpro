# Auditoría de Cumplimiento de SKU

## Estado Inicial (Pre-Cambios)
**Fecha:** 2026-02-23
**Evaluación:** 3/10

### Hallazgos:
1. **Base de Datos:** La columna `sku` en la tabla `public.products` es `UNIQUE` pero no tiene restricción `NOT NULL`.
2. **Creación de Producto (UI):** El modal `CreateProductModal.tsx` no valida la presencia del SKU antes de enviar el formulario.
3. **Recepción de Productos (UI):** La vista `ProductReceptionView.tsx` asume que el SKU existe pero no lo valida estrictamente durante el proceso de guardado manual o mapeo.
4. **Importación Masiva (RPC):** La función `process_bulk_import` utiliza `NULLIF(v_item->>'sku', '')`, lo que permite que el SKU sea nulo si no se proporciona en el JSON.
5. **Esquemas de Validación:** Aunque existen `catalogImportRowSchema` y `receptionImportRowSchema` en `src/validation/schemas.ts` que marcan el SKU como obligatorio, estos no se aplican en todos los puntos de entrada (especialmente en la creación manual).

## Estado Final (Post-Cambios)
**Fecha:** 2026-02-23
**Evaluación:** 10/10

### Mejoras Realizadas:
- **Base de Datos:** Se aplicó una migración para establecer `sku` como `NOT NULL` y añadir un `CHECK (sku <> '')`.
- **UI de Creación:** El modal `CreateProductModal.tsx` ahora exige nombre y SKU antes de permitir la creación.
- **UI de Recepción:** `ProductReceptionView.tsx` valida que todos los productos en la lista tengan un SKU antes de procesar la recepción o exportar la lista.
- **RPCs Hardened:** Se actualizaron `fn_process_receipt` y `process_bulk_import` para validar la presencia de SKU a nivel de servidor, lanzando excepciones descriptivas.
- **Esquemas de Validación:** Se actualizó `productSchema` en `src/validation/schemas.ts` para que el SKU sea estrictamente obligatorio (`z.string().min(1)`).
- **Pruebas Unitarias:** Se actualizaron las pruebas de esquema de producto para reflejar la obligatoriedad del SKU.

### Conclusión:
El sistema ahora garantiza que no existan productos sin SKU en ninguna de las etapas críticas de su ciclo de vida (creación, importación o recepción).
