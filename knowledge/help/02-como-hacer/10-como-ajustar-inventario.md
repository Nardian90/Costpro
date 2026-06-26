# Cómo Hacer: Ajustar el Inventario Cuando Hay Diferencia

> **Necesita esto cuando**: Hace un conteo físico de los productos y encuentra que la cantidad real **no coincide** con lo que el sistema dice. Por ejemplo: el sistema dice que hay 10 leches, pero usted cuenta 8. Hay 2 que "desaparecieron".

## ¿Por qué el inventario se desajusta?

Es normal que con el tiempo haya pequeñas diferencias. Las causas más comunes son:

- **Robo hormiga**: alguien se lleva un producto pequeño sin pagar.
- **Producto dañado**: se rompe y se tira sin registrarlo.
- **Venta mal cobrada**: el cajero cobró 1 pero entregó 2.
- **Recepción mal contada**: el proveedor mandó 20 pero usted anotó 25.
- **Vencimiento**: productos que se vencen y se retiran del estante.

> ⚠️ **Importante**: Un ajuste de inventario **deja rastro**. El sistema registra quién lo hizo, cuándo, por qué motivo y cuánto se ajustó. No se puede "borrar" un ajuste. Por eso hay que hacerlo con cuidado y justificar bien.

## Paso 1 — Hacer el conteo físico

Antes de tocar la computadora:

1. Vaya al estante físico del producto.
2. Cuente las unidades **una por una**.
3. Anote el número en una hoja.
4. Repita el conteo para verificar (a veces uno se equivoca contando).
5. Si los dos conteos coinciden, ese es el número real.

> 💡 **Consejo para personas mayores**: Si tiene muchos productos, use la **Auditoría de Conteo** del sistema (Multi-Tienda → Auditoría de Conteo), que le da una hoja impresa para anotar los conteos físicos y luego cargarlos.

## Paso 2 — Ir a Ajustes de Inventario

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Ajustes de Inventario** (o "Ajustes Documentales").
3. Verá una lista de ajustes anteriores y un botón **"+ Nuevo ajuste"**.

## Paso 3 — Iniciar un nuevo ajuste

1. Haga clic en **"+ Nuevo ajuste"**.
2. Se abre un formulario. Llene:

| Campo | Qué escribir |
|-------|--------------|
| **Tienda*** | La tienda donde está haciendo el ajuste. |
| **Tipo de ajuste*** | Entrada (agregar stock) o Salida (restar stock). |
| **Motivo*** | Elija de la lista (ver tabla abajo). |
| **Notas** | Explique en sus palabras qué pasó. |

3. Haga clic en **"Continuar"**.

## Los 7 motivos de ajuste

| Motivo | Cuándo usarlo |
|--------|---------------|
| 1. **Daño / Merma** | Producto se rompió, se venció o se echó a perder. |
| 2. **Robo confirmado** | Se descubrió un robo y se sabe cuánto se llevó. |
| 3. **Error de recepción** | Al recibir mercancía, se contó mal y se registró más o menos. |
| 4. **Error de venta** | En una venta pasada, el cajero se equivocó en la cantidad. |
| 5. **Diferencia de conteo** | En un inventario físico, no cuadró y no se sabe la causa. |
| 6. **Devolución de cliente** | Un cliente devolvió un producto que ya se había vendido. |
| 7. **Reclasificación** | El producto cambió de SKU o de categoría. |

## Paso 4 — Agregar los productos a ajustar

1. En la tabla vacía, busque el primer producto a ajustar.
2. Haga clic en él para agregarlo a la tabla.
3. Llene:
   - **Stock actual**: el sistema lo muestra automáticamente.
   - **Stock real**: el número que usted contó físicamente.
   - **Diferencia**: el sistema la calcula (real - actual).
4. La diferencia puede ser:
   - **Negativa** (en rojo): se van a restar unidades.
   - **Positiva** (en verde): se van a sumar unidades.
5. Repita para cada producto que necesite ajustar.

## Paso 5 — Verificar los totales

Abajo verá:

- **Total de productos ajustados**: cuántos artículos diferentes.
- **Total de unidades sumadas**: si es ajuste de entrada.
- **Total de unidades restadas**: si es ajuste de salida.
- **Valor monetario del ajuste**: cuánto dinero representa (a precio de costo).

## Paso 6 — Revisar y justificar

1. Antes de confirmar, **lea cada fila** una por una.
2. Verifique que el stock real sea el que usted contó físicamente.
3. En el campo *"Notas"*, escriba una explicación clara. Ejemplo: *"Conteo físico del 15 de marzo. Diferencia en leche posiblemente por productos vencidos tirados sin registrar."*

> ⚠️ **Importante**: Una nota vaga como "ajuste" no sirve. Si después alguien revisa, no entenderá qué pasó. Sea específico.

## Paso 7 — Confirmar el ajuste

1. Haga clic en el botón **"Confirmar ajuste"** (arriba a la derecha).
2. Aparece una ventana de confirmación: *"¿Está seguro? Esta acción no se puede deshacer."*
3. Si está seguro, haga clic en **"Sí, confirmar"**.
4. Aparece un mensaje: *"Ajuste registrado. El inventario se actualizó."*

## Paso 8 — Verificar el stock actualizado

1. Vaya a **Multi-Tienda → Stock Actual**.
2. Busque uno de los productos ajustados.
3. El stock debe mostrar el número "real" que usted escribió.

## Paso 9 — Descargar el reporte de ajuste (recomendado)

1. Vuelva a la lista de Ajustes de Inventario.
2. Busque el ajuste que acaba de hacer.
3. Haga clic en el ícono de PDF.
4. Se descarga un reporte con todos los detalles.
5. Archívelo para sus registros.

---

## Preguntas frecuentes

**¿Puedo anular un ajuste después de confirmarlo?**
- No directamente. Tiene que hacer un **ajuste inverso** (con el motivo "Diferencia de conteo" o "Error de ajuste anterior").
- Pero el ajuste original queda registrado en el historial para siempre.

**¿Qué pasa si hago un ajuste grande (más de 100 unidades)?**
- El sistema pide **autorización de supervisor** si el ajuste supera cierto valor (configurable, por defecto 50 unidades o 1000 pesos).
- El supervisor debe ingresar su clave.

**¿Cada cuánto debo hacer ajustes?**
- Recomendado: una vez al mes, como parte del **inventario mensual**.
- También: cada vez que note una diferencia grande (robo, daño, etc.).

**¿El ajuste afecta la contabilidad?**
- Sí. Si el ajuste es de salida, el valor de los productos sale como pérdida. Si es de entrada, se registra como ganancia de inventario.
- El contador verá estos movimientos en el reporte de auditoría.

**¿Puedo hacer ajuste de varios productos a la vez?**
- Sí. Puede agregar tantos productos como quiera a un solo ajuste. Recomendado agrupar por motivo (un ajuste para daños, otro para robos, etc.).

**¿Cómo evito tener que hacer muchos ajustes?**
- Reciba bien la mercancía desde el principio (cuente al recibir).
- Registre los daños inmediatamente cuando ocurran.
- Haga auditorías de conteo frecuentes.
- Capacite al cajero para que cobre bien.
