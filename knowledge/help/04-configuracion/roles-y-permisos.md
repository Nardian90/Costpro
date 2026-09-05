# Roles y Permisos de Usuario

## 1. Jerarquía de Roles

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
| 7 | **costo** | Acceso exclusivo al módulo de costos. Gestión de fichas de costo, plantillas, KPI Tablero, Solver, asistente IA Darian y exportaciones. Sin acceso a POS, inventario, IPV, configuración, usuarios ni reportes operativos. |

> **Importante**: Los permisos son acumulativos dentro de la cadena principal (admin → manager → encargado → clerk → warehouse → usuario). El rol **costo** es una vía de acceso independiente y especializada; sus permisos no heredan de la cadena principal ni de ella heredan.

## 2. Permisos por Módulo

La siguiente tabla detalla el nivel de acceso de cada rol a los módulos principales del sistema. El sistema cuenta con **7 roles** en total.

### COSTOS

| Permiso | admin | manager | encargado | clerk | warehouse | usuario | costo |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|:-----:|
| Ver fichas de costo | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Crear fichas de costo | ✅ | ✅ | — | — | — | — | ✅ |
| Editar fichas de costo | ✅ | ✅ | — | — | — | — | ✅ |
| Eliminar fichas de costo | ✅ | ✅ | — | — | — | — | ✅ |
| Usar KPI Tablero / Solver | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Generador masivo | ✅ | ✅ | — | — | — | — | — |
| Explorador de plantillas | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Asistente IA (Darian) | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Modo Auditoría | ✅ | ✅ | ✅ | — | — | — | — |
| Exportar PDF / Excel | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Importar / Exportar JSON | ✅ | ✅ | — | — | — | — | — |

> **Nota**: El rol **costo** tiene acceso completo a las fichas de costo (creación, edición, eliminación) así como a las herramientas analíticas del módulo (KPI Tablero, Solver, Darian, plantillas y exportaciones). No tiene acceso al generador masivo ni a la importación/exportación JSON.

### MULTI-TIENDA

| Permiso | admin | manager | encargado | clerk | warehouse | usuario | costo |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|:-----:|
| Dashboard KPI | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Terminal POS | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Historial de ventas | ✅ | ✅ | ✅ | ✅ (propias) | — | — | — |
| Cierre de caja | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Catálogo de productos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventario | ✅ | ✅ | ✅ | ✅ (lectura) | ✅ | ✅ (lectura) | — |
| Recepciones | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Transferencias | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Conteo de inventario | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Ajustes de inventario | ✅ | ✅ | ✅ | — | ✅ | — | — |

> **Nota**: El rol **costo** solo accede al catálogo de productos en modo lectura dentro de MULTI-TIENDA, necesario como referencia para la elaboración de fichas de costo. No tiene acceso a POS, ventas, inventario ni ninguna operación de almacén.

### IPV

| Permiso | admin | manager | encargado | clerk | warehouse | usuario | costo |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|:-----:|
| Reportes IPV | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Transacciones | ✅ | ✅ | ✅ | — | — | — | — |
| Catálogo IPV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Reglas | ✅ | ✅ | — | — | — | — | — |
| Simulación | ✅ | ✅ | ✅ | — | — | — | — |
| Planificación | ✅ | ✅ | — | — | — | — | — |
| Exportación MVT | ✅ | ✅ | — | — | — | — | — |
| Auditoría IPV | ✅ | ✅ | ✅ | — | — | — | — |

> **Nota**: El rol **costo** no tiene acceso a ningún componente del módulo IPV.

### CONFIGURACIÓN

| Permiso | admin | manager | encargado | clerk | warehouse | usuario | costo |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|:-----:|
| Gestión de usuarios | ✅ | — | — | — | — | — | — |
| Gestión de roles | ✅ | — | — | — | — | — | — |
| Gestión de tiendas | ✅ | — | — | — | — | — | — |
| Salud del sistema | ✅ | — | — | — | — | — | — |
| Logs de auditoría | ✅ | ✅ | — | — | — | — | — |
| Ajustes del sistema | ✅ | — | — | — | — | — | — |

> **Nota**: El rol **costo** no tiene acceso a ningún componente del módulo de CONFIGURACIÓN. Solo el rol **admin** puede gestionar usuarios, roles, tiendas y ajustes del sistema.

## 3. Permisos Granulares

El sistema RBAC de CostPro utiliza **17 banderas de permisos granulares** que controlan el acceso a nivel de acción dentro de cada módulo. Estas banderas se evalúan en el frontend y en el backend para garantizar la seguridad en ambas capas.

### Catálogo de Productos

| Bandera | Descripción | Roles con acceso |
|---------|-------------|-----------------|
| `canCreateProducts` | Permite crear nuevos productos en el catálogo. | admin, manager, encargado, costo |
| `canEditProducts` | Permite editar información de productos existentes. | admin, manager, encargado, costo |
| `canDeleteProducts` | Permite eliminar productos del catálogo. | admin, manager, costo |

### Inventario

| Bandera | Descripción | Roles con acceso |
|---------|-------------|-----------------|
| `canViewInventory` | Permite consultar el inventario de la tienda activa. | admin, manager, encargado, clerk, warehouse, usuario |
| `canAdjustStock` | Permite realizar ajustes manuales de stock (entradas/salidas). | admin, manager, encargado, warehouse |
| `canReceiveProducts` | Permite registrar recepciones de mercancía y transfers entrantes. | admin, manager, encargado, warehouse |

### Ventas (POS)

| Bandera | Descripción | Roles con acceso |
|---------|-------------|-----------------|
| `canCreateSales` | Permite iniciar y procesar transacciones en la terminal POS. | admin, manager, encargado, clerk |
| `canViewSales` | Permite consultar el historial de ventas propias. | admin, manager, encargado, clerk |
| `canViewAllSales` | Permite consultar el historial completo de ventas de la tienda, sin restricción por vendedor. | admin, manager, encargado |
| `canUndoSales` | **POS Undo (MODELO C Nivel 1)**: permite deshacer desde el POS la venta que el usuario ACABA de realizar (botón "Deshacer" del toast, ventana de 30 segundos, venta propia, misma tienda). Server-side lo valida `void_transaction` + `can_pos_undo_transaction`. | admin, manager, encargado, clerk |
| `canReverseSales` | **Reversión administrativa (MODELO C Nivel 2)**: permite revertir cualquier venta de la tienda desde Historial (botón "Revertir", sin ventana temporal, incluye ventas ajenas). Server-side lo validan `/api/reverse` + `reverse_transaction_v2` + `can_admin_reverse_transaction`. El admin global tiene alcance transversal en todas las tiendas. | admin, manager, encargado |
| `canCloseCashRegister` | Permite ejecutar el cierre de caja al finalizar el turno. | admin, manager, encargado, clerk |

### Dashboard y Administración

| Bandera | Descripción | Roles con acceso |
|---------|-------------|-----------------|
| `canViewDashboard` | Permite acceder al dashboard de KPIs e indicadores de la tienda. | admin, manager, encargado, usuario |
| `canManageUsers` | Permite crear, editar, desactivar usuarios y asignarles roles/tiendas. | admin |
| `canManageStores` | Permite crear, editar y configurar tiendas dentro del sistema. | admin |

### Auditoría e Inventario Físico

| Bandera | Descripción | Roles con acceso |
|---------|-------------|-----------------|
| `canViewAudits` | Permite acceder a los registros de auditoría del sistema. | admin, manager |
| `canPerformInventoryCount` | Permite ejecutar conteos físicos de inventario y registrar discrepancias. | admin, manager, encargado, warehouse |

> **Nota**: Las banderas granulares son la capa de autorización final. La anulación/reversión de ventas (`canUndoSales`, `canReverseSales`) se evalúa en el frontend (visibilidad de botones) Y en el backend (API `/api/reverse` + RPC `void_transaction`/`reverse_transaction_v2` + funciones de autorización en base de datos), por lo que ninguna de estas operaciones puede ser eludida mediante manipulación del cliente. Para el resto de banderas, la visibilidad en la interfaz puede no coincidir con validaciones server-side específicas de cada endpoint.

### Anulación y reversión de ventas (MODELO C)

CostPro distingue **dos operaciones distintas** para revertir una venta:

| | POS Undo ("Deshacer") | Reversión administrativa ("Revertir") |
|---|---|---|
| **Dónde** | Toast del POS, inmediatamente tras vender | Historial de ventas (terminal → ventas) |
| **Qué permite** | Deshacer la venta que el usuario ACABA de realizar | Revertir cualquier venta de la tienda (incluidas ventas ajenas) |
| **Ventana** | 30 segundos (validada en servidor) | Sin restricción temporal |
| **Roles** | admin, manager, encargado, clerk (operadores POS) | admin, manager, encargado |
| **Alcance** | Misma tienda, venta propia | Misma tienda; el admin global en todas las tiendas |
| **Canal técnico** | RPC `void_transaction` → `can_pos_undo_transaction` | API `/api/reverse` → RPC `reverse_transaction_v2` → `can_admin_reverse_transaction` |

> **Principio**: la membresía de tienda responde "¿puede este usuario operar en esta tienda?"; el rol responde "¿puede este usuario realizar esta operación administrativa?". Un clerk puede deshacer SU venta recién hecha, pero no puede revertir ventas ajenas: eso es una operación administrativa reservada a admin/manager/encargado.

### Reversión de otros documentos (MODELO B-10)

Cada módulo define quién puede revertir sus documentos (botón "Revertir" del
historial correspondiente). El rol se evalúa como **membresía activa en la
tienda del documento** (no como rol global), y el admin global tiene alcance
transversal. Autorización server-side en `/api/reverse` + `can_reverse_document`
en base de datos — el frontend solo refleja la política:

| Documento | Vista | Quién puede revertir (membresía) | Estados reversibles |
|---|---|---|---|
| Recepción | Recepciones | admin, manager, encargado, warehouse | active |
| Transferencia | Transferencias (salientes) | admin, manager, encargado, warehouse en la tienda de ORIGEN (+ acceso a destino) | CONFIRMADA |
| Ajuste documental | Ajustes Doc. | admin, manager, encargado | confirmed |
| Devolución | (sin entrada de navegación) | cualquier membresía activa de la tienda (igual que su creación) | completed |
| Orden de producción | Costo → Órdenes de Producción | admin, manager, costo | closed |
| Venta | Historial | admin, manager, encargado (ver MODELO C) | completed |

> Nota: revertir un ajuste documental crea un **contra-ajuste** (invierte el
> efecto del conteo en stock y kardex) y marca el original como "Revertido".
> Duplicar un ajuste es una operación distinta (copia el conteo tal cual).

## 4. Seguridad

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

## 5. Acceso Multi-Tienda

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
| Costo | Puede consultar y gestionar fichas de costo de las tiendas asignadas. |

> **Tip**: Si un usuario necesita acceso temporal a una tienda adicional, el administrador debe asignarla desde **CONFIGURACIÓN > Usuarios**. El cambio surte efecto de inmediato.
