# Roles y Permisos de Usuario

## Jerarquía de Roles

CostPro implementa un sistema de roles jerárquico basado en el principio de **mínimo privilegio**. Cada rol tiene un conjunto definido de permisos, donde los niveles superiores heredan y amplían los del nivel inmediato inferior.

La jerarquía de roles, de mayor a menor acceso, es la siguiente:

| Nivel | Rol | Descripción |
|-------|-----|-------------|
| 1 | **admin** | Acceso total al sistema. Administración completa de usuarios, roles, tiendas y configuración. |
| 2 | **manager** | Gestión operativa. Control total de costos, ventas e inventario dentro de las tiendas asignadas. |
| 3 | **encargado** | Supervisión diaria. Gestión de POS, inventario y ventas con capacidades de supervisión. |
| 4 | **clerk** | Operaciones de venta. Transacciones POS, consulta de inventario e historial de ventas propias. |
| 5 | **warehouse** | Gestión de almacén. Recepciones, transferencias, conteos y ajustes de inventario. |
| 6 | **usuario** | Acceso de consulta. Solo lectura de la información asignada, sin capacidad de edición. |

> **Importante**: Los permisos son acumulativos. Un *manager* tiene todos los permisos de un *encargado*, *clerk*, *warehouse* y *usuario*, más los suyos propios.

## Permisos por Módulo

La siguiente tabla detalla el nivel de acceso de cada rol a los módulos principales del sistema:

### COSTOS

| Permiso | admin | manager | encargado | clerk | warehouse | usuario |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|
| Ver fichas de costo | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Crear fichas de costo | ✅ | ✅ | — | — | — | — |
| Editar fichas de costo | ✅ | ✅ | — | — | — | — |
| Eliminar fichas de costo | ✅ | ✅ | — | — | — | — |
| Usar KPI Tablero / Solver | ✅ | ✅ | ✅ | — | — | ✅ |
| Generador masivo | ✅ | ✅ | — | — | — | — |
| Explorador de plantillas | ✅ | ✅ | ✅ | — | — | ✅ |
| Asistente IA (Darian) | ✅ | ✅ | ✅ | — | — | ✅ |
| Modo Auditoría | ✅ | ✅ | ✅ | — | — | — |
| Exportar PDF / Excel | ✅ | ✅ | ✅ | — | — | ✅ |
| Importar / Exportar JSON | ✅ | ✅ | — | — | — | — |

### MULTI-TIENDA

| Permiso | admin | manager | encargado | clerk | warehouse | usuario |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|
| Dashboard KPI | ✅ | ✅ | ✅ | — | — | ✅ |
| Terminal POS | ✅ | ✅ | ✅ | ✅ | — | — |
| Historial de ventas | ✅ | ✅ | ✅ | ✅ (propias) | — | — |
| Cierre de caja | ✅ | ✅ | ✅ | ✅ | — | — |
| Catálogo de productos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventario | ✅ | ✅ | ✅ | ✅ (lectura) | ✅ | ✅ (lectura) |
| Recepciones | ✅ | ✅ | ✅ | — | ✅ | — |
| Transferencias | ✅ | ✅ | ✅ | — | ✅ | — |
| Conteo de inventario | ✅ | ✅ | ✅ | — | ✅ | — |
| Ajustes de inventario | ✅ | ✅ | ✅ | — | ✅ | — |

### IPV

| Permiso | admin | manager | encargado | clerk | warehouse | usuario |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|
| Reportes IPV | ✅ | ✅ | ✅ | — | — | ✅ |
| Transacciones | ✅ | ✅ | ✅ | — | — | — |
| Catálogo IPV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reglas | ✅ | ✅ | — | — | — | — |
| Simulación | ✅ | ✅ | ✅ | — | — | — |
| Planificación | ✅ | ✅ | — | — | — | — |
| Exportación MVT | ✅ | ✅ | — | — | — | — |
| Auditoría IPV | ✅ | ✅ | ✅ | — | — | — |

### CONFIGURACIÓN

| Permiso | admin | manager | encargado | clerk | warehouse | usuario |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|
| Gestión de usuarios | ✅ | — | — | — | — | — |
| Gestión de roles | ✅ | — | — | — | — | — |
| Gestión de tiendas | ✅ | — | — | — | — | — |
| Salud del sistema | ✅ | — | — | — | — | — |
| Logs de auditoría | ✅ | ✅ | — | — | — | — |
| Ajustes del sistema | ✅ | — | — | — | — | — |

## Seguridad

### Autenticación

CostPro utiliza **Supabase** como proveedor de autenticación, lo que garantiza:

- **Cifrado** de contraseñas con algoritmos modernos (bcrypt).
- **Gestión de sesiones** con tokens JWT de corta duración.
- **Renovación automática** de tokens de sesión.
- **Recuperación de contraseña** segura mediante enlace por correo electrónico.
- **Verificación de correo** obligatoria para nuevas cuentas.

### Gestión de Sesiones

- Las sesiones tienen un **tiempo de expiración** configurable por el administrador.
- La sesión se cierra automáticamente tras un período de **inactividad**.
- Un usuario puede tener **una sola sesión activa** por dispositivo (política configurable).
- Al cerrar sesión, se invalidan todos los tokens asociados.

### Registro de Auditoría

Todas las acciones relevantes del sistema quedan registradas en el **log de auditoría**, accesible desde **CONFIGURACIÓN > Logs de Auditoría**:

- Inicio y cierre de sesión.
- Creación, edición y eliminación de registros.
- Cambios en configuración del sistema.
- Exportaciones de datos.
- Cambios de roles y permisos.

> **Nota**: Los logs de auditoría son inmutables — no pueden ser modificados ni eliminados por ningún usuario, incluido el administrador.

## Acceso Multi-Tienda

### Asignación de Tiendas a Usuarios

Los usuarios pueden estar asignados a **una o múltiples tiendas** según su rol:

1. El **admin** tiene acceso a todas las tiendas del sistema.
2. Los demás roles son asignados a tiendas específicas por el administrador.
3. Al iniciar sesión, el usuario selecciona la tienda activa desde la barra superior.
4. Toda la información (ventas, inventario, costos) se filtra según la tienda seleccionada.

### Reglas de Visibilidad

| Condición | Comportamiento |
|-----------|----------------|
| Usuario con 1 sola tienda | La tienda se selecciona automáticamente, sin selector visible. |
| Usuario con múltiples tiendas | Se muestra el selector y debe elegir la tienda activa. |
| Admin | Puede ver y operar en cualquier tienda del sistema. |

> **Tip**: Si un usuario necesita acceso temporal a una tienda adicional, el administrador debe asignarla desde **CONFIGURACIÓN > Usuarios**. El cambio surte efecto de inmediato.
