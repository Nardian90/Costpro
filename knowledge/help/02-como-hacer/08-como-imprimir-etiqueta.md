# Cómo Hacer: Imprimir Etiquetas con Código de Barras

> **Necesita esto cuando**: Quiere pegar etiquetas con código de barras en los productos para que el cajero los pase por la pistola lectora y se agreguen al carrito automáticamente.

## ¿Por qué usar etiquetas?

Sin etiqueta de código de barras, el cajero tiene que **escribir el nombre del producto** en la barra de búsqueda cada vez. Es lento y propenso a errores (¿"leche entera" o "leche entera 1L"?).

Con etiqueta, el cajero solo **pasa la pistola** y el sistema agrega el producto en 1 segundo, sin error posible.

## Paso 1 — Tener los productos dados de alta

Antes de imprimir etiquetas, los productos deben existir en el catálogo. Si no existen, léalo: **Tutorial: Cómo dar de alta mi primer producto**.

Cada producto debe tener un **código de barras asignado** (que sea del fabricante o generado por el sistema).

## Paso 2 — Ir a Etiquetas

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Etiquetas** (o "Etiquetas y Códigos de Barras").
3. Verá la pantalla generadora de etiquetas.

## Paso 3 — Seleccionar los productos

1. Haga clic en **"+ Agregar productos"** (arriba a la izquierda).
2. Se abre una lista con todo el catálogo.
3. Marque la casilla a la izquierda de cada producto que quiera etiquetar.
4. Puede filtrar por categoría o buscar por nombre para encontrarlos rápido.
5. Cuando tenga todos los que quiere, haga clic en **"Agregar seleccionados"**.

## Paso 4 — Configurar el formato de etiqueta

En el panel derecho verá opciones:

| Opción | Valores |
|--------|---------|
| **Formato de código** | EAN-13 (estándar internacional) o Code 128 (más flexible) |
| **Etiquetas por página** | 1, 2, 3 o 4 (cuántas caben en una hoja carta) |
| **Tamaño de papel** | Carta (Letter), A4, o térmico (si tiene impresora térmica) |
| **Mostrar** | Nombre del producto, precio, código (márquelos todos) |
| **Color del texto** | Negro (recomendado) |

> 💡 **Recomendación para personas mayores**: Si nunca ha impreso etiquetas, use estos valores:
> - Formato: **EAN-13**
> - Etiquetas por página: **4**
> - Tamaño: **Carta**
> - Marque todas las casillas "Mostrar".

## Paso 5 — Generar el PDF

1. Revise la lista de productos en la tabla.
2. Haga clic en el botón verde **"Generar PDF"** (arriba a la derecha).
3. Espere 3 a 10 segundos (depende de cuántas etiquetas).
4. Se descarga un archivo PDF.

## Paso 6 — Abrir el PDF y revisar

1. Abra el PDF descargado.
2. Verifique que:
   - Cada etiqueta tiene **nombre del producto**, **precio** y **código de barras legible**.
   - Los códigos no están cortados en los bordes.
   - Los nombres no están truncados (cortados al final).
3. Si algo está mal, vuelva al paso 4 y ajuste la configuración.

## Paso 7 — Imprimir

1. Con el PDF abierto, presione **Ctrl + P** (o haga clic en Archivo → Imprimir).
2. En el cuadro de impresión:
   - **Tamaño de papel**: Carta (o A4 si eligió A4).
   - **Orientación**: Vertical (Portrait).
   - **Escala**: 100% (no "ajustar a página", porque eso cambia el tamaño del código).
   - **Calidad**: Alta (para que el código salga nítido).
3. Haga clic en **"Imprimir"**.

> ⚠️ **Importante**: Use una impresora **láser** o de **inyección de tinta de buena calidad**. Las impresoras muy viejas o con tinta gastada generan códigos borrosos que la pistola no puede leer.

## Paso 8 — Recortar y pegar

1. Corte cada etiqueta con tijeras.
2. Péguela en el producto con cinta adhesiva transparente.
3. La etiqueta debe quedar **plana y sin arrugas** para que la pistola la lea bien.

> 💡 **Consejo para personas mayores**: Si tiene muchos productos, use una **guillotina** en lugar de tijeras. Corta varias hojas a la vez y queda más parejo.

---

## Preguntas frecuentes

**¿La pistola no lee el código, qué hago?**
1. Limpie el lente de la pistola con un paño suave.
2. Acerque la pistola a 5-10 cm del código.
3. Mantenga la pistola quieta un instante al pulsar el gatillo.
4. Si aún no lee, el código puede estar dañado. Reimprima esa etiqueta.

**¿Puedo imprimir etiquetas con el logo de la tienda?**
- Sí. En la configuración de etiquetas (paso 4), hay una opción "Incluir logo". Suba su logo y aparecerá en cada etiqueta.

**¿Cuántas etiquetas puedo generar a la vez?**
- Hasta 500 etiquetas en un solo PDF. Más de eso, el sistema se lo advertirá y le pedirá dividir en lotes.

**¿Puedo imprimir solo una etiqueta para un producto nuevo?**
- Sí. Seleccione solo ese producto y genere. Una hoja con 1 etiqueta y 3 espacios en blanco.

**¿Puedo imprimir etiquetas con precios en otra moneda?**
- Sí. En la configuración, elija "Moneda de la etiqueta" y seleccione USD, EUR, etc. El sistema convierte usando la tasa inteligente del día.

**¿Las etiquetas se ven igual en papel térmico?**
- No, el formato cambia. Si tiene impresora térmica (las que usan rollo), elija "Térmico" en tamaño de papel. El sistema adapta la etiqueta al rollo.
