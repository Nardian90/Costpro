# Cómo Administrar Tiendas y Usuarios

Guía completa para la gestión multi-tienda, administración de usuarios y control de acceso por roles en CostPro.

## Contenido

- [1. Crear Tiendas](#1-crear-tiendas)
  - [Pasos para Crear una Tienda](#pasos-para-crear-una-tienda)
  - [Editar una Tienda Existente](#editar-una-tienda-existente)
- [2. Gestión de Usuarios](#2-gestión-de-usuarios)
  - [Crear un Nuevo Usuario](#crear-un-nuevo-usuario)
  - [Operaciones sobre Usuarios](#operaciones-sobre-usuarios)
  - [Restablecer Contraseña](#restablecer-contraseña)
- [3. Gestión de Roles](#3-gestión-de-roles)
  - [Roles Disponibles](#roles-disponibles)
  - [Detalle de Permisos por Rol](#detalle-de-permisos-por-rol)
  - [Crear y Editar Roles](#crear-y-editar-roles)
- [4. Cambiar de Tienda Activa](#4-cambiar-de-tienda-activa)
  - [Selector de Tienda](#selector-de-tienda)
  - [Aislamiento de Datos](#aislamiento-de-datos)
- [5. Estado de Usuarios](#5-estado-de-usuarios)
  - [Habilitar un Usuario](#habilitar-un-usuario)
  - [Deshabilitar un Usuario](#deshabilitar-un-usuario)
- [6. Datos por Tienda](#6-datos-por-tienda)
  - [Inventario](#inventario)
  - [Ventas](#ventas)
  - [Reportes](#reportes)
  - [Cash Closures (Cierres de Caja)](#cash-closures-cierres-de-caja)
- [7. Flujo de Trabajo Recomendado](#7-flujo-de-trabajo-recomendado)

---

## 1. Crear Tiendas

Las tiendas representan sucursales físicas o puntos de venta dentro de tu organización.

### Pasos para Crear una Tienda

1. Navega a **CONFIGURACIÓN > Administrativa > Tiendas**
2. Haz clic en **Agregar Tienda**
3. Completa los campos del formulario:

| Campo | Descripción | Obligatorio |
|-------|-------------|:-----------:|
| **Nombre** | Nombre comercial de la tienda (ej. `Sucursal Centro`) | ✅ |
| **Dirección** | Dirección física completa | ✅ |
| **Teléfono** | Número de contacto de la tienda | ✅ |
| **Logo** | Imagen corporativa de la sucursal | ❌ |
| **Email** | Correo de contacto de la tienda | ❌ |
| **Horario** | Horario de atención | ❌ |

4. Haz clic en **Guardar**

> **💡 Tip:** Puedes asignar un logo diferente para cada tienda. Esto se reflejará en los recibos y reportes generados desde esa sucursal.

### Editar una Tienda Existente

1. Navega a **CONFIGURACIÓN > Administrativa > Tiendas**
2. Selecciona la tienda de la lista
3. Modifica los campos necesarios
4. Haz clic en **Guardar Cambios**

---

## 2. Gestión de Usuarios

### Crear un Nuevo Usuario

1. Navega a **CONFIGURACIÓN > Administrativa > Usuarios**
2. Haz clic en **Crear Usuario**
3. Completa los datos del usuario:

| Campo | Descripción |
|-------|-------------|
| **Nombre completo** | Nombre y apellido del usuario |
| **Correo electrónico** | Email que usará para iniciar sesión |
| **Contraseña** | Contraseña temporal (el usuario deberá cambiarla al primer acceso) |
| **Rol** | Rol asignado (ver sección de Roles abajo) |
| **Tiendas asignadas** | Sucursales a las que tiene acceso |

4. Haz clic en **Guardar**

> **⚠️ Importante:** Un usuario puede tener acceso a **múltiples tiendas**. Los datos que ve en cada momento dependen de la tienda activa seleccionada en la barra superior.

### Operaciones sobre Usuarios

| Acción | Descripción | Cómo hacerlo |
|--------|-------------|--------------|
| **Editar perfil** | Modificar nombre, email, rol | Seleccionar usuario > Editar |
| **Habilitar/Deshabilitar** | Activar o desactivar cuenta sin eliminarla | Toggle en la columna de estado |
| **Restablecer contraseña** | Enviar nueva contraseña temporal | Botón de reset junto al usuario |
| **Eliminar** | Eliminar permanentemente la cuenta | Botón de eliminar (solo si no tiene transacciones) |

### Restablecer Contraseña

1. En la lista de usuarios, haz clic en el icono de **restablecer contraseña** junto al usuario
2. El sistema genera una contraseña temporal
3. La nueva contraseña se envía al correo del usuario
4. Al iniciar sesión por primera vez, el usuario deberá cambiarla

> **⚠️ Nota:** Los usuarios deshabilitados no pueden iniciar sesión, pero sus datos históricos (ventas, movimientos) se conservan en el sistema.

---

## 3. Gestión de Roles

Los roles definen los permisos y funcionalidades a las que un usuario tiene acceso dentro de CostPro.

### Roles Disponibles

| Rol | Descripción | Permisos principales |
|-----|-------------|---------------------|
| **admin** | Administrador total del sistema | Acceso completo a todos los módulos, configuración, usuarios, tiendas, reportes, costos |
| **manager** | Gerente de tienda | Gestión de la tienda asignada: ventas, inventario, cierres de caja, reportes locales, usuarios de su tienda |
| **encargado** | Encargado de operaciones | Ventas, consulta de inventario, cierres de caja, reportes básicos |
| **clerk** | Cajero / Vendedor | Registro de ventas, consulta de precios, emisión de recibos |
| **warehouse** | Responsable de almacén | Gestión de inventario, entradas, salidas, ajustes de stock |
| **usuario** | Usuario básico | Consulta limitada de información y reportes de lectura |

### Detalle de Permisos por Rol

```
admin
├── ✅ CONFIGURACIÓN (completa)
│   ├── Tiendas, Usuarios, Roles
│   ├── Parámetros del sistema
│   └── Integraciones
├── ✅ COSTOS (completo)
│   ├── Fichas de costo, Plantillas
│   ├── Anexos, Fórmulas, Solver
│   └── Exportación (PDF, Excel, JSON)
├── ✅ INVENTARIO (completo)
│   ├── Productos, Categorías
│   ├── Entradas, Salidas, Ajustes
│   └── Transferencias entre tiendas
├── ✅ VENTAS (completo)
│   ├── Punto de venta, Cotizaciones
│   └── Cierres de caja
├── ✅ IPV (completo)
│   ├── Reportes, Operaciones
│   ├── Catálogos, Procesamiento IA
│   └── Avanzado (Auditoría, MVT, Mipyme)
└── ✅ REPORTES (completos)

manager
├── ✅ VENTAS de su tienda
├── ✅ INVENTARIO de su tienda
├── ✅ CIERRES DE CAJA de su tienda
├── ✅ REPORTES de su tienda
└── ❌ CONFIGURACIÓN, COSTOS, IPV global

encargado
├── ✅ REGISTRO DE VENTAS
├── ✅ CONSULTA DE INVENTARIO (lectura)
├── ✅ CIERRES DE CAJA
├── ✅ REPORTES BÁSICOS
└── ❌ CONFIGURACIÓN, COSTOS, IPV

clerk
├── ✅ REGISTRO DE VENTAS
├── ✅ CONSULTA DE PRECIOS
├── ✅ EMISIÓN DE RECIBOS
└── ❌ CONFIGURACIÓN, COSTOS, IPV, INVENTARIO

warehouse
├── ✅ INVENTARIO (completo en su tienda)
│   ├── Entradas, Salidas, Ajustes
│   └── Consultas de stock
└── ❌ VENTAS, CONFIGURACIÓN, COSTOS, IPV

usuario
├── ✅ CONSULTA DE REPORTES (lectura)
└── ❌ Todo lo demás
```

### Crear y Editar Roles

1. Navega a **CONFIGURACIÓN > Administrativa > Roles**
2. Haz clic en **Crear Rol** o selecciona uno existente para editar
3. Configura los permisos marcando/desmarcando las casillas por módulo
4. Haz clic en **Guardar**

> **⚠️ Importante:** Los roles `admin` y `manager` no se pueden eliminar. Solo se pueden modificar sus permisos.

---

## 4. Cambiar de Tienda Activa

Cuando un usuario tiene acceso a múltiples tiendas, puede cambiar la tienda activa para ver y operar con los datos de cada sucursal.

### Selector de Tienda

1. En la **barra superior** de la interfaz, busca el **selector de tienda** (icono de edificio)
2. Haz clic para desplegar el menú
3. Selecciona la tienda deseada
4. Todos los datos de la interfaz se actualizan automáticamente para reflejar la tienda seleccionada

### Aislamiento de Datos

Cada tienda mantiene sus datos **completamente aislados**:

- **Inventario:** Stock independiente por tienda
- **Ventas:** Historial de transacciones propio
- **Cierres de caja:** Cierres independientes por tienda y turno
- **Reportes:** Métricas exclusivas de cada sucursal
- **Catálogos:** Productos disponibles pueden diferir por tienda

> **💡 Tip:** Si necesitas ver datos consolidados de todas las tiendas, usa los **reportes globales** disponibles únicamente para roles `admin`.

---

## 5. Estado de Usuarios

### Habilitar un Usuario

Un usuario habilitado puede iniciar sesión y realizar todas las operaciones permitidas por su rol.

### Deshabilitar un Usuario

1. Navega a **CONFIGURACIÓN > Administrativa > Usuarios**
2. Busca el usuario en la lista
3. Haz clic en el **toggle de estado** para deshabilitarlo
4. El usuario no podrá iniciar sesión hasta que se vuelva a habilitar

**Efectos de deshabilitar un usuario:**
- ❌ No puede iniciar sesión
- ✅ Sus transacciones anteriores se conservan
- ✅ Sus cierres de caja permanecen registrados
- ✅ Los reportes que incluyen sus operaciones siguen intactos

### Restablecer Contraseña

1. Busca el usuario en la lista de **CONFIGURACIÓN > Administrativa > Usuarios**
2. Haz clic en el icono de **restablecer contraseña**
3. Confirma la acción
4. El sistema envía una nueva contraseña temporal al correo del usuario

> **⚠️ Importante:** No se puede eliminar un usuario que tiene transacciones registradas. En su lugar, **deshabilita** la cuenta.

---

## 6. Datos por Tienda

### Inventario

- Cada tienda gestiona su propio stock de productos
- Las entradas y salidas de inventario se registran por tienda
- Los **ajustes de stock** son independientes (ruta: `/api/inventory/adjust`)
- Las transferencias entre tiendas requieren confirmación en ambos extremos

### Ventas

- Cada transacción de venta queda registrada en la tienda donde se realizó
- Los cierres de caja son por tienda y por turno
- Los recibos incluyen el nombre y logo de la tienda

### Reportes

- Los reportes operativos se generan con datos de la tienda activa
- Los administradores pueden acceder a reportes consolidados multi-tienda

### Cash Closures (Cierres de Caja)

- Cada tienda gestiona sus propios cierres de caja
- Los cierres incluyen: ventas del período, métodos de pago, diferencia de caja
- Solo los roles `admin` y `manager` pueden ejecutar cierres

---

## 7. Flujo de Trabajo Recomendado

```
1. Crear Tiendas
   └── CONFIGURACIÓN > Administrativa > Tiendas

2. Crear Roles
   └── CONFIGURACIÓN > Administrativa > Roles

3. Crear Usuarios
   └── CONFIGURACIÓN > Administrativa > Usuarios
   └── Asignar rol + tiendas

4. Configurar Inventario por Tienda
   └── INVENTARIO > Productos (en cada tienda)

5. Operar
   └── Cada usuario selecciona su tienda activa
   └── Opera con los datos de su sucursal
```

> **💡 Tip:** Al crear un nuevo usuario, asígnale primero el rol correcto y luego las tiendas específicas. Puedes modificar estas asignaciones en cualquier momento desde la pantalla de edición del usuario.
