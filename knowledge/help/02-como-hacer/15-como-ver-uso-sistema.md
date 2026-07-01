# Cómo Hacer: Ver Cuánto se Usa el Sistema (Monitoreo de Uso)

> **Necesita esto cuando**: Es administrador o dueño y quiere saber qué usuarios están usando el sistema, qué módulos más se usan, en qué horarios hay más actividad, y si hay usuarios que casi no entran.

## ¿Para qué sirve el monitoreo de uso?

Como dueño o administrador, usted paga licencias por usuario. Si tiene 10 licencias pero solo 3 usuarios entran realmente, está desperdiciando dinero. El monitoreo le permite:

- Ver **quién entra** y con qué frecuencia.
- Ver **qué módulos** se usan más y cuáles son "decoración".
- Detectar **horarios pico** (para planificar mantenimiento).
- Identificar **usuarios inactivos** (¿para qué pagar su licencia?).
- Justificar la compra de más licencias si hay saturación.

## Paso 1 — Ir a Monitoreo de Uso

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Monitoreo de Uso** (a veces llamado "Uso del Sistema").
3. Verá un panel con varias pestañas.

## Paso 2 — Conocer las pestañas del panel

El panel tiene 4 pestañas principales:

| Pestaña | Qué muestra |
|---------|-------------|
| **Resumen** | KPIs generales: usuarios activos hoy, esta semana, este mes. |
| **Por usuario** | Tabla con cada usuario y su actividad. |
| **Por módulo** | Cuántas veces se entró a cada módulo. |
| **Por horario** | Gráfico de qué horas del día hay más actividad. |

## Paso 3 — Revisar el Resumen

La pestaña Resumen muestra:

### KPIs principales
- **Usuarios activos hoy**: cuántos entraron hoy.
- **Sesiones totales hoy**: cuántas veces entraron (un usuario puede entrar varias veces).
- **Tiempo promedio de sesión**: cuánto tiempo pasa cada usuario en el sistema.
- **Módulo más usado hoy**: el que más visitas tuvo.

### Gráfico de actividad semanal
- Línea con la actividad de los últimos 7 días.
- Pase el mouse sobre cada punto para ver el detalle del día.

### Top 5 usuarios más activos
- Lista con los 5 usuarios que más entraron esta semana.

### Top 5 usuarios menos activos
- Lista con los 5 usuarios que menos entraron. Candidatos a revisar si necesitan su licencia.

## Paso 4 — Filtrar por fecha

1. Arriba, use los campos **"Desde"** y **"Hasta"** para elegir el período.
2. Use los botones rápidos: Hoy, Ayer, Esta semana, Este mes, Mes pasado.
3. Los datos se actualizan automáticamente.

## Paso 5 — Revisar la actividad por usuario

1. Haga clic en la pestaña **"Por usuario"**.
2. Verá una tabla con:

| Usuario | Tienda | Último acceso | Sesiones | Tiempo total | Módulo favorito |
|---------|--------|---------------|----------|--------------|-----------------|
| Juan Pérez | Centro | Hoy 14:32 | 23 | 12h 45m | POS |
| María López | Sucursal 2 | Ayer 18:10 | 18 | 9h 20m | Inventario |
| Carlos Ruiz | Centro | Hace 3 días | 4 | 1h 10m | Reportes |

3. Haga clic en cualquier usuario para ver el detalle de sus sesiones.

## Paso 6 — Revisar la actividad por módulo

1. Haga clic en la pestaña **"Por módulo"**.
2. Verá una tabla con todos los módulos del sistema:

| Módulo | Sesiones | Tiempo total | Usuarios únicos | Última visita |
|--------|----------|--------------|-----------------|----------------|
| POS | 1,250 | 245h | 8 | Hoy |
| Inventario | 540 | 87h | 6 | Hoy |
| Reportes | 320 | 45h | 4 | Ayer |
| Catálogo | 180 | 22h | 3 | Hace 2 días |
| IPV | 12 | 3h | 2 | Hace 1 semana |

3. Los módulos con poca actividad son candidatos a:
   - Capacitar mejor a los usuarios.
   - Simplificar o rediseñar.
   - Eliminar si realmente no se necesitan.

## Paso 7 — Revisar el horario de actividad

1. Haga clic en la pestaña **"Por horario"**.
2. Verá un gráfico de barras con la actividad por hora del día:
   - Eje X: las 24 horas.
   - Eje Y: cantidad de sesiones.
3. Identifique:
   - **Horas pico**: cuando el sistema está más cargado. Evite mantenimiento en esas horas.
   - **Horas valle**: cuando hay poca actividad. Buen momento para tareas pesadas (backups, actualizaciones).

## Paso 8 — Exportar el reporte

1. Haga clic en **"Exportar"** (arriba a la derecha).
2. Elija PDF o Excel.
3. El reporte incluye todas las pestañas en un solo documento.
4. Útil para presentar al dueño o para reuniones de gestión.

## Paso 9 — Tomar acciones basadas en los datos

### Si detecta usuarios inactivos:
- Hable con ellos. ¿Tienen problemas para entrar? ¿No saben usar el sistema?
- Si siguen sin usar, considere revocar su licencia.
- Use el ahorro para licencias donde sí se necesitan.

### Si detecta módulos sin uso:
- Pregunte por qué no se usan. ¿Son confusos? ¿No son útiles?
- Si son confusos, ayude con capacitación (lea el Centro de Ayuda).
- Si no son útiles, considere desactivarlos.

### Si detecta saturación en horas pico:
- Programe mantenimiento en horas valle.
- Considere dividir turnos para no saturar el sistema.

---

## Preguntas frecuentes

**¿El monitoreo es en tiempo real?**
- Casi. Se actualiza cada 5 minutos.
- Para ver algo que acaba de pasar, espere 5 minutos o haga clic en "Actualizar".

**¿El monitoreo afecta el rendimiento del sistema?**
- No. Está diseñado para ser muy ligero.
- Los datos se guardan de forma agregada, no se registra cada clic.

**¿Quién puede ver el monitoreo?**
- Solo administradores y roles con permiso explícito.
- Los cajeros y encargados no ven esta información.

**¿Por cuánto tiempo se guardan los datos de monitoreo?**
- Por defecto, 90 días.
- Para análisis de largo plazo, el administrador puede exportar mensualmente y archivar.

**¿Se puede saber qué usuario hizo una acción específica?**
- Para acciones críticas (anular venta, ajuste de inventario, cambio de precios), sí: vea el módulo Auditoría.
- El monitoreo de uso solo guarda agregados, no cada acción individual.

**¿Cómo se compara con la Auditoría?**
- El **monitoreo** es para ver patrones generales (quién usa, cuándo, cuánto).
- La **auditoría** es para ver acciones específicas (quién anuló la venta X, quién cambió el precio del producto Y).
- Ambos son complementarios.

**¿Puedo recibir alertas si un usuario no entra en X días?**
- Sí. En Configuración → Alertas, active "Alerta de usuario inactivo".
- Elija cuántos días sin acceso disparan la alerta (por defecto: 7 días).
- Recibirá un correo o notificación cuando se cumpla.
