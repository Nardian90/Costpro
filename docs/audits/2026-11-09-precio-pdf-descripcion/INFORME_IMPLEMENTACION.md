# CP-PRECIO-PDF-DESC-001 — Opción «Mostrar descripción en PDF» en el Listado de precios

**Fecha:** 2026-11-09 · **Rama:** `feat/precio-pdf-descripcion-20261109` · **Vista:** Inicio → OPERACIÓN → Ventas → Listado de precios (viewId `listado-precios`)

## 1. Objetivo

Permitir decidir, desde la propia vista, si la **descripción** de los productos se incluye o no en el PDF exportado del Listado de precios (control Sí / No), sin alterar nombres, precios, códigos, unidades, existencias ni ningún dato almacenado.

## 2. Qué cambia (3 archivos de producción)

| Archivo | Cambio |
| --- | --- |
| `src/lib/price-list/model.ts` | `PriceListRow` ahora lleva `name` y `description` como **campos separados** (antes `commercialDescription()` los fusionaba como «name — extra», lo que la misión prohíbe expresamente). Nueva opción `includeDescription` en `buildPriceListModel` (por defecto `true`) y `meta.includeDescription` en el modelo. Nuevo helper puro `priceListCellText()`: con descripción compone `nombre\nDescripción`; sin ella, solo el nombre. El plan de páginas mide el texto efectivo de la celda. |
| `src/lib/price-list/pdf.ts` | Celda a dos niveles: **nombre** (presentación primaria, 7.6 pt, tinta principal) y debajo la **descripción** con presentación secundaria (6.7 pt, tono atenuado), con ajuste de línea a varias líneas y **altura de fila dinámica** (nunca se corta, se superpone ni sale de márgenes; ninguna fila se parte entre columnas o páginas). Al ocultar: solo el nombre, filas compactas, sin huecos ni cambio de alineación. Encabezado de columna honesto según la opción: «Producto y descripción» / «Producto». El medidor real del plan mide cada bloque con su propia fuente. |
| `src/components/views/terminal/views/price_list/PriceListView.tsx` | Nuevo control **«Mostrar descripción en PDF»** (Sí / No) integrado con los grupos de opciones existentes (mismo estilo de chips con `aria-pressed`, objetivos táctiles, nota de alcance). Forma parte de la firma de la vista previa: cambiar la opción tras generar marca la vista «desactualizada». La opción se pasa al modelo y **controla realmente** la inclusión/omisión del campo en el documento. No filtra filas ni toca datos. |

La selección afecta **únicamente al PDF que se está generando**: previsualización y exportación comparten el mismo modelo (pipeline único preexistente, sin cambios).

## 3. Ajuste mínimo de legibilidad (mismo reporte)

El rótulo del encabezado de la primera columna era «SKU / Código»; a 7.6 pt bold su texto invadía la columna contigua (defecto preexistente del diseño, visible en el encabezado del bloque). Se renombró a **«SKU»**, coherente con los filtros «SKU desde / SKU hasta» de la propia vista. Sin otros cambios de diseño ni de columnas.

## 4. Pruebas (§6 de la misión)

- **Suite unitaria del listado: 91/91 PASS** (`price-list-pdf`, `price-list-price-honesty`, `price-list-sku`, `price-list-operational-filters`, vista y hook). Nueva suite `CP-PRECIO-PDF-DESC-001` con la matriz completa: nombre+descripción, descripción extensa multilínea (ninguna palabra recortada), producto sin descripción (misma altura con Sí o No — sin espacios vacíos), acentos y caracteres especiales (ñ, °, ×, ½, m²), Sí vs No (nombres/SKU/precios idénticos; la única diferencia es la descripción), filas multilínea nunca partidas entre columnas/páginas, y control real desde la UI (`includeDescription` false/true + vista «desactualizada» al cambiar).
- `tsc --noEmit` limpio; `eslint` sin errores en los archivos tocados.
- **Suite completa del repo:** 5655 passed; único fallo = `db-integration › superadmin … NO store memberships by design`, **preexistente y ajeno** (falla idéntico en `main`; tema O4 de otra misión, dependiente del estado de la BD).
- **Evidencia PDF real** (mismo generador de producción, tienda ficticia, sin conexión a BD):
  - `listado-precios-con-descripcion.pdf` — «Mostrar descripción: Sí»
  - `listado-precios-sin-descripcion.pdf` — «Mostrar descripción: No»
  - Verificación sobre los bytes reales de ambos documentos: **11/11 PASS** (script re-ejecutable `scripts/dev-price-list-descripcion-evidence.ts`).

## 5. Alcance y conservación (§5 de la misión)

No se modifican: nombres ni descripciones almacenadas, precios, códigos, unidades, existencias, consultas (RPC `get_products_for_pos` intacto), cálculos ni reglas de negocio, los filtros existentes de la vista, otros reportes ni documentos PDF de COSTPRO (p. ej. el template POS `PriceListTemplate.ts` y el documento SC 2-1-3 quedan intactos), ni la configuración de cada tienda (el control es de sesión, por generación del documento).

## 6. Criterio de aceptación

Cumplido: el usuario decide desde el Listado de precios si las descripciones aparecen en el PDF, y esa decisión no altera el nombre, los datos ni la información almacenada de los productos.
