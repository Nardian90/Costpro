# Tutorial: Cómo Hacer Mi Primera Venta

> **Para quién**: Cajeros, encargados y cualquier persona que atienda al público.
> **Tiempo**: 10 minutos para aprender, 1 minuto por venta una vez aprendido.
> **Qué aprenderá**: Cobrar un producto, recibir dinero en efectivo, dar cambio y entregar el recibo.

## Antes de empezar

Para hacer una venta necesita:

- Estar **conectado a Internet** (la primera vez).
- Tener **una caja abierta** (turno abierto). Si no la tiene, el sistema le avisará con un letrero amarillo que dice *"No tiene turno abierto"*.
- Tener **productos cargados** en el catálogo. Si no hay productos, pida al administrador que los dé de alta primero.

> 💡 Si el sistema le dice que no tiene turno abierto, vaya al menú izquierdo, busque **Multi-Tienda → Cierre de Caja**, y allí verá un botón **"Abrir turno"**. Siga las instrucciones en pantalla.

## Mapa visual del flujo de venta

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  1. Ir a la caja (POS)                             │
│         ↓                                          │
│  2. Buscar producto (nombre o código)              │
│         ↓                                          │
│  3. Revisar el carrito (a la derecha)              │
│         ↓                                          │
│  4. Cobrar (botón verde)                           │
│         ↓                                          │
│  5. Elegir cómo paga: efectivo / tarjeta / mixto  │
│         ↓                                          │
│  6. Confirmar → entrega el recibo                  │
│         ↓                                          │
│  7. Listo para siguiente cliente                   │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Diagrama de la pantalla POS

```
┌──────────────────────────────────────────────────────┐
│ [☰] CostPro  [Tienda ▼]            🔔 ☀️ ? 👤       │
├──────────────────────────────────────────────────────┤
│  [Buscar producto...        🔍]                      │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │                      │  │  CARRITO             │ │
│  │  LISTA DE            │  │                      │ │
│  │  PRODUCTOS           │  │  • Leche   $2.50  x2 │ │
│  │                      │  │  • Pan     $1.00  x3 │ │
│  │  (cuadrícula         │  │                      │ │
│  │   con fotos)         │  │  ──────────────────  │ │
│  │                      │  │  TOTAL:    $8.00     │ │
│  │                      │  │                      │ │
│  │                      │  │  [ Cobrar ] (verde)  │ │
│  └──────────────────────┘  └──────────────────────┘ │
└──────────────────────────────────────────────────────┘
```


## Paso 1 — Ir a la caja (POS)

1. En el menú de la izquierda, haga clic en **Multi-Tienda**.
2. Aparece una lista de opciones. Haga clic en **Terminal POS**.
3. Espere 2 segundos. Verá la pantalla de la caja con los productos visibles al fondo.

> 💡 **Atajo**: Si recuerda atajos, presione **Alt + 2** para ir directo a Multi-Tienda.

## Paso 2 — Buscar el producto que el cliente quiere comprar

Hay **dos formas** de encontrar el producto:

### Forma A: Escribiendo el nombre
1. Haga clic en la **barra de búsqueda** (arriba, donde dice *"Buscar producto..."*).
2. Escriba el nombre del producto, por ejemplo *"leche"*.
3. A medida que escribe, aparecerán opciones abajo.
4. Haga clic en el producto correcto.

### Forma B: Con el código de barras
1. Si tiene un lector de código de barras (la "pistola"), simplemente apunte al código del producto y pulse el gatillo.
2. El sistema agregará el producto automáticamente.
3. Si no tiene lector pero sí el código escrito, puede escribirlo en la misma barra de búsqueda.

> 💡 **Tip**: Si el cliente lleva **varias unidades del mismo producto**, después de agregarlo una vez, busque el producto en el carrito (a la derecha) y cambie el número donde dice "1" por la cantidad que quiera, por ejemplo "3". Pulse Enter.

## Paso 3 — Revisar el carrito

A la derecha de la pantalla verá una lista con todos los productos que el cliente va a comprar. Para cada producto verá:

- El **nombre**.
- La **cantidad** (puede cambiarla).
- El **precio unitario**.
- El **subtotal** de ese producto.

Abajo del todo verá el **TOTAL** a pagar, en letras grandes.

> ⚠️ **Antes de cobrar**: mire el carrito completo y verifique que:
> - Estén todos los productos que el cliente quiere.
> - Las cantidades sean correctas.
> - Si el cliente pide descuento, aplíquelo ahora (lea **Cómo aplicar un descuento**).

## Paso 4 — Cobrar

1. Haga clic en el botón verde grande que dice **Cobrar** (abajo a la derecha del carrito).
2. Se abre una ventana nueva que pregunta **cómo va a pagar el cliente**:
   - **Efectivo**: billetes y monedas.
   - **Tarjeta**: débito o crédito.
   - **Transferencia**: por banca móvil.
   - **Mixto**: parte en efectivo y parte en tarjeta.
3. Seleccione la opción correcta.

### Si eligió "Efectivo"
1. Aparece un campo que dice *"Recibido"*.
2. Escriba cuánto dinero le entregó el cliente. Ejemplo: si el total es 250 pesos y el cliente le da 300, escriba **300**.
3. El sistema calculará el **cambio** automáticamente (en este ejemplo, 50 pesos).
4. Haga clic en **Confirmar**.

### Si eligió "Tarjeta" o "Transferencia"
1. Solo confirme el monto.
2. El sistema no pide "recibido" porque no hay cambio.

### Si eligió "Mixto"
1. Escriba cuánto pagó en efectivo.
2. El sistema calculará cuánto falta para completar con tarjeta.

## Paso 5 — Entregar el recibo

Después de confirmar el pago:

1. Aparece una pantalla que dice **"Venta exitosa"**.
2. El sistema le pregunta si quiere **imprimir o enviar el recibo**:
   - Si tiene impresora térmica conectada, haga clic en **Imprimir**.
   - Si no tiene impresora, haga clic en **Enviar por WhatsApp** y escriba el número del cliente.
   - Si el cliente no quiere recibo, haga clic en **Cerrar**.

> ⚠️ **Importante**: Aunque el cliente no quiera recibo, la venta **ya quedó registrada** en el sistema. El inventario se descontó automáticamente. No necesita hacer nada más.

## Paso 6 — Atender al siguiente cliente

El sistema vuelve solo a la pantalla de la caja, lista para la siguiente venta. La barra de búsqueda queda vacía y el carrito queda vacío.

Puede seguir vendiendo así todo el día. Al final del día, recuerde hacer el **cierre de caja** (lea **Cómo hacer el cierre de caja**).

---

## Preguntas frecuentes

**¿Y si me equivoco y cobro de menos?**
- La venta ya quedó registrada con el monto que dijo. No puede modificarla después.
- Lo correcto es anotar la diferencia en una hoja y comentarlo con el encargado al cierre.
- Si el error es grande (más de 100 pesos), llame al administrador para que anule la venta y la haga de nuevo.

**¿Y si el cliente quiere devolver un producto después de comprarlo?**
- No se puede "borrar" una venta desde la caja.
- El administrador puede hacer una **devolución** desde Configuración → Auditoría.
- El producto vuelve al inventario y el dinero sale de la caja.

**¿Qué pasa si se va la luz o el Internet en medio de la venta?**
- Si ya había presionado **Cobrar** y confirmó, la venta quedó registrada localmente.
- Cuando vuelva el Internet, el sistema la enviará al servidor automáticamente.
- No pierde ninguna venta.

**¿Puedo ver las ventas que hice hoy?**
- Sí. Haga clic en el botón **Historial** (arriba, en la caja) o vaya a Multi-Tienda → Historial de Ventas.
- Ahí verá todas las ventas con su hora, monto y método de pago.

---

## ¿Qué hacer ahora?

- Aprenda a **cerrar la caja al final del día**: lea **Cómo hacer el cierre de caja**.
- Aprenda a **aplicar descuentos**: lea **Cómo aplicar un descuento en una venta**.
- Aprenda a **ver todas sus ventas del día**: lea **Cómo ver el historial de mis ventas**.
