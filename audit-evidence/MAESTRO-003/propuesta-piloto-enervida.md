# Propuesta de piloto real — Catálogo Maestro con ENERVIDA (misión CP-CAT-MAESTRO-003 §9)

**Estado: PROPUESTA — espera autorización expresa del propietario antes de ejecutar cualquier vinculación real.**
Este documento no ejecuta ninguna operación sobre datos reales.

---

## 1. Objetivo del piloto

Convertir el catálogo actual de la tienda **ENERVIDA-VITALLCONS** (tienda `5e6fe821-5465-48b1-b3f1-3aa3182edc38`, organización Vitallcons `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`) en la **fuente inicial de identidad común** de la organización, empezando por **una categoría pequeña y homogénea**, y dejar preparado el terreno para que la segunda tienda (y posteriormente Puerto Padre, NO en este piloto) se conecte y active esos productos.

## 2. Alcance propuesto (una sola categoría, 7 productos)

**Grupo seleccionado: «Cables»** — 7 productos que comparten patrón de nombre, 6 de 7 con imagen y todos con SKU + barcode internos consistentes:

| # | SKU | Nombre (identidad propuesta) | Barcode | Imagen | Precio local ENERVIDA | Stock |
|---|-----|------------------------------|---------|--------|----------------------|-------|
| 1 | `135` | Cable 6 | INT000000001197 | no | 10 USD | 0 |
| 2 | `12` | Cable Conductor eléctrico 10 | INT000000000033 | sí | 1350 CUP | 0 |
| 3 | `13` | Cable Conductor eléctrico 8 | INT000000000032 | sí | 1500 CUP | 0 |
| 4 | `87` | Cable Solar Negro 4mm | INT000000000018 | sí | 4.5 USD | 114 |
| 5 | `89` | Cable Solar Negro 6mm | INT000000000053 | sí | 5 USD | 0 |
| 6 | `88` | Cable Solar Rojo 4mm | INT000000000113 | sí | 4.5 USD | 185 |
| 7 | `90` | Cable Solar Rojo 6mm | INT000000000112 | sí | 5 CUP | 3 |

**Criterios de selección:** grupo pequeño (reversible en minutos), homogéneo (mismo tipo de producto), con stock real en 4 de 7 (permite verificar que existencias y kardex NO se alteran) y con imágenes existentes en el bucket `product-images` (permite verificar la compartición por referencia sin subir nada nuevo).

**Grupo alternativo (segunda fase del piloto, opcional): «Brekers»** — 14 productos (`5, 6, 7, 8, 9, 80, 128, 130, 132, 140, 154, 176, 178, 179`). Más grande y con 5 productos sin imagen ni precio; recomendado solo después de validar el procedimiento con Cables.

## 3. Identidad compartida propuesta por producto

- **SKU**: el SKU actual de ENERVIDA (numérico corto: `135`, `12`, `13`, `87`, `88`, `89`, `90`). Se mantiene tal cual: NO se renumera (requisito de la misión: no modificar identificadores locales).
- **Nombre**: el nombre actual de ENERVIDA, sin cambios de redacción.
- **Imagen**: la imagen ya existente de ENERVIDA (`image_url` actual), promovida a `master_products.image_path`. Para el producto sin imagen (`Cable 6`) el maestro nace sin imagen hasta que se le suba una.
- **Barcode**: el barcode interno actual (`INT…`).
- **Unidad de medida**: la actual de cada producto.
- **Datos comerciales (precio, moneda, costo, existencias)**: NO se tocan — permanecen exclusivamente en la fila local de ENERVIDA. El maestro no guarda datos comerciales.

## 4. Mecanismo de vinculación (a autorizar)

Los productos ya existen localmente, por lo que el flujo «alta con identidad compartida» de la UI NO aplica (produciría `ERR_SKU_EXISTS_LOCAL`, comportamiento correcto). Se requiere un **procedimiento administrativo de vinculación** por service-role, ejecutable como script versionado con dry-run:

1. **Dry-run obligatorio**: el script lista exactamente qué hará (INSERT en `master_products`, UPDATE de `products.master_product_id`) y no escribe nada.
2. **Por cada producto seleccionado**:
   - INSERT en `public.master_products` con (tenant_id de la organización, sku, nombre, barcode, unit_of_measure, `image_path = products.image_url` cuando exista, `created_by` = perfil que el propietario designe, `status='active'`).
   - UPDATE de la fila local: `products.master_product_id = <maestro>` (único campo; **ni precio ni costo ni stock se alteran**).
   - INSERT de auditoría en `audit_logs` (`CATALOG_MASTER_LINK_BACKFILL`, con antes/después).
3. **Guard de unicidad**: verificar previamente que ningún SKU del lote exista ya en `master_products` del tenant (fallar sin escribir si hay colisión).
4. **Conexión de la tienda ENERVIDA** al catálogo de la organización (`connect_store_catalog`) — un solo acto de gobernanza, por el gobernador (propietario de Vitallcons o a quien conceda la capacidad).
5. **Verificación posterior**: 7 maestros activos, 7 filas locales vinculadas, 0 cambios en precios/costos/existencias, kardex intacto, imágenes compartidas por la misma referencia.

**Importante**: el paso 2 requiere un pequeño script versionado que HOY NO EXISTE en el repositorio (no hay RPC ni script de «adoptar producto local como maestro»). Su preparación y revisión formará parte de la autorización solicitada: se propondrá como PR aparte con dry-run, guardas y prueba transaccional equivalente a la de esta misión.

## 5. Mecanismo de recuperación (rollback)

- **Antes de ejecutar**: snapshot de las 7 filas (`SELECT … FROM products WHERE id IN (…)`) + conteo de `master_products` del tenant (0 hoy).
- **Rollback por producto**: `UPDATE products SET master_product_id = NULL WHERE id = …; DELETE FROM master_change_log WHERE master_product_id = …; DELETE FROM master_products WHERE id = …;` — devuelve el sistema al estado previo en segundos (los datos comerciales nunca se tocaron, así que no hay nada más que restaurar).
- **Rollback del piloto completo**: además `UPDATE catalog_store_links SET status='disconnected'` y `disconnect_store_catalog`, dejando la organización sin catálogo activo.
- Los reportes y kardex resuelven por JOIN vivo: al desvincular, todo vuelve a comportarse como producto local independiente sin huellas residuales.

## 6. Qué NO se hará (límites de la propuesta)

- No se conecta Puerto Padre VITALLCONS (ni ninguna tercera tienda).
- No se vinculan los otros 181 productos de ENERVIDA.
- No se fusionan productos por similitud de nombre.
- No se modifican identificadores locales, precios, costos ni existencias.
- No se generan movimientos de stock ni recepciones.
- No se ejecuta nada de esto sin el «sí» expreso del propietario.

## 7. Plan de verificación del piloto (después de autorizado)

1. Conectar ENERVIDA (gobernador) y verificar el estado «Conectada desde…».
2. Ejecutar el script de vinculación en dry-run → revisar el manifiesto → ejecutar real → verificar 7/7.
3. Desde la UI: buscar por SKU y por nombre desde ENERVIDA (estados «activado en esta tienda»).
4. Verificar en BD: precios/costos/stock idénticos a los previos al piloto (comparación con el snapshot del §5).
5. Probar el ciclo completo con UN producto (p. ej. `Cable Solar Rojo 4mm`): edición gobernada de imagen → propagación a la fila local; cambio de precio local → el maestro y el kardex intactos.
6. Dejar asentado el resultado en `audit-evidence/` y, si todo va bien, proponer la segunda categoría (Brekers) y la conexión de la segunda tienda.
