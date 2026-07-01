# Explicación: Cómo Funciona CostPro Sin Internet

> **Lea esto cuando**: Quiere entender cómo es posible que el sistema siga funcionando cuando se corta el Internet, y qué precauciones tomar.

## La pregunta básica: ¿cómo vendo si se va el Internet?

En muchos países, el Internet se corta con frecuencia. Cortes de luz, fallas del proveedor, tormentas. Si su sistema de ventas depende del Internet, cuando se corta, usted no puede vender. Y si no puede vender, pierde dinero.

CostPro está diseñado para **seguir funcionando sin Internet**. Esto se llama **modo offline**.

## ¿Qué se puede hacer sin Internet?

| Acción | ¿Funciona offline? |
|--------|-------------------|
| Hacer ventas en el POS | ✅ Sí |
| Ver el catálogo de productos | ✅ Sí |
| Recibir mercancía | ✅ Sí (queda pendiente de sincronizar) |
| Hacer ajustes de inventario | ✅ Sí |
| Ver el historial de ventas | ✅ Sí (solo lo que ya está cargado) |
| Cerrar caja | ✅ Sí |
| Generar reportes | ✅ Sí (con datos locales) |
| Cambiar de tienda activa | ❌ No (necesita cargar datos de otra tienda) |
| Crear nuevos productos en el catálogo | ⚠️ Parcial (queda pendiente) |
| Ver reportes consolidados | ❌ No (necesita datos del servidor) |
| Recibir notificaciones | ❌ No |
| Hablar con el asistente IA Darian | ❌ No |

> 💡 **Resumen**: Lo esencial (vender, recibir mercancía, cerrar caja) funciona offline. Lo que requiere datos del servidor o de Internet, no.

## ¿Cómo funciona técnicamente?

### 1. Almacenamiento local persistente
CostPro guarda en su computadora (o teléfono) una **copia local** de los datos más importantes:
- El catálogo de productos.
- Los precios.
- El stock actual.
- Las ventas del día.
- La configuración básica.

Esta copia está en el navegador, en una zona llamada **localStorage** o **IndexedDB**. No se borra aunque cierre el navegador o apague la computadora.

### 2. Cola de operaciones pendientes
Cuando usted hace una venta sin Internet:

1. La venta se guarda en la cola local.
2. El sistema marca la venta como **"pendiente de sincronizar"**.
3. El inventario se descuenta localmente.
4. La caja se actualiza localmente.
5. Usted ve todo normal, como si tuviera Internet.

### 3. Sincronización automática
Cuando vuelve el Internet:

1. El sistema detecta que hay conexión.
2. Empieza a enviar las ventas pendientes al servidor.
3. El servidor procesa cada venta.
4. Si hay conflictos (ej: el stock en el servidor ya cambió), los resuelve inteligentemente.
5. Cuando todo está sincronizado, borra la cola local.

### 4. Indicador visual
En la barra superior verá un ícono que le indica el estado:

| Ícono | Significado |
|-------|-------------|
| 🟢 Punto verde | Conectado. Todo se sincroniza en tiempo real. |
| 🟡 Punto amarillo | Sin conexión. Operando offline. |
| 🔴 Punto rojo | Error de sincronización. Revisar. |
| 🔵 Punto azul girando | Sincronizando... |

## ¿Qué pasa si dos tiendas operan offline al mismo tiempo?

Imagine: la Tienda A y la Tienda B están ambas offline. En la Tienda A venden 5 unidades de "Leche". En la Tienda B también venden 5 unidades de "Leche". Cuando vuelva el Internet:

- La Tienda A sincroniza sus 5 ventas.
- La Tienda B sincroniza sus 5 ventas.
- El servidor actualiza el stock de cada tienda.

**No hay conflicto** porque cada tienda tiene su propio stock. El sistema está diseñado para esto.

## ¿Qué pasa si hago una transferencia offline?

Esto es más delicado. Una transferencia afecta dos tiendas. Si las dos están offline:

- La transferencia queda **pendiente** en la tienda origen.
- No se confirma en destino hasta que ambos recuperen Internet.
- El stock NO se descuenta de origen hasta que la transferencia se envíe al servidor.

Recomendación: **No haga transferencias offline**. Espere a tener Internet.

## ¿Qué pasa si el corte dura muchas horas?

Si el corte dura mucho (varias horas o días):

1. **Siga vendiendo** normalmente. Las ventas se acumulan en la cola.
2. **Tenga cuidado con el stock**. Si vende mucho sin sincronizar, el sistema local puede decir que un producto tiene stock cuando en realidad ya se agotó en otra tienda (si el corte es en ambas).
3. **No apague la computadora**. Si la apaga, la cola se conserva, pero no se sincroniza hasta que la encienda de nuevo.
4. **Cuando vuelva el Internet**, deje la computadora encendida al menos 30 minutos para que sincronice todo.

> ⚠️ **Límite práctico**: CostPro puede manejar hasta 10,000 ventas en cola offline sin problemas. Más de eso, puede hacerse lento. Si su negocio hace más de 10,000 ventas sin Internet, necesita un servidor local (consulte al administrador).

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
2. Espere a que sincronice todo (punto verde).
3. Navegue por las pantallas que va a necesitar (catálogo, POS).
4. Esto asegura que la copia local esté actualizada.

### 3. Tenga un plan B para los pagos
Si vende por transferencia bancaria y no hay Internet, el cliente no puede hacer la transferencia. Tenga:
- Una cuenta para pago en efectivo como respaldo.
- O acepte solo efectivo durante el corte.

### 4. Capacite a los cajeros
Asegúrese de que todos los cajeros sepan:
- Reconocer el ícono amarillo (offline).
- Saber que pueden seguir vendiendo.
- Saber que NO deben hacer transferencias offline.
- Saber que al volver el Internet, hay que esperar a que sincronice antes de apagar.

## ¿Cómo sé que todo se sincronizó bien?

Después de un corte:

1. Mire el ícono de estado. Debe estar verde.
2. Vaya al **Centro de Errores** (en Configuración) y vea si hay errores de sincronización.
3. Genere un reporte de ventas del día y compare con sus ventas reales.
4. Si todo cuadra, está perfecto.

Si hay errores (algunas ventas no se sincronizaron):
- El sistema le permite **reintentar** la sincronización.
- O **descartar** las operaciones problemáticas (con autorización del supervisor).

## Preguntas frecuentes

**¿Las ventas hechas offline aparecen con una marca diferente?**
- Sí. En el historial de ventas, las offline tienen un ícono de "nube" tachada.
- Útil para auditoría: saber que esa venta se hizo sin conexión.

**¿Puedo editar una venta hecha offline?**
- No, igual que las ventas online. Pero puede anularla (dentro de 24h).

**¿Qué pasa si el servidor se cae pero yo tengo Internet?**
- Mismo comportamiento que sin Internet. La cola local acumula las ventas.
- Cuando el servidor vuelve, se sincroniza todo.

**¿Puedo usar CostPro en un celular con datos móviles?**
- Sí. Funciona igual.
- Si los datos se acaban, entra en modo offline hasta que vuelva.

**¿La app consume muchos datos?**
- No. CostPro está optimizada para usar pocos datos.
- Aproximadamente 1-2 MB por hora de uso activo.

**¿Si alguien entra a mi cuenta desde otra computadora mientras yo estoy offline, qué pasa?**
- El sistema permite múltiples sesiones simultáneas.
- Pero las ventas offline se guardan en la computadora local, no en el servidor.
- Cuando sincronizan ambas, el servidor las ordena por timestamp (fecha y hora exacta).
- Puede haber pequeñas diferencias en el orden de las ventas, pero los totales cuadran.

**¿El modo offline es seguro?**
- Sí. Los datos locales están encriptados.
- Si alguien roba la computadora, no puede leer las ventas sin la contraseña de CostPro.
- Al detectar actividad sospechosa, el sistema pide re-autenticación.

**¿Cuánto tarda la sincronización después de un corte largo?**
- Depende de cuántas ventas haya en cola.
- 100 ventas: 30 segundos.
- 1,000 ventas: 5 minutos.
- 10,000 ventas: hasta 1 hora.
- Mientras sincroniza, puede seguir usando el sistema (no se bloquea).
