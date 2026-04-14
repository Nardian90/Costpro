# Tutorial: Gestión Completa de Inventario

Este tutorial cubre el ciclo completo de gestión de inventario en CostPro, desde la creación de productos en el catálogo hasta las operaciones logísticas de recepción, transferencia y auditoría. Aprenderás a mantener un inventario preciso y trazable en todas tus tiendas.

---

## 1. Acceder a la Gestión de Inventario

El módulo de inventario se organiza dentro de la sección multi-tienda:

1. Abre el **menú lateral** de navegación
2. Despliega la sección **MULTI-TIENDA**
3. Selecciona **Gestión Inventario**

Dentro de este módulo encontrarás los siguientes sub-módulos:

| Sub-módulo | Función principal |
|------------|-------------------|
| **Catálogo Maestro** | Crear, editar y gestionar todos los productos |
| **Stock Actual** | Consultar niveles de inventario en tiempo real |
| **Trazabilidad Stock** | Historial completo de movimientos de inventario |
| **Ajustes Documentales** | Correcciones manuales con registro de auditoría |

> 💡 **Tip**: Utiliza la paleta de comandos (`Ctrl+K`) para acceder rápidamente a cualquiera de estos sub-módulos sin necesidad de navegar por el menú.

---

## 2. Catálogo Maestro

El Catálogo Maestro es el registro central de todos los productos del sistema. Aquí se definen las propiedades que se utilizan en todo CostPro: ventas, compras, costos y reportes.

### 2.1 Crear un Nuevo Producto

1. Navega a **Catálogo Maestro** dentro de Gestión Inventario
2. Haz clic en el botón **"Nuevo Producto"**
3. Completa los campos del formulario:

#### Campos obligatorios

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Nombre del producto** | Descripción completa del artículo | `Camiseta Algodón Premium` |
| **SKU** | Código interno único del producto | `CAM-ALG-PRE-001` |
| **Código de barras** | Código EAN-13, UPC o personalizado | `7501234567890` |
| **Categoría** | Clasificación del producto | `Ropa > Camisetas` |
| **Precio de venta** | Precio al público (con impuestos) | `$ 25.00` |
| **Costo base** | Costo de adquisición o producción | `$ 12.00` |
| **Stock inicial** | Cantidad disponible al crear el producto | `100` |

#### Campos adicionales recomendados

- **Unidad de medida**: pieza, kilo, litro, metro, etc.
- **Stock mínimo**: umbral para alertas de reabastecimiento
- **Proveedor principal**: proveedor predeterminado para reórdenes
- **Descripción extendida**: detalles adicionales del producto

> ⚠️ **Importante**: El **SKU debe ser único** en todo el sistema. Si intentas usar un SKU duplicado, CostPro mostrará un error de validación. Planifica una convención de nomenclatura antes de crear productos en masa.

### 2.2 Editar un Producto Existente

1. Busca el producto usando la barra de búsqueda (por nombre o SKU)
2. Haz clic sobre el producto para abrir su **ficha de detalle**
3. Modifica los campos necesarios
4. Haz clic en **"Guardar"** para aplicar los cambios

Los cambios se reflejan inmediatamente en:

- El catálogo visible desde el POS
- Los cálculos de costo que referencien este producto
- Los reportes y dashboards

### 2.3 Generación de Código de Barras

CostPro permite generar códigos de barras directamente desde la ficha del producto:

1. Abre la ficha del producto
2. Haz clic en **"Generar Código de Barras"**
3. Selecciona el formato (EAN-13, Code 128, etc.)
4. El sistema genera el código y lo asocia al producto
5. Puedes **imprimir etiquetas** con el código de barras para pegar en los productos

> 💡 **Tip**: Si trabajas con productos que no tienen código de barras de fábrica, genera códigos internos con el prefijo de tu empresa para mantener trazabilidad completa.

---

## 3. Monitoreo de Stock

### 3.1 Stock Actual

Navega a **Gestión Inventario > Stock Actual** para consultar los niveles de inventario:

- **Vista de lista**: tabla con todos los productos y sus cantidades por tienda
- **Vista de tarjetas**: representación visual con indicadores de color
- **Filtros**: por tienda, categoría, nivel de stock

#### Indicadores de estado

| Color | Significado | Acción sugerida |
|-------|-------------|-----------------|
| 🟢 **Verde** | Stock saludable (por encima del mínimo) | Mantener monitoreo normal |
| 🟡 **Amarillo** | Stock bajo (cerca del mínimo) | Considerar reabastecimiento |
| 🔴 **Rojo** | Stock crítico (en o por debajo del mínimo) | Reabastecer inmediatamente |

### 3.2 Alertas de Stock Mínimo

El sistema genera alertas automáticas cuando un producto alcanza su **stock mínimo** configurado:

- Las alertas aparecen en el **panel de notificaciones**
- Puedes ver todas las alertas agrupadas en la vista de Stock Actual
- Configura el stock mínimo por producto en el Catálogo Maestro

> 💡 **Tip**: Revisa las alertas de stock al inicio de cada turno para planificar reabastecimientos y evitar quiebres de inventario durante el día de ventas.

### 3.3 Trazabilidad de Stock (Historial de Movimientos)

Navega a **Gestión Inventario > Trazabilidad Stock** para ver el registro completo de todos los movimientos:

Cada movimiento registrado incluye:

- **Tipo de movimiento**: venta, recepción, transferencia, ajuste, conteo
- **Producto** afectado
- **Cantidad** (positiva o negativa)
- **Tienda** de origen y destino (para transferencias)
- **Fecha y hora** exacta
- **Usuario** que realizó la operación
- **Motivo / referencia** (para ajustes y transferencias)

```
Fecha               | Tipo          | Producto              | Cant. | Tienda       | Usuario
─────────────────────|───────────────|───────────────────────|───────|--------------|──────────
2024-01-15 09:32    | Venta POS     | Camiseta Algodón      |  -2   | Tienda Centro| Ana López
2024-01-15 10:15    | Recepción     | Camiseta Algodón      | +50   | Tienda Centro| Carlos Ruiz
2024-01-15 11:00    | Transferencia | Camiseta Algodón      | -10   | Tienda Centro| Ana López
2024-01-15 11:00    | Transferencia | Camiseta Algodón      | +10   | Tienda Norte | —
```

---

## 4. Recepciones (Ingreso de Mercancía)

Las recepciones permiten registrar la entrada de mercancía desde proveedores al inventario de tu tienda.

### 4.1 Ruta de Navegación

```
MULTI-TIENDA > Logística > Nueva Recepción
```

### 4.2 Proceso de Recepción Paso a Paso

#### Paso 1: Seleccionar el Proveedor

1. Haz clic en **"Nueva Recepción"**
2. Selecciona el **proveedor** de la lista desplegable
3. Verifica que los datos del proveedor sean correctos

#### Paso 2: Registrar los Productos

Para cada producto recibido:

1. Busca el producto por nombre o SKU en el catálogo
2. Ingresa la **cantidad recibida**
3. Verifica que coincida con la **guía de remisión** o factura del proveedor
4. Agrega todos los productos de la recepción

> 💡 **Tip**: Si un producto no existe en el catálogo, puedes crearlo directamente desde la pantalla de recepción usando la opción "Producto nuevo" sin necesidad de cambiar de pantalla.

#### Paso 3: Confirmar la Recepción

1. Revisa el resumen de todos los productos y cantidades
2. Haz clic en **"Confirmar Recepción"**
3. El sistema actualiza automáticamente el stock de la tienda
4. Se genera un **registro de recepción** con número y fecha

### 4.3 Historial de Recepciones

Consulta todas las recepciones anteriores en:

```
MULTI-TIENDA > Logística > Historial de Recepciones
```

Filtra por proveedor, fecha o estado para encontrar recepciones específicas.

---

## 5. Transferencias de Stock

Las transferencias permiten mover inventario entre tiendas, manteniendo la trazabilidad completa del movimiento.

### 5.1 Ruta de Navegación

```
MULTI-TIENDA > Logística > Transferencia Stock
```

### 5.2 Flujo de Transferencia

Las transferencias en CostPro funcionan con un **flujo de confirmación en dos pasos** para garantizar la precisión:

#### Paso 1: Crear la Transferencia (Tienda Origen)

1. Selecciona la **tienda de origen** (donde sale la mercancía)
2. Selecciona la **tienda de destino** (donde llega la mercancía)
3. Agrega los **productos** y las cantidades a transferir
4. El sistema verifica que haya stock suficiente en la tienda de origen
5. Haz clic en **"Crear Transferencia"**

```
Estado: 📤 ENVIADA (pendiente de confirmación por tienda destino)
```

#### Paso 2: Confirmar la Recepción (Tienda Destino)

1. El operador de la **tienda destino** recibe la notificación
2. Navega a **Transferencias > Pendientes**
3. Verifica físicamente que los productos y cantidades coincidan
4. Haz clic en **"Confirmar Recepción"**

```
Estado: ✅ COMPLETADA (stock actualizado en ambas tiendas)
```

### 5.3 Manejo de Discrepancias

Si la cantidad recibida no coincide con la enviada:

- Registra la **cantidad real recibida** al confirmar
- El sistema genera automáticamente un **ajuste** en la tienda destino
- La discrepancia queda registrada con un motivo en el historial

> ⚠️ **Importante**: Nunca confirmes una transferencia sin verificar físicamente la mercancía. Las discrepancias no verificadas pueden causar errores de inventario que se propagan a ventas y reportes financieros.

---

## 6. Ajustes Documentales

Los ajustes documentales permiten corregir manualmente las cantidades de inventario cuando hay diferencias entre el stock del sistema y el stock físico.

### 6.1 ¿Cuándo Usar Ajustes Documentales?

Utiliza ajustes documentales en estas situaciones:

- **Mercancía dañada** que no puede venderse
- **Pérdida o robo** de productos
- **Errores de registro** en recepciones o ventas anteriores
- **Muestras gratuitas** entregadas a clientes
- **Devoluciones de clientes** que no pasan por el POS
- **Ajustes por caducidad** de productos perecederos

### 6.2 Proceso de Ajuste

1. Navega a **Gestión Inventario > Ajustes Documentales**
2. Haz clic en **"Nuevo Ajuste"**
3. Selecciona el **producto** a ajustar
4. Ingresa la **nueva cantidad correcta** (no la diferencia)
5. El sistema calcula automáticamente la **diferencia** (positiva o negativa)
6. **Selecciona un motivo de auditoría** (campo obligatorio):

| Motivo | Descripción |
|--------|-------------|
| `DAÑO` | Producto dañado o inservible |
| `PERDIDA` | Pérdida o extravío |
| `ERROR_REGISTRO` | Error en registro anterior |
| `MUESTRA` | Muestra gratuita |
| `DEVOLUCION` | Devolución de cliente |
| `CADUCIDAD` | Producto vencido |
| `OTRO` | Otro motivo (requiere descripción) |

7. Agrega una **descripción adicional** si es necesario
8. Confirma el ajuste

> ⚠️ **Importante**: Todos los ajustes documentales quedan registrados permanentemente en el **log de auditoría**. Este registro es inmutable y puede ser consultado en cualquier momento por supervisores o auditores.

---

## 7. Auditoría de Conteo

La auditoría de conteo permite verificar físicamente el inventario y detectar discrepancias entre el stock del sistema y el stock real.

### 7.1 Ruta de Navegación

```
MULTI-TIENDA > Logística > Auditoría Conteo
```

### 7.2 Proceso de Auditoría Paso a Paso

#### Paso 1: Crear una Nueva Auditoría

1. Haz clic en **"Nueva Auditoría"**
2. Selecciona la **tienda** a auditar
3. Define el **alcance**:
   - **Conteo total**: todos los productos del inventario
   - **Por categoría**: solo productos de ciertas categorías
   - **Por producto**: productos seleccionados individualmente
4. Inicia la auditoría

#### Paso 2: Registrar los Conteos Físicos

Para cada producto incluido en la auditoría:

1. El sistema muestra el **stock registrado** (lo que dice el sistema)
2. Ingresa el **stock físico** (lo que cuentas en la estantería)
3. El sistema marca automáticamente si hay **discrepancia**:

```
Producto              | Stock Sistema | Stock Físico | Discrepancia
──────────────────────|---------------|--------------|─────────────
Camiseta Algodón      |      50       |      48      |    -2 ⚠️
Pantalón Jean         |      30       |      30      |     0 ✅
Zapatos Cuero         |      15       |      12      |    -3 ⚠️
```

#### Paso 3: Revisar y Confirmar

1. Revisa el reporte de discrepancias generado por el sistema
2. Para cada discrepancia, **investiga la causa** y selecciona un motivo
3. Haz clic en **"Confirmar Auditoría"**

#### Paso 4: Aplicar Ajustes (Opcional)

Si detectas discrepancias, puedes:

- **Aplicar ajustes automáticos**: el sistema corrige el stock al valor físico
- **Generar ajustes documentales**: crea ajustes individuales con motivos de auditoría
- **No aplicar cambios**: solo registrar las discrepancias para investigación posterior

> 💡 **Tip**: Programa auditorías de conteo de forma periódica (semanal o mensual) para mantener la precisión del inventario. Las discrepancias frecuentes en un producto pueden indicar problemas de proceso (errores en el POS, recepciones incorrectas, etc.).

---

## Tabla de Rutas de Navegación

| Función | Ruta en el menú |
|---------|-----------------|
| Catálogo de productos | `MULTI-TIENDA > Gestión Inventario > Catálogo Maestro` |
| Niveles de stock | `MULTI-TIENDA > Gestión Inventario > Stock Actual` |
| Historial de movimientos | `MULTI-TIENDA > Gestión Inventario > Trazabilidad Stock` |
| Ajustes manuales | `MULTI-TIENDA > Gestión Inventario > Ajustes Documentales` |
| Nueva recepción | `MULTI-TIENDA > Logística > Nueva Recepción` |
| Historial de recepciones | `MULTI-TIENDA > Logística > Historial de Recepciones` |
| Nueva transferencia | `MULTI-TIENDA > Logística > Transferencia Stock` |
| Auditoría de conteo | `MULTI-TIENDA > Logística > Auditoría Conteo` |
| Punto de venta | `MULTI-TIENDA > Punto de Venta > Terminal de Venta` |
| Historial de ventas | `MULTI-TIENDA > Punto de Venta > Historial de Ventas` |
| Cierre de caja | `MULTI-TIENDA > Punto de Venta > Arqueo de Caja` |

---

## Buenas Prácticas de Gestión de Inventario

> **📋 Convención de SKUs**: Define una convención de nomenclatura clara y consistente para los SKU. Por ejemplo: `[CATEGORÍA]-[SUBCATEGORÍA]-[CORRELATIVO]`. Esto facilita la búsqueda y evita duplicados.
>
> **📦 Recepciones inmediatas**: Registra las recepciones de mercancía **inmediatamente** al recibir los productos. No dejes mercancía sin registrar, ya que esto genera diferencias entre el stock físico y el del sistema.
>
> **🔄 Transferencias verificadas**: Siempre confirma las transferencias en la tienda destino **verificando físicamente** la mercancía. No confíes solo en la documentación.
>
> **📊 Stock mínimo realista**: Configura el stock mínimo basándote en el **historial de ventas** y el **tiempo de reposición** de cada producto, no en estimaciones arbitrarias.
>
> **🔍 Auditorías regulares**: Programa auditorías de conteo al menos una vez al mes. Las tiendas con alto volumen deberían realizar conteos semanales de las categorías de mayor rotación.
>
> **📝 Motivos claros en ajustes**: Siempre escribe descripciones claras y detalladas en los ajustes documentales. "Error" no es suficiente — indica qué error ocurrió y cómo se detectó.
>
> **🚨 Alertas proactivas**: Revisa las alertas de stock al inicio de cada turno y toma acción inmediata sobre los productos en nivel rojo. Un quiebre de stock significa una venta perdida.
>
> **🧹 Productos inactivos**: Revisa periódicamente el catálogo para identificar productos sin movimiento. Considera darlos de baja o hacer promociones para reducir inventario estancado.
