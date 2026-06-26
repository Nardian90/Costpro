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
- Cada cambio de precio en el POS.

### Acciones de inventario
- Cada recepción de mercancía (con usuario, proveedor, monto).
- Cada ajuste de inventario (con motivo, usuario, cantidad).
- Cada transferencia creada, enviada, recibida.

### Acciones de caja
- Cada apertura de turno.
- Cada cierre de turno (con diferencias).
- Cada arqueo parcial.

### Acciones administrativas
- Cada creación / edición / desactivación de usuario.
- Cada cambio de rol.
- Cada cambio de configuración global.
- Cada cambio de tasa de cambio.

### Acciones críticas
- Cada intento de acceso fallido.
- Cada inicio de sesión exitoso.
- Cada exportación de datos masiva.
- Cada cambio en una ficha de costo.

## ¿Qué NO se audita?

Para no invadir la privacidad ni saturar el sistema, **NO** se audita:

- Las páginas que usted visita (solo se cuenta para estadísticas agregadas).
- Las búsquedas que hace.
- Los clics en menús.
- El tiempo que pasa en cada pantalla.
- El contenido de los chats con el asistente IA.

## ¿Quién puede ver la auditoría?

- **admin**: ve todo.
- **manager**: ve todo de sus tiendas.
- **encargado**: ve la auditoría de su tienda.
- **clerk, almacen, usuario**: NO pueden ver la auditoría.

> ⚠️ **Importante**: Si usted es cajero y le preocupa que "alguien esté viendo lo que hace", sepa que sus compañeros cajeros no pueden verlo. Solo los supervisores. Y ellos no ven cada clic suyo, solo las acciones importantes.

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

- **Por defecto**: 5 años.
- **Configurable**: el administrador puede extender a 7 o 10 años si la ley lo exige.
- **No se puede borrar**: ni siquiera el admin puede eliminar registros de auditoría. Solo se pueden archivar (dejan de verse en la lista pero siguen en la base de datos).

## El reporte de auditoría

Desde **Configuración → Auditoría Global**, puede generar reportes con filtros:

### Filtros disponibles
- Por usuario.
- Por tipo de acción (venta, ajuste, anulación, etc.).
- Por fecha y hora.
- Por tienda.
- Por monto (ej: solo acciones que involucran más de 1000 pesos).
- Por severidad (info, advertencia, crítica).

### El timeline
La auditoría se muestra como un **timeline** (línea de tiempo) con:
- Hora exacta.
- Usuario (con foto si está cargada).
- Acción realizada.
- Detalle (qué cambió, antes → después).
- IP desde donde se hizo (útil si alguien dice "no fui yo").

## Auditoría vs Monitoreo de uso

Es fácil confundirlos, pero son diferentes:

| Aspecto | Auditoría | Monitoreo de uso |
|---------|----------|-------------------|
| **Qué registra** | Acciones específicas importantes | Patrones agregados |
| **Granularidad** | Cada acción individual | Totales por día/semana/mes |
| **Propósito** | Investigación y compliance | Estadísticas y optimización |
| **Quién lo ve** | admin, manager, encargado | admin, manager |
| **Tiempo de retención** | 5+ años | 90 días |
| **Ejemplo** | "Juan anuló venta V-001 a las 3:15pm" | "Hoy hubo 23 sesiones, 8h total" |

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
- Posiblemente alguien entró con su cuenta. La auditoría mostrará desde qué IP.

**¿La auditoría sirve para algo más allá de investigar problemas?**
- Sí. Para análisis:
  - "¿A qué hora se hacen más ventas?" → planificar personal.
  - "¿Qué cajero anula más?" → capacitarlo o supervisarlo más.
  - "¿Qué productos se ajustan más?" → mejorar el control de esos productos.

**¿Las auditorías se pueden exportar?**
- Sí. En formato PDF o Excel.
- Útil para enviar al contador o a un auditor externo.

**¿Quién audita al propio auditor?**
- El sistema registra también cuándo alguien **ve** un registro de auditoría.
- Es decir, si el admin consulta la auditoría para ver qué hizo Juan, esa consulta también queda registrada.
- Esto evita que alguien "vigile" a otros sin dejar rastro.
