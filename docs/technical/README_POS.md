# 🛒 POS Enterprise - Plataforma de Gestión de Tienda Online

Una aplicación web de gestión integral de inventario y ventas con diseño **Neumórfico Premium**. Sistema multi-rol, multi-tienda con trazabilidad completa de inventario.

## 🎨 Características del Diseño

### Estilo Neumórfico (Soft UI)
- ✨ Sombras duales (light/dark) para efecto 3D suave
- 🎨 Colores semánticos y tokens de diseño
- 🌓 Modo claro/oscuro con tema neumórfico en ambos
- 📱 Responsive design (mobile-first)
- ♿ Accesibilidad WCAG AA
- ⚡ Animaciones sutiles y transiciones fluidas

### Componentes Neumórficos
- **Raised Elements**: `.neu-raised` - Elementos sobresalientes
- **Inset Elements**: `.neu-inset` - Elementos hundidos/concavos
- **Inputs**: `.neu-input` - Campos de entrada estilo neumórfico
- **Buttons**: `.neu-btn` - Botones con estados hover/active
- **Cards**: `.neu-card` - Tarjetas con elevación
- **Badges**: `.neu-badge` - Etiquetas estilo pill

## 👥 Roles del Sistema

### 1. Administrador
- Gestión completa del sistema
- Administración de usuarios y tiendas
- Configuración general
- Acceso a todas las vistas

### 2. Encargado (Manager)
- Dashboard con KPIs (ventas, costo, utilidad)
- Gestión de catálogo y precios
- Historial de inventario
- Auditoría del sistema
- Cierre de caja

### 3. Cajero (Clerk)
- Punto de Venta (POS)
- Carrito de compras
- Aplicación de descuentos
- Registro de pagos (efectivo, transferencia)
- Mis ventas y resumen

### 4. Almacén (Warehouse)
- Recepción de productos
- Gestión de inventario
- Ajustes de stock
- Búsqueda y filtros avanzados
- Alertas de stock bajo

## 🔐 Cuentas de Demo

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Administrador | `admin@demo.com` | `demo123` |
| Encargado | `encargado@demo.com` | `demo123` |
| Cajero | `cajero@demo.com` | `demo123` |
| Almacén | `almacen@demo.com` | `demo123` |

## 📱 Vistas del Sistema

### Dashboard
- KPIs en tiempo real (Ventas, Costo, Utilidad)
- Gráficos de distribución por forma de pago
- Alertas de stock bajo
- Resumen de transacciones

### Punto de Venta (POS)
- Selección de productos con búsqueda
- Carrito de compras en tiempo real
- Aplicación de descuentos (porcentaje, fijo)
- Múltiples métodos de pago
- Emisión de tickets

### Inventario
- Listado de productos con tabla responsive
- Búsqueda y filtros avanzados
- Ajustes de stock (entrada/salida)
- Alertas de stock bajo
- Exportación/Importación de datos

### Recepciones
- Formulario de recepción de productos
- Registro de proveedores
- Referencia de factura
- Gestión de lotes y costos

### Mis Ventas
- Listado de transacciones
- Filtros por estado y fecha
- Vista de detalles del ticket
- Estadísticas de ventas

### Catálogo
- Búsqueda de productos
- Gestión de precios de venta
- Visualización de costos
- Actualización de datos

### Historial
- Trazabilidad completa de inventario
- Movimientos por producto
- Línea de tiempo de eventos
- Referencias a documentos

### Auditoría
- Registro de acciones críticas
- Filtros por usuario y tipo de evento
- Tablas de auditoría

### Cierre de Caja
- Declaración de cajero
- Resumen del sistema
- Consolidado por forma de pago
- Control de diferencias

### Gestión de Usuarios
- Listado de usuarios
- Asignación de roles
- Control de estado (activo/inactivo)
- Permisos por rol

### Gestión de Tiendas
- Listado de tiendas
- Información de dirección
- Control de estado
- Asignación de usuarios

### Configuración
- Modo claro/oscuro
- Notificaciones
- Preferencias del sistema

## 🎯 Funcionalidades Clave

### ✅ Tablas Responsive
Las tablas se convierten automáticamente en **tarjetas** en dispositivos móviles:

```css
/* En móvil, tabla se convierte a tarjetas */
@media (max-width: 768px) {
  .table-to-cards tbody tr {
    display: flex;
    flex-direction: column;
    background: var(--background);
    box-shadow: var(--neumorphic-shadow-out);
    border-radius: var(--radius-lg);
    margin-bottom: 1rem;
    padding: 1rem;
  }
}
```

### ✅ Estado Global con Zustand
- AuthStore: Gestión de autenticación
- CartStore: Carrito de compras en tiempo real
- UIStore: Estado de la interfaz (sidebar, dark mode)

### ✅ Diseño Neumórfico
```css
/* Efecto raised (sobresaliente) */
.neu-raised {
  background: var(--background);
  box-shadow:
    8px 8px 16px var(--shadow-dark),
    -8px -8px 16px var(--shadow-light);
  border-radius: var(--radius-lg);
}

/* Efecto inset (hundido) */
.neu-inset {
  background: var(--background);
  box-shadow:
    inset 8px 8px 16px var(--shadow-dark),
    inset -8px -8px 16px var(--shadow-light);
  border-radius: var(--radius-md);
}
```

## 🏗️ Arquitectura del Sistema

### Frontend
- **Framework**: Next.js 15 con App Router
- **Lenguaje**: TypeScript 5
- **Estilos**: Tailwind CSS + CSS personalizado
- **Estado**: Zustand (persist middleware)
- **Iconos**: Lucide React

### Estructura de Archivos
```
src/
├── app/
│   ├── login/
│   │   └── page.tsx          # Página de login
│   ├── page.tsx              # Aplicación principal
│   ├── layout.tsx            # Layout raíz
│   └── globals.css           # Estilos globales (neumórfico)
├── components/
│   └── ui/                   # Componentes shadcn/ui
├── store/
│   └── index.ts              # Zustand stores
├── types/
│   └── index.ts              # Tipos TypeScript
└── lib/
    ├── db.ts                 # Prisma client
    └── utils.ts              # Utilidades
```

## 🎨 Tokens de Diseño

### Colores Semánticos (Light Mode)
- `--background`: #e8ebf0
- `--primary`: #6366f1 (Indigo)
- `--success`: #10b981 (Emerald)
- `--warning`: #f59e0b (Amber)
- `--danger`: #ef4444 (Red)

### Sombras Neumórficas
- `--shadow-light`: Sombra clara (luz)
- `--shadow-dark`: Sombra oscura (sombra)
- Sombras duales para efecto 3D

### Tipografía
- Display: 2.5rem / 40px
- H1: 2rem / 32px
- H2: 1.5rem / 24px
- H3: 1.25rem / 20px
- Body: 1rem / 16px
- Small: 0.875rem / 14px

### Espaciado
- Sistema de 8px: 4px, 8px, 16px, 24px, 32px, 48px, 64px

### Border Radius
- sm: 4px
- md: 6px
- lg: 8px
- xl: 12px
- 2xl: 16px

## 🚀 Uso del Sistema

### 1. Iniciar Sesión
1. Ingresa a `/login`
2. Selecciona una cuenta de demo o ingresa credenciales
3. Haz clic en "Iniciar Sesión"

### 2. Navegar por Rol
El menú lateral muestra las opciones disponibles según tu rol:
- **Admin**: Todas las vistas
- **Encargado**: Dashboard, POS, Inventario, Catálogo, Historial, Auditoría, Cierre Caja, Configuración
- **Cajero**: Dashboard, POS, Mis Ventas
- **Almacén**: Inventario, Recepciones

### 3. Realizar una Venta (POS)
1. Navega a "Punto de Venta"
2. Busca productos por nombre o SKU
3. Haz clic en productos para agregar al carrito
4. Ajusta cantidades en el carrito
5. Aplica descuentos si es necesario
6. Selecciona método de pago
7. Procesa la venta

### 4. Gestionar Inventario
1. Navega a "Inventario"
2. Usa filtros para buscar productos
3. Haz clic en el icono de editar para ajustar stock
4. Ingresa cantidad y motivo del ajuste
5. Aplica el ajuste

### 5. Ver Dashboard
1. El Dashboard muestra KPIs en tiempo real
2. Revisa alertas de stock bajo
3. Analiza distribución de ventas por método de pago

## 📊 Modelos de Datos

### Usuario
```typescript
interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  store_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Producto
```typescript
interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  cost_price: number;
  stock_current: number;
  category: string | null;
  supplier: string | null;
  image_url: string | null;
  // ...
}
```

### Transacción
```typescript
interface Transaction {
  id: string;
  store_id: string;
  seller_id: string;
  total_amount: number;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  discount_type: DiscountType;
  discount_value: number;
  // ...
}
```

## 🔧 Comandos Disponibles

```bash
# Instalar dependencias
bun install

# Ejecutar desarrollo
bun run dev

# Build de producción
bun run build

# Lint
bun run lint

# Push de schema de DB
bun run db:push

# Migraciones
bun run db:migrate
```

## 🎓 Mejoras Implementadas

1. **Sistema de Diseño Neumórfico Completo**
   - Tokens CSS para efectos 3D
   - Sombras duales (light/dark)
   - Modo claro/oscuro con neumorfismo
   - Componentes reutilizables

2. **Responsive Design Avanzado**
   - Tablas que se convierten a tarjetas en móvil
   - Sidebar con drawer en móvil
   - Grid responsive para tarjetas
   - Touch targets de 44px+

3. **Gestión de Estado con Zustand**
   - AuthStore con persistencia
   - CartStore para POS en tiempo real
   - UIStore para preferencias

4. **Tipado TypeScript Completo**
   - Todos los modelos de datos tipados
   - Enums para roles, estados, métodos de pago
   - Interfaces para todos los componentes

5. **Seguridad y Permisos**
   - Matriz de permisos por rol
   - Validación de acceso por vista
   - Control de acciones críticas

## 📝 Notas para el Futuro

### Backend (Por Implementar)
- API Routes con Supabase
- Autenticación real con NextAuth
- CRUD completo de datos
- Reportes y exportaciones

### Funcionalidades Adicionales
- Integración con pasarelas de pago
- Impresión de tickets
- Exportación a PDF/Excel
- Notificaciones en tiempo real
- Gráficos más avanzados

## 🤝 Contribución

Este es un sistema de demostración. Para producción:
1. Implementar backend con Supabase
2. Agregar autenticación real
3. Implementar CRUD de datos
4. Agregar tests automatizados
5. Optimizar para producción

## 📄 Licencia

MIT License - Uso libre para fines educativos y comerciales

---

**Desarrollado con Next.js 15, TypeScript, Tailwind CSS y Zustand**

*Diseño Neumórfico Premium 10/10* 🚀
