# Explicación: Cómo Funciona CostPro Sin Internet

> **Lea esto cuando**: Quiere entender cómo es posible que el sistema siga funcionando cuando se corta el Internet, y qué precauciones tomar.

## La pregunta básica: ¿cómo vendo si se va el Internet?

En muchos países, el Internet se corta con frecuencia. Cortes de luz, fallas del proveedor, tormentas. Si su sistema de ventas depende del Internet, cuando se corta, usted no puede vender. Y si no puede vender, pierde dinero.

CostPro está diseñado para **seguir funcionando sin Internet**. Esto se llama **modo offline**.

## ¿Qué se puede hacer sin Internet?

| Acción | ¿Funciona offline? |
|--------|-------------------|
| Hacer ventas por catálogo (Tabla de Venta) | ✅ Sí (quedan en cola, se sincronizan al reconectar) |
| Checkout del POS (carrito / express) | ❌ No (requiere conexión) |
| Ver el catálogo de productos | ✅ Sí (copia local) |
| Recibir mercancía | ✅ Sí (queda pendiente de sincronizar) |
| Hacer ajustes de inventario | ✅ Sí (queda pendiente de sincronizar) |
| Crear transferencias | ✅ Sí (la creación queda en cola; la confirmación en destino requiere conexión) |
| Crear nuevos productos en el catálogo | ❌ No (requiere conexión) |
| Ver el historial de ventas | ❌ No (consulta el servidor; las ventas en cola aparecen al sincronizar) |
| Cerrar caja | ❌ No (requiere conexión) |
| Generar reportes | ❌ No (requiere conexión) |
| Cambiar de tienda activa | ❌ No (requiere conexión) |
| Ver reportes consolidados | ❌ No (necesita datos del servidor) |
| Recibir notificaciones | ❌ No |
| Hablar con el asistente IA Darian | ❌ No |

> 💡 **Resumen**: La venta por catálogo (con cola local) y algunos movimientos de almacén funcionan offline. El checkout del POS y lo que requiere datos del servidor (reportes, cierres, historial), no.

## ¿Cómo funciona técnicamente?

### 1. Almacenamiento local persistente
CostPro guarda en su computadora (o teléfono) una **copia local** de los datos más importantes:
- El catálogo de productos.
- Los precios.
- El stock actual.
- Las ventas del día.
- La configuración básica.

Esta copia está en el navegador, en una zona llamada **IndexedDB** (almacenamiento local del navegador). No se borra aunque cierre el navegador o apague la computadora.

### 2. Cola de operaciones pendientes
Cuando usted hace una venta sin Internet:

1. La venta se guarda en la cola local del dispositivo.
2. El indicador del POS la marca como **"pendiente de sincronizar"**.
3. El inventario y la caja **se actualizan en el servidor cuando la venta se sincroniza**: la cola no modifica datos del servidor por sí sola.
4. Usted sigue vendiendo con normalidad.

### 3. Sincronización automática
Cuando vuelve el Internet:

1. El sistema detecta que hay conexión.
2. Empieza a enviar las ventas pendientes al servidor.
3. El servidor procesa cada venta.
4. Si hay conflictos (ej: el stock en el servidor ya cambió), el sistema los detecta y le muestra el **modal de conflictos de sincronización** para que usted resuelva cada uno.
5. Cuando todo está sincronizado, borra la cola local.

### 4. Indicador visual
El **indicador offline** vive en la cabecera del POS y de Recepción (no en la barra superior general). Cuando todo está en orden —conectado, sin cola ni errores— permanece **oculto**; cuando hay algo que mostrar, aparece con su estado:

| Aparición | Significado |
|-----------|-------------|
| Marca de conexión restaurada | Todo sincronizado. |
| Icono de sin señal | Sin conexión: operando offline. |
| Contador de pendientes | Operaciones en cola esperando sincronización. |
| Icono de alerta | Sincronización con errores: revisar. |

## ¿Qué pasa si dos tiendas operan offline al mismo tiempo?

Imagine: la Tienda A y la Tienda B están ambas offline. En la Tienda A venden 5 unidades de "Leche". En la Tienda B también venden 5 unidades de "Leche". Cuando vuelva el Internet:

- La Tienda A sincroniza sus 5 ventas.
- La Tienda B sincroniza sus 5 ventas.
- El servidor actualiza el stock de cada tienda.

**No hay conflicto** porque cada tienda tiene su propio stock. El sistema está diseñado para esto.

## ¿Qué pasa si hago una transferencia offline?

Es posible crear la transferencia sin conexión: queda **pendiente** en la cola local. Pero:

- El stock se reserva y confirma en el servidor cuando la transferencia se sincroniza.
- No se confirma en destino hasta que ambos extremos recuperen Internet.

Recomendación: **evite transferencias offline** si puede. Espere a tener Internet para operar con la confirmación del destino a la vista.

## ¿Qué pasa si el corte dura muchas horas?

Si el corte dura mucho (varias horas o días):

1. **Siga vendiendo** normalmente. Las ventas se acumulan en la cola.
2. **Tenga cuidado con el stock**. Si vende mucho sin sincronizar, el sistema local puede decir que un producto tiene stock cuando en realidad ya se agotó en otra tienda (si el corte es en ambas).
3. **No apague la computadora**. Si la apaga, la cola se conserva, pero no se sincroniza hasta que la encienda de nuevo.
4. **Cuando vuelva el Internet**, deje la computadora encendida al menos 30 minutos para que sincronice todo.

> ⚠️ **Límite práctico**: la cola es local al dispositivo. Si acumula miles de operaciones sin sincronizar, la sincronización puede tardar. Si su corte es muy largo, priorice las ventas y avise al administrador.

## ¿Qué puedo hacer para prepararme?

### 1. Mantenga la aplicación instalada como PWA
CostPro es una **Progressive Web App (PWA)**. Si la instala en su computadora o teléfono, funciona mejor offline.

**Para instalar en computadora:**
1. Abra CostPro en Chrome.
2. En la barra de direcciones (arriba), verá un ícono de **"+"** o un ícono de **instalar**.
3. Haga clic en él.
4. Confirme la instalación.
5. Ahora tendrá un ícono de CostPro en su escritorio. Úselo para entrar.

**Para instalar en celular:**
1. Abra CostPro en Chrome del celular.
2. En el menú (tres puntos arriba a la derecha), elija **"Agregar a pantalla de inicio"**.
3. Aparecerá un ícono de CostPro en su pantalla. Úselo como una app.

### 2. Actualice los datos cuando tenga Internet
Antes de un corte previsto (ej: apagón programado):
1. Entre a CostPro.
2. Espere a que sincronice todo (el indicador offline no muestra avisos).
3. Navegue por las pantallas que va a necesitar (catálogo, POS).
4. Esto asegura que la copia local esté actualizada.

### 3. Tenga un plan B para los pagos
Si vende por transferencia bancaria y no hay Internet, el cliente no puede hacer la transferencia. Tenga:
- Una cuenta para pago en efectivo como respaldo.
- O acepte solo efectivo durante el corte.

### 4. Capacite a los cajeros
Asegúrese de que todos los cajeros sepan:
- Reconocer el indicador offline (sin conexión).
- Saber que pueden seguir vendiendo (la venta queda en cola).
- Entender que las ventas en cola se sincronizan al reconectar.
- Saber que al volver el Internet, hay que esperar a que sincronice antes de apagar.

## ¿Cómo sé que todo se sincronizó bien?

Después de un corte:

1. Mire el indicador offline: no debe mostrar avisos de desconexión ni errores.
2. Revise el **indicador offline del POS/Recepción** y el **modal de conflictos de sincronización** (en la cabecera) para ver si hay operaciones con error.
3. Genere un reporte de ventas del día y compare con sus ventas reales.
4. Si todo cuadra, está perfecto.

Si hay errores (algunas ventas no se sincronizaron):
- El sistema le permite **reintentar** la sincronización.
- O **descartar** las operaciones problemáticas (con autorización del supervisor).

## Preguntas frecuentes

**¿Las ventas hechas offline aparecen con una marca diferente?**
- En el POS/Recepción, el **indicador offline** muestra cuántas operaciones hay en cola esperando sincronización.
- Las ventas en cola no aparecen en el historial hasta que se sincronizan (el historial consulta el servidor).

**¿Puedo editar una venta hecha offline?**
- No, igual que las ventas online. Puede anularla según su rol (no existe ventana de 24 horas: el control de anulación es por rol).

**¿Qué pasa si el servidor se cae pero yo tengo Internet?**
- Mismo comportamiento que sin Internet. La cola local acumula las ventas.
- Cuando el servidor vuelve, se sincroniza todo.

**¿Puedo usar CostPro en un celular con datos móviles?**
- Sí. Funciona igual.
- Si los datos se acaban, entra en modo offline hasta que vuelva.

**¿La app consume muchos datos?**
- CostPro está optimizada para usar pocos datos; el consumo depende del uso (catálogo, fotos de factura, reportes).

**¿Si alguien entra a mi cuenta desde otra computadora mientras yo estoy offline, qué pasa?**
- Las ventas offline se guardan en la computadora local, no en el servidor.
- Cuando sincroniza, el servidor las procesa con su marca de tiempo y las reglas de idempotencia evitan duplicados.

**¿El modo offline es seguro?**
- Los datos en cola se guardan en el almacenamiento local del navegador (IndexedDB) del dispositivo donde usted inició sesión.
- Proteja el dispositivo: quien tenga acceso físico a su sesión del navegador puede ver esos datos locales.

**¿Cuánto tarda la sincronización después de un corte largo?**
- Depende de cuántas operaciones haya en cola.
- El motor de sincronización trabaja automáticamente (también al reconectar); mientras sincroniza, puede seguir usando el sistema.
- Si alguna operación falla, puede **reintentarla** o **descartarla** desde el indicador de sincronización.
