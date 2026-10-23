# Tutorial: Cómo Hacer Mi Primera Venta

> **Para quién**: Cajeros, encargados y cualquier persona que atienda al público.
> **Tiempo**: 10 minutos para aprender, 1 minuto por venta una vez aprendido.
> **Qué aprenderá**: Cobrar un producto, recibir dinero en efectivo, dar cambio y entregar el recibo.

## Antes de empezar

Para hacer una venta necesita:

- Estar **conectado a Internet** (la primera vez).
- Tener **una caja abierta** (turno abierto). Si no la tiene, verá un aviso en el POS indicándolo; el aviso no impide explorar, pero antes de cobrar conviene abrir el turno.
- Tener **productos cargados** en el catálogo. Si no hay productos, pida al administrador que los dé de alta primero.

> 💡 Si el aviso dice que no tiene turno abierto, pulse el botón del propio aviso (o vaya a **OPERACIÓN → Caja → Caja**) y abra el turno con el **Fondo Inicial de Efectivo**. Vea **Cómo abrir y cerrar la caja**.

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
│  5. Elegir cómo paga: efectivo / transferencia    │
│     / Transf. Exterior / mixto                    │
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

1. En el menú de la izquierda, abra la sección **OPERACIÓN**.
2. Abra el grupo **Ventas** y haga clic en **Vender**.
3. Verá la pantalla de la caja con el buscador de productos y el carrito a la derecha.

La pantalla real de la caja (POS) se ve así:

![Terminal POS con el buscador de productos, categorías y la cuadrícula de productos con precio y stock](/help/capturas/pos-terminal.webp "Figura 1. Terminal POS — búsqueda, categorías y cuadrícula de productos")

> 💡 **Atajo**: presione `Ctrl + 2` para ir directo al POS, y `F9` para cobrar cuando el carrito esté listo.

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
   - **Transferencia**: por banca móvil (vouchers).
   - **Transf. Exterior**: cobros en divisas por Zelle u otro mecanismo exterior (solo USD/EUR; el sistema convierte a CUP con la tasa configurada).
   - **Mixto**: combinación de efectivo y transferencia en el mismo cobro.
3. Seleccione la opción correcta.

### Si eligió "Efectivo"
1. Aparece un campo que dice *"Recibido"*.
2. Escriba cuánto dinero le entregó el cliente. Ejemplo: si el total es 250 pesos y el cliente le da 300, escriba **300**.
3. El sistema calculará el **cambio** automáticamente (en este ejemplo, 50 pesos).
4. Haga clic en **Confirmar**.

### Si eligió "Transferencia" o "Transf. Exterior"
1. Solo confirme el monto.
2. El sistema no pide "recibido" porque no hay cambio físico.

### Si eligió "Mixto"
1. Escriba cuánto paga en cada método (efectivo y transferencia).
2. El sistema verifica que las partes cubran el total antes de confirmar.

## Paso 5 — Entregar el recibo

Después de confirmar el pago:

1. Aparece una pantalla que confirma la venta, con un **código QR de verificación** del comprobante.
2. El sistema le ofrece **imprimir o enviar el recibo**:
   - Si tiene impresora térmica conectada, haga clic en **Imprimir** (formato térmico de 55 u 80 mm).
   - Si no tiene impresora, haga clic en **Enviar por WhatsApp** y escriba el número del cliente.
   - Si el cliente no quiere recibo, cierre la pantalla.
3. Acaba de cobrar y se arrepintió porque fue un error suyo: pulse **Deshacer** durante los primeros 30 segundos (solo para ventas propias y recién hechas); la venta se revierte completa.

> ⚠️ **Importante**: Aunque el cliente no quiera recibo, la venta **ya quedó registrada** en el sistema. El inventario se descontó automáticamente. No necesita hacer nada más.

## Paso 6 — Atender al siguiente cliente

El sistema vuelve solo a la pantalla de la caja, lista para la siguiente venta. La barra de búsqueda queda vacía y el carrito queda vacío.

Puede seguir vendiendo así todo el día. Al final del día, recuerde hacer el **cierre de caja** (lea **Cómo hacer el cierre de caja**).

---

## Preguntas frecuentes

**¿Y si me equivoco y cobro de menos?**
- Si pasa inmediatamente después, use **Deshacer** (30 segundos) y vuelva a cobrar bien.
- Pasado ese momento, la venta no se edita: anote la diferencia y coméntelo con el encargado al cierre.
- El encargado o administrador puede **revertir** la venta desde el Historial de Ventas indicando el motivo, y se vuelve a cobrar.

**¿Y si el cliente quiere devolver un producto después de comprarlo?**
- No se puede "borrar" una venta desde la caja.
- Se hace una **devolución** desde **OPERACIÓN → Ventas → Opciones → Devoluciones** (genera una nota NC y el producto vuelve al inventario), o el administrador **revierte** la venta desde el Historial.

**¿Qué pasa si se va la luz o el Internet en medio de la venta?**
- Si ya había presionado **Cobrar** y confirmó, la venta quedó registrada localmente.
- Cuando vuelva el Internet, el sistema la enviará al servidor automáticamente.
- No pierde ninguna venta.

**¿Puedo ver las ventas que hice hoy?**
- Sí. Haga clic en el botón **Historial** (arriba, en la caja) o abra **Ventas → Opciones → Historial de Ventas**.
- Ahí verá las ventas de la tienda con su hora, monto, método y estado.

---

## ¿Qué hacer ahora?

- Aprenda a **cerrar la caja al final del día**: lea **Cómo hacer el cierre de caja**.
- Aprenda a **aplicar descuentos**: lea **Cómo aplicar un descuento en una venta**.
- Aprenda a **ver todas sus ventas del día**: lea **Cómo ver el historial de mis ventas**.
