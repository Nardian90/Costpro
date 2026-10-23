# Cómo Hacer: Aplicar un Descuento en una Venta

> **Necesita esto cuando**: Un cliente pide rebaja, o cuando tiene una promoción activa, o cuando un producto está dañado y lo vende más barato.

## Tipos de descuento

CostPro permite dos tipos de descuento:

1. **Descuento por producto**: aplica a un solo producto del carrito.
2. **Descuento global**: aplica a todo el carrito completo.

También puede haber descuentos **en porcentaje** (ej: 10% de rebaja) o **en monto fijo** (ej: 25 pesos de rebaja).

## Paso 1 — Tener el carrito listo

Antes de aplicar descuento:

1. Agregue todos los productos que el cliente va a comprar.
2. Verifique las cantidades.
3. **Ahora sí** puede aplicar el descuento.

> ⚠️ **Importante**: Aplique el descuento **antes** de cobrar. Una vez que confirma el pago, no se puede modificar.

## Paso 2A — Aplicar descuento a un solo producto

1. En el carrito (a la derecha), busque el producto al que quiere descontar.
2. Haga clic en el ícono de **%** que aparece al lado del producto.
3. Se abre una ventana pequeña con dos opciones:
   - **Porcentaje**: escriba el % (ej: 10 para 10%).
   - **Monto fijo**: escriba cuántos pesos descontar (ej: 5.00).
4. Seleccione una opción y escriba el valor.
5. Haga clic en **"Aplicar"**.
6. El precio de ese producto se actualiza en el carrito.

## Paso 2B — Aplicar descuento global

1. Debajo del carrito, verá un campo que dice **"Descuento global"**.
2. Haga clic en él.
3. Aparecen las mismas dos opciones: porcentaje o monto fijo.
4. Escriba el valor.
5. Haga clic en **"Aplicar"**.
6. El descuento se aplica a todos los productos del carrito.
7. El total se recalcula.

## Paso 3 — Verificar el total

1. Mire el **TOTAL** del carrito (abajo del todo).
2. Debe mostrar:
   - Subtotal original (sin descuento).
   - Descuento aplicado (en pesos).
   - Total final (subtotal menos descuento).
3. Si el número no es el esperado, revise los pasos anteriores.

## Paso 4 — Autorización de supervisor (solo descuentos grandes)

Solo si el descuento alcanza el **15% o más** (medido como porcentaje efectivo, también en los descuentos de monto fijo), el sistema pide **autorización de supervisor**:

1. Aparece el modal de autorización de supervisor.
2. El supervisor escribe sus **credenciales** (usuario y contraseña de una cuenta con rol admin/manager de la tienda); el sistema las valida en el servidor.
3. El supervisor escribe el **motivo** (texto libre obligatorio, 1–500 caracteres): ej. *"Cliente frecuente"*, *"Producto con detalle estético"*.
4. Confirmado, el descuento se aplica y el motivo queda en la **auditoría** junto a la venta.

Los descuentos menores al 15% se aplican sin autorización ni motivo.

## Paso 5 — Cobrar normalmente

Ya con el descuento aplicado, proceda a cobrar como de costumbre (lea **Tutorial: Cómo hacer mi primera venta** si tiene dudas).

---

## Preguntas frecuentes

**¿Puedo quitar un descuento después de aplicarlo?**
- Sí, mientras no haya cobrado: quite el descuento del producto o el global desde el carrito.

**¿El descuento aparece en el recibo del cliente?**
- Sí. El comprobante muestra el desglose con el descuento aplicado.

**¿Puedo combinar descuento por producto y descuento global?**
- Sí: se acumulan (línea + global). Cuidado con el total: revise el carrito antes de cobrar.

**¿Qué pasa si aplico descuento a un producto que tiene oferta activa?**
- Los descuentos manuales y las ofertas son independientes: revise el precio final en el carrito antes de cobrar.

**¿El descuento afecta la comisión del cajero?**
- Depende de la **base de cálculo** definida en la regla de comisión del trabajador (total, efectivo, transferencia o neto). Vea **Cómo gestionar y pagar comisiones**.

**¿Hay un límite de descuento?**
- El umbral de autorización es **15%**: por debajo, el vendedor aplica libremente; al llegar o superar el 15%, interviene un supervisor con sus credenciales y motivo.
- No existen niveles adicionales (20/50) ni configuración de umbrales en la interfaz.
