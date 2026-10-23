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

![Vista de Gestión de Tiendas con las tarjetas de sucursales activas y sus indicadores](/help/capturas/gestion-tiendas.webp "Figura 1. Gestión de Tiendas — sucursales activas con indicadores y link público")

### Pasos para Crear una Tienda

1. Navega a **OPERACIÓN > Gestión de Tiendas**
2. Haz clic en **Nueva Sucursal**
3. En el modal **Nueva Tienda**, completa los dos campos iniciales:

| Campo | Descripción | Obligatorio |
|-------|-------------|:-----------:|
| **Nombre de la Tienda** | Nombre comercial de la tienda (ej. `Sucursal Centro`) | ✅ |
| **URL pública (slug)** | Identificador de la tienda para la vitrina pública (se propone automáticamente a partir del nombre) | ✅ |

4. Haz clic en **Crear Tienda**
5. Completa después los detalles desde **Configuración de Tienda**: nombre, **Dirección**, **Teléfono**, **Email** y **Logo**

> **💡 Tip:** Puedes asignar un logo diferente para cada tienda desde su configuración. El nombre de la tienda aparece en los recibos emitidos desde esa sucursal.

### Editar una Tienda Existente

1. Navega a **OPERACIÓN > Gestión de Tiendas**
2. Selecciona la tienda de la lista y abre su **Configuración de Tienda**
3. Modifica los campos necesarios
4. Haz clic en **Guardar Cambios**

---

## 2. Gestión de Usuarios

### Crear un Nuevo Usuario

1. Navega a **SISTEMA > Usuarios**
2. Haz clic en **Nuevo Usuario**
3. Completa los datos del usuario:

| Campo | Descripción |
|-------|-------------|
| **Nombre completo** | Nombre y apellido del usuario |
| **Correo electrónico** | Email que usará para iniciar sesión |
| **Asignar Contraseña (Opcional)** | Si la dejas vacía, el usuario define su contraseña con el correo de recuperación |
| **Rol** | Rol asignado (ver sección de Roles abajo) |
| **Tiendas asignadas** | Sucursales a las que tiene acceso |

4. Haz clic en **Crear Usuario**

> **⚠️ Importante:** Un usuario puede tener acceso a **múltiples tiendas**. Los datos que ve en cada momento dependen de la tienda activa seleccionada en la barra superior.

### Operaciones sobre Usuarios

| Acción | Descripción | Cómo hacerlo |
|--------|-------------|--------------|
| **Editar perfil** | Modificar nombre, email, rol | Seleccionar usuario > Editar |
| **Habilitar/Deshabilitar** | Activar o desactivar cuenta sin eliminarla | Toggle en la columna de estado |
| **Restablecer contraseña** | Enviar enlace de recuperación o definir una nueva | Menú del usuario > **Enviar correo de recuperación** / **Cambiar contraseña** |
| **Eliminar** | Retirar la cuenta del acceso activo | Botón de eliminar (solo si no tiene membresías activas en tiendas) |

### Restablecer Contraseña

1. En la lista de usuarios, abre el menú de acciones del usuario
2. Usa **Enviar correo de recuperación**: el sistema envía al correo del usuario un enlace para que defina su propia contraseña
3. También puedes usar **Cambiar contraseña** para definirla directamente como administrador

> **⚠️ Nota:** Los usuarios deshabilitados no pueden iniciar sesión, pero sus datos históricos (ventas, movimientos) se conservan en el sistema.

---

## 3. Gestión de Roles

Los roles definen los permisos y funcionalidades a las que un usuario tiene acceso dentro de CostPro.

### Roles Disponibles

| Rol | Descripción | Permisos principales |
|-----|-------------|---------------------|
| **admin** | Administrador total del sistema | Acceso completo a todos los módulos, configuración, usuarios, tiendas, reportes, costos |
| **manager** | Gerente de tienda | Gestión de la tienda asignada: ventas, inventario, cierres de caja, reportes locales |
| **encargado** | Encargado de operaciones | Ventas, gestión de inventario (recepciones, ajustes), cierres de caja, Costo de su tienda |
| **clerk** | Cajero / Vendedor | Registro de ventas, consulta de precios, emisión de recibos |
| **warehouse** | Responsable de almacén | Gestión de inventario: entradas (recepciones), salidas, transferencias y consultas de stock |
| **costo** | Especialista de costos | Fichas de costo y operaciones del dominio Costo |
| **usuario** | Usuario básico | Acceso básico de ventas: POS, Caja y Vales de Salida de su tienda |

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
└── ❌ CONFIGURACIÓN SISTEMA, Usuarios y Roles

encargado
├── ✅ REGISTRO DE VENTAS
├── ✅ INVENTARIO de su tienda (recepciones, ajustes, consultas)
├── ✅ CIERRES DE CAJA
├── ✅ COSTO de su tienda
└── ❌ CONFIGURACIÓN SISTEMA, Usuarios y Roles

clerk
├── ✅ REGISTRO DE VENTAS
├── ✅ CONSULTA DE PRECIOS
├── ✅ EMISIÓN DE RECIBOS
└── ❌ CONFIGURACIÓN, COSTOS, IPV, INVENTARIO

warehouse
├── ✅ INVENTARIO (completo en su tienda)
│   ├── Entradas (recepciones), Salidas, Transferencias
│   └── Consultas de stock
└── ❌ VENTAS, CONFIGURACIÓN, COSTOS, IPV, AJUSTES DOCUMENTALES

usuario
├── ✅ POS, CAJA Y VALES DE SALIDA (básico)
└── ❌ Todo lo demás
```

### Crear y Editar Roles

1. Navega a **SISTEMA > Roles**
2. Haz clic en **Nuevo Rol** o selecciona uno existente para editar
3. Configura los permisos marcando/desmarcando las casillas por módulo
4. Haz clic en **Crear Rol** (o **Guardar Cambios** si editas)

> **⚠️ Importante:** No se puede eliminar un rol que está siendo utilizado por uno o más usuarios (revoca o reasigna esas membresías primero). Los roles sin uso sí pueden eliminarse.

---

## 4. Cambiar de Tienda Activa

Cuando un usuario tiene acceso a múltiples tiendas, puede cambiar la tienda activa para ver y operar con los datos de cada sucursal.

### Selector de Tienda

1. En la **barra superior** de la interfaz, busca el **selector de tienda** (icono de edificio)
2. Haz clic para desplegar el menú
3. Selecciona la tienda deseada
4. Todos los datos de la interfaz se actualizan automáticamente para reflejar la tienda seleccionada

![Selector de tienda desplegado con el buscador y la lista de sucursales accesibles](/help/capturas/selector-tienda.webp "Figura 2. Selector de Tienda — cambio de tienda activa")

### Aislamiento de Datos

Cada tienda mantiene sus datos **completamente aislados**:

- **Inventario:** Stock independiente por tienda
- **Ventas:** Historial de transacciones propio
- **Cierres de caja:** Cierres independientes por tienda y turno
- **Reportes:** Métricas exclusivas de cada sucursal
- **Catálogos:** Productos disponibles pueden diferir por tienda

> **💡 Tip:** Si necesitas ver datos consolidados de varias tiendas, usa el tablero consolidado del hub **Gestión de Tiendas** (accesible a admin, manager y encargado) o el **Generador de Reportes** (roles admin y manager).

---

## 5. Estado de Usuarios

### Habilitar un Usuario

Un usuario habilitado puede iniciar sesión y realizar todas las operaciones permitidas por su rol.

### Deshabilitar un Usuario

1. Navega a **SISTEMA > Usuarios**
2. Busca el usuario en la lista
3. Haz clic en el **toggle de estado** para deshabilitarlo
4. El usuario no podrá iniciar sesión hasta que se vuelva a habilitar

**Efectos de deshabilitar un usuario:**
- ❌ No puede iniciar sesión
- ✅ Sus transacciones anteriores se conservan
- ✅ Sus cierres de caja permanecen registrados
- ✅ Los reportes que incluyen sus operaciones siguen intactos

### Restablecer Contraseña

1. Busca el usuario en la lista de **SISTEMA > Usuarios**
2. Abre el menú de acciones y usa **Enviar correo de recuperación**
3. Confirma la acción
4. El usuario recibe un enlace por correo para definir su propia contraseña; como alternativa, usa **Cambiar contraseña** para definirla directamente

> **⚠️ Importante:** No se puede eliminar un usuario con membresías activas en tiendas. Retira primero sus membresías o, si prefieres conservar su historial, **deshabilita** la cuenta.

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
- Los recibos incluyen el nombre de la tienda

### Reportes

- Los reportes operativos se generan con datos de la tienda activa
- El consolidado multi-tienda está en el tablero del hub **Gestión de Tiendas** (no en el Generador de Reportes, que es por tienda)

### Cash Closures (Cierres de Caja)

- Cada tienda gestiona sus propios cierres de caja
- Los cierres incluyen: ventas del período, métodos de pago, diferencia de caja
- Los roles `admin`, `manager` y `encargado` pueden ejecutar cierres

---

## 7. Flujo de Trabajo Recomendado

```
1. Crear Tiendas
   └── OPERACIÓN > Gestión de Tiendas

2. Crear Roles
   └── SISTEMA > Roles

3. Crear Usuarios
   └── SISTEMA > Usuarios
   └── Asignar rol + tiendas

4. Configurar Inventario por Tienda
   └── OPERACIÓN > Almacén > Inventario (en cada tienda)

5. Operar
   └── Cada usuario selecciona su tienda activa
   └── Opera con los datos de su sucursal
```

> **💡 Tip:** Al crear un nuevo usuario, asígnale primero el rol correcto y luego las tiendas específicas. Puedes modificar estas asignaciones en cualquier momento desde la pantalla de edición del usuario.
