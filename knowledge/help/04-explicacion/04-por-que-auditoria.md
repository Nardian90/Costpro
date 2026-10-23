# Explicación: Por Qué el Sistema Audita Todo

> **Lea esto cuando**: Quiere entender por qué CostPro guarda un registro de cada acción importante que hacen los usuarios, y por qué esto es bueno para todos (incluso para usted).

## La metáfora de la cámara de seguridad

Imagine que usted tiene una joyería. ¿Pondría cámaras de seguridad? Sí. ¿Por qué? No porque desconfíe de sus empleados, sino porque:

1. **Si hay un robo**, las cámaras le dicen quién fue y cuándo.
2. **Si alguien comete un error**, las cámaras le muestran qué pasó exactamente.
3. **Si alguien es acusado injustamente**, las cámaras lo defienden.
4. **Si usted mismo se equivoca**, las cámaras le recuerdan qué hizo.

La auditoría en CostPro es exactamente eso: una **cámara de seguridad** que registra las acciones importantes, no para espiar, sino para **proteger** a todos.

## ¿Qué se audita?

CostPro registra automáticamente:

### Acciones de ventas
- Cada venta creada (con usuario, fecha, monto).
- Cada venta anulada (con motivo, usuario, fecha).
- Cada descuento aplicado (con monto, motivo, autorizador si requiere).
- Cada cambio de precio de catálogo (el precio aplicado en cada venta queda registrado en la propia venta).

### Acciones de inventario
- Cada recepción de mercancía (con usuario, proveedor, monto).
- Cada ajuste de inventario (con motivo, usuario, cantidad).
- Cada transferencia creada, enviada, recibida.

### Acciones de caja
- Cada cierre de caja (con diferencias).

### Acciones administrativas
- Cada creación / edición / desactivación de usuario.
- Cada cambio de rol.
- Cada cambio de configuración global.
- Cada cambio de tasa de cambio.

### Acciones críticas
- Cada cambio en una ficha de costo.
- Las exportaciones de datos relevantes (cada módulo define las suyas).

> ℹ️ Los inicios de sesión y accesos fallidos no se escriben hoy en la auditoría global: si su cuenta muestra acciones que no hizo, cambie la contraseña y avise al administrador.

## ¿Qué NO se audita?

Para no invadir la privacidad ni saturar el sistema, **NO** se audita:

- Las páginas que usted visita (solo se cuenta para estadísticas agregadas).
- Las búsquedas que hace.
- Los clics en menús.
- El tiempo que pasa en cada pantalla.
- El contenido de los chats con el asistente IA.

## ¿Quién puede ver la auditoría?

- **admin**: ve todo desde la vista global **Auditoría**, cuya entrada solo aparece para administradores.
- **manager y encargado** no abren esa vista global, pero pueden consultar los eventos de **su tienda** (por ejemplo, la Bitácora de Auditoría del Generador de Reportes).

Los registros quedan igualmente protegidos contra borrado, aunque usted no pueda consultarlos.

> ⚠️ **Importante**: Si usted es cajero y le preocupa que "alguien esté viendo lo que hace", sepa que sus compañeros cajeros no pueden verlo. Solo el administrador. Y no ve cada clic suyo, solo las acciones importantes.

## ¿Por qué es bueno para usted?

### 1. Lo protege de acusaciones falsas
Si alguien le dice: *"Anulaste una venta de 500 pesos sin motivo"*, usted puede ir a la auditoría y mostrar:
- *"Mire, aquí está la anulación. La hice yo a las 3:15 pm. El motivo fue 'devolución del cliente'. El supervisor Juan autorizó."*

La auditoría **es su defensa**.

### 2. Detecta errores rápidamente
Si al final del día la caja no cuadra, en lugar de revisar 200 ventas una por una, usted va a la auditoría y filtra:
- "Acciones de caja de hoy"
- "Anulaciones de hoy"
- "Descuentos aplicados hoy"

En 2 minutos encuentra el problema.

### 3. Detecta fraudes
Si un producto tiene ajustes de inventario sospechosos (muchas salidas por "daño" sin explicación), la auditoría muestra:
- Quién hizo cada ajuste.
- A qué hora.
- Cuántas unidades.

Si siempre es el mismo usuario, hay una señal.

### 4. Justifica decisiones
Si usted es encargado y despidió a un cajero por irregularidades, la auditoría es la **evidencia** que respalda su decisión. Sin ella, sería su palabra contra la del cajero.

### 5. Cumple con la ley
En muchos países, la ley exige llevar un registro de ciertas operaciones (sobre todo si manejan dinero o productos fiscalmente regulados). La auditoría de CostPro cumple con esos requisitos.

## ¿Cuánto tiempo se guarda la auditoría?

- **No se puede borrar desde la aplicación**: la base de datos lo impide para ningún usuario, admin incluido.
- El producto no define hoy una retención fija para la auditoría; las tablas fiscales (ventas, devoluciones, cierres de caja) documentan retenciones de 7–10 años.

## El reporte de auditoría

Desde **Operación → Auditoría**, puede generar reportes con filtros:

### Filtros disponibles
- Por tipo de evento (venta, ajuste, anulación, etc.).
- Por fecha y hora (desde / hasta).
- Por tienda.
- Por búsqueda de texto (también encuentra por nombre de usuario).

### El timeline
La auditoría se muestra como un **timeline** (línea de tiempo) con:
- Hora exacta.
- Usuario (nombre y correo).
- Acción realizada.
- Detalle (qué cambió, antes → después).

## Auditoría vs Monitoreo de uso

Es fácil confundirlos, pero son diferentes:

| Aspecto | Auditoría | Monitoreo de uso |
|---------|----------|-------------------|
| **Qué registra** | Acciones específicas importantes | Consumo de infraestructura (Vercel + Supabase) |
| **Granularidad** | Cada acción individual | Totales con alertas al 60/80/90 % del plan y forecast |
| **Propósito** | Investigación y compliance | Estadísticas y optimización de costos |
| **Quién lo ve** | admin | admin (sección Sistema) |
| **Ventana de datos** | Historial conservado (no borrable) | Agregados de los últimos 30 días |
| **Ejemplo** | "Juan anuló venta V-001 a las 3:15pm" | "Uso de ejecuciones al 72 % del plan" |

## Preguntas frecuentes

**¿La auditoría hace que el sistema sea lento?**
- No. Está optimizada para no afectar el rendimiento.
- Los registros se guardan en segundo plano.

**¿Puedo desactivar la auditoría?**
- No. Es una característica de seguridad que no se puede desactivar.
- Si le preocupa la privacidad, recuerde que solo registra acciones importantes, no cada clic.

**¿Puedo borrar mi propio historial de auditoría?**
- No. Ni siquiera el admin puede.
- Esto es para evitar que alguien borre evidencia de sus propios errores o fraudes.

**¿Qué hago si veo una acción en la auditoría que yo no hice?**
- Cambie su contraseña inmediatamente (lea *Cómo cambiar mi contraseña*).
- Avise al administrador.
- Posiblemente alguien entró con su cuenta.

**¿La auditoría sirve para algo más allá de investigar problemas?**
- Sí. Para análisis:
  - "¿A qué hora se hacen más ventas?" → planificar personal.
  - "¿Qué cajero anula más?" → capacitarlo o supervisarlo más.
  - "¿Qué productos se ajustan más?" → mejorar el control de esos productos.

**¿Las auditorías se pueden exportar?**
- Sí. En formato **CSV** (abrible en Excel).
- Útil para enviar al contador o a un auditor externo.

**¿Quién audita al propio auditor?**
- La auditoría registra **acciones de negocio** (ventas, ajustes, cierres, cambios de fichas…), no lecturas de la propia auditoría: consultar un registro no genera hoy un registro nuevo.
