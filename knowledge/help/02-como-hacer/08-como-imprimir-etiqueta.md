# Cómo Hacer: Imprimir Etiquetas con Código de Barras

> **Necesita esto cuando**: necesita etiquetas con nombre, precio y código de barras para sus productos, para pegarlas en la mercancía y agilizar la venta con el escáner.

## ¿Para qué sirve?

La vista **Etiquetas y Códigos** genera un **PDF de etiquetas listo para imprimir** en hojas tamaño carta: cada hoja sale con **4 etiquetas**, cada una con el nombre del producto, su precio y su código de barras escaneable.

El formato del código es **automático**: si el producto tiene un código EAN de 13 dígitos, se imprime como EAN-13; si no, se genera como CODE128 a partir del código interno.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Almacén** → **Etiquetas y Códigos**.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «etiquetas».

## Antes de comenzar

- Necesita rol admin, manager o encargado en la tienda.
- Los productos deben existir en el catálogo y preferiblemente con **código de barras** asignado (si un producto no lo tiene, puede generarlo desde su ficha en el Catálogo).
- Use papel carta y una impresora con buena resolución; verifique el tóner o tinta antes de tiradas grandes.

## Cómo generar las etiquetas

1. Vaya a **OPERACIÓN → Almacén → Etiquetas y Códigos**.
2. Busque y agregue los productos que quiere etiquetar (hasta **4 productos por lote**: una hoja completa).
3. Ajuste la **cantidad de etiquetas por producto** con los controles de más/menos.
4. Si quiere una sola hoja dedicada a un producto, active el **modo repetición**: el producto se repite en las 4 etiquetas de la página.
5. Revise la vista previa: nombre, precio y código en cada etiqueta.
6. Pulse **Exportar a PDF**: se descarga el archivo `etiquetas_FECHA.pdf`.
7. Imprima el PDF con su impresora (Ctrl+P desde el visor).

## Restricciones importantes

- El contenido de la etiqueta es **fijo**: nombre + precio + código. No se pueden quitar campos ni añadir logo.
- El formato del código (EAN-13 o CODE128) lo decide el sistema según el código del producto; no es seleccionable.
- El tamaño es **hoja carta**, 4 etiquetas por página. No hay formato térmico.
- El precio impreso es el **precio de venta vigente** al generar: si cambia el precio, genere las etiquetas de nuevo.
- Si el producto no tiene código, la etiqueta saldrá sin código escaneable: asigne uno primero desde el Catálogo.

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| El escáner no lee el código | Código corto interno impreso como CODE128 de baja calidad, o etiqueta dañada. | Imprima con mejor resolución; si el producto tiene EAN del fabricante, use ese código en la ficha. |
| El precio de la etiqueta no coincide con el actual | Cambió el precio después de generar el PDF. | Regenerar las etiquetas. |
| No puedo agregar más de 4 productos | Límite por diseño: 4 etiquetas por hoja. | Genere un PDF por lote de 4. |
| La etiqueta sale con el código de otro producto | Se agregó el producto equivocado al lote. | Revise la vista previa antes de exportar y quite el producto incorrecto. |

## Preguntas frecuentes

**¿Puedo poner el logo de mi tienda en la etiqueta?**
No en esta vista: el diseño es fijo (nombre, precio, código). 

**¿Puedo elegir EAN-13 o Code 128?**
No: el sistema elige automáticamente EAN-13 cuando el código tiene 13 dígitos, y CODE128 en el resto de los casos.

**¿Cuántas etiquetas puedo imprimir a la vez?**
Una hoja por lote, con hasta 4 productos y sus cantidades (o un producto repetido 4 veces con el modo repetición). Para tiradas grandes, repita el proceso por lotes.

**¿Dónde genero el código de barras si el producto no lo tiene?**
En el Catálogo de productos: abra la ficha del producto y use la generación automática de código desde el SKU.

## Información relacionada

- **Cómo crear un producto** — dónde asignar el código de barras.
- **Gestión del Inventario** — el catálogo y sus herramientas.
- **Cómo hacer una venta (tutorial)** — cómo se escanea la etiqueta en el POS.
