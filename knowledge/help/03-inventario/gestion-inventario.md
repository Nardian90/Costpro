# Tutorial: Gestión Completa de Inventario

Este tutorial cubre el ciclo completo de gestión de inventario en CostPro, desde la creación de productos en el catálogo hasta las operaciones logísticas de recepción, transferencia y auditoría. Aprenderás a mantener un inventario preciso y trazable en todas tus tiendas.

## Contenido

- [1. Acceder a la Gestión de Inventario](#1-acceder-a-la-gestión-de-inventario)
- [2. Catálogo Maestro](#2-catálogo-maestro)
  - [2.1 Crear un Nuevo Producto](#21-crear-un-nuevo-producto)
  - [2.2 Editar un Producto Existente](#22-editar-un-producto-existente)
  - [2.3 Generación de Código de Barras](#23-generación-de-código-de-barras)
- [3. Monitoreo de Stock](#3-monitoreo-de-stock)
  - [3.1 Stock Actual](#31-stock-actual)
  - [3.2 Alertas de Stock Mínimo](#32-alertas-de-stock-mínimo)
  - [3.3 Trazabilidad de Stock (Historial de Movimientos)](#33-trazabilidad-de-stock-historial-de-movimientos)
- [4. Recepciones (Ingreso de Mercancía)](#4-recepciones-ingreso-de-mercancía)
  - [4.1 Ruta de Navegación](#41-ruta-de-navegación)
  - [4.2 Proceso de Recepción Paso a Paso](#42-proceso-de-recepción-paso-a-paso)
  - [4.3 Historial de Recepciones](#43-historial-de-recepciones)
- [5. Transferencias de Stock](#5-transferencias-de-stock)
  - [5.1 Ruta de Navegación](#51-ruta-de-navegación)
  - [5.2 Flujo de Transferencia](#52-flujo-de-transferencia)
  - [5.3 Manejo de Discrepancias](#53-manejo-de-discrepancias)
- [6. Ajustes Documentales](#6-ajustes-documentales)
  - [6.1 ¿Cuándo Usar Ajustes Documentales?](#61-cuándo-usar-ajustes-documentales)
  - [6.2 Proceso de Ajuste](#62-proceso-de-ajuste)
- [7. Inventario Físico](#7-inventario-físico)
  - [7.1 Ruta de Navegación](#71-ruta-de-navegación)
  - [7.2 Proceso Paso a Paso](#72-proceso-paso-a-paso)
- [8. Tabla de Rutas de Navegación](#8-tabla-de-rutas-de-navegación)
- [9. Buenas Prácticas de Gestión de Inventario](#9-buenas-prácticas-de-gestión-de-inventario)

---

## 1. Acceder a la Gestión de Inventario

El módulo de inventario vive en la sección **Operación**:

1. Abre el **menú lateral** de navegación
2. Entra en la sección **Operación**
3. Selecciona **Almacén** y luego **Inventario**

Dentro de este módulo encontrarás los siguientes sub-módulos:

![Vista de Inventario con el control de existencias y niveles de stock por producto](/help/capturas/inventario-stock.webp "Figura 1. Inventario — stock actual por producto en tiempo real")

| Sub-módulo | Función principal |
|------------|-------------------|
| **Catálogo** (pestaña) | Crear, editar y gestionar todos los productos |
| **Stock Actual** (pestaña) | Consultar niveles de inventario en tiempo real |
| **Trazabilidad** (pestaña) | Historial completo de movimientos de inventario |
| **Ajustes Documentales** (módulo aparte) | Correcciones documentales con registro de auditoría |
| **Inventario Físico** (módulo aparte) | Conteos formales con corte, conciliación y ajustes generados |

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
| **Categoría** | Clasificación del producto | `Ropa > Camisetas` |
| **Precio de venta** | Precio al público | `$ 25.00` |
| **Costo base** | Costo de adquisición o producción | `$ 12.00` |
| **Stock inicial** | Cantidad disponible al crear el producto | `100` |

El **código de barras** es opcional: si el producto no trae código, el sistema puede generar uno automáticamente (EAN-13) a partir del SKU.

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

#### Eliminación de Productos

Cuando un producto ya no forma parte de tu inventario activo, puedes eliminarlo del catálogo. Sin embargo, dado que la eliminación es una operación permanente, CostPro implementa **confirmaciones de seguridad** para evitar eliminaciones accidentales:

1. Desde la ficha del producto, haz clic en **"Eliminar"**
2. El sistema despliega un **modal de confirmación** con:
   - Nombre y SKU del producto a eliminar
   - Advertencia sobre la permanencia de la operación
   - Información sobre transacciones asociadas (ventas, recepciones, transferencias)
3. Selecciona **"Confirmar Eliminación"** para proceder

> ⚠️ **Importante**: La eliminación de un producto del catálogo no elimina los registros históricos de ventas, recepciones ni movimientos asociados a ese producto. Estos registros permanecen en el sistema para mantener la integridad del historial. Sin embargo, el producto ya no estará disponible para nuevas ventas, recepciones ni transferencias.

> 💡 **Tip**: Si no estás seguro de eliminar un producto permanentemente, considera desactivarlo o cambiarle de categoría en lugar de eliminarlo. Algunas empresas utilizan una categoría "Inactivo" para gestionar productos temporalmente fuera de circulación.

### 2.3 Generación de Código de Barras

CostPro genera códigos de barras automáticamente desde la ficha del producto:

1. Abre la ficha del producto
2. Si el producto no tiene código, usa la opción de **generación automática**: el sistema crea un **EAN-13** a partir del SKU
3. El código queda asociado al producto
4. Puedes **imprimir etiquetas** con el código de barras para pegar en los productos

No se elige el formato: si el código del producto tiene 13 dígitos se imprime como EAN-13; en cualquier otro caso se imprime como Code 128.

#### Sección Etiquetas y Códigos

La sección **Etiquetas y Códigos** es una entrada propia del menú Almacén (Operación → Almacén → Etiquetas y Códigos). Imprime **4 etiquetas por página** en formato carta, cada una con **nombre, precio y código de barras**, con cantidad por producto y modo repetición (un producto en las 4 etiquetas de la hoja).

> 💡 **Tip**: Si trabajas con productos que no tienen código de barras de fábrica, genera códigos internos con el prefijo de tu empresa para mantener trazabilidad completa. Utiliza la sección de Etiquetas y Códigos para imprimir lotes de etiquetas de forma eficiente.

### 2.4 Importación Masiva CSV

Cuando necesitas incorporar una gran cantidad de productos al catálogo, CostPro permite la **importación masiva desde archivos CSV** sin necesidad de crear cada producto de forma individual.

Para importar productos desde CSV:

1. Navega a **Catálogo Maestro** dentro de Gestión Inventario
2. Haz clic en el botón **"Importar CSV"**
3. Descarga la **plantilla CSV** proporcionada por el sistema para asegurar el formato correcto
4. Completa la plantilla con los datos de tus productos respetando las columnas requeridas
5. Carga el archivo CSV completado
6. El sistema realiza una **validación previa** donde verifica:
   - Formato de campos y tipos de datos
   - SKUs únicos (detecta duplicados dentro del archivo y contra el catálogo existente)
   - Categorías y proveedores existentes
7. Revisa el reporte de validación y corrige los errores si los hay
8. Confirma la importación

> ⚠️ **Importante**: La plantilla CSV incluye columnas obligatorias (nombre, SKU, precio de venta, costo base) y columnas opcionales (código de barras, categoría, unidad de medida, stock mínimo, etc.). No modifiques los encabezados de la plantilla, ya que el sistema los utiliza para mapear los datos automáticamente.

### 2.5 Incremento Masivo de Precios

Cuando necesitas ajustar los precios de múltiples productos simultáneamente, CostPro ofrece la funcionalidad de **Incremento Masivo de Precios**, accesible desde el Catálogo Maestro.

Para aplicar un incremento masivo:

1. Navega a **Catálogo Maestro** dentro de Gestión Inventario
2. Haz clic en el botón **"Incremento Masivo"**
3. Selecciona los productos a los que deseas aplicar el ajuste:
   - **Por categoría**: selecciona una o más categorías completas
   - **Por selección individual**: marca los productos específicos desde el listado
   - **Por rango de precios**: filtra productos dentro de un rango de costo o precio determinado
   - **Seleccionar todos**: aplica a todo el catálogo
4. Define el tipo de ajuste:
   - **Porcentaje**: incrementa o decrementa el precio en un porcentaje (ej. +5%, -3%)
   - **Monto fijo**: suma o resta una cantidad específica al precio actual (ej. +$10.00, -$5.00)
5. El sistema muestra una **vista previa** con el precio actual y el nuevo precio para cada producto afectado
6. Revisa los cambios y confirma la aplicación

> ⚠️ **Importante**: El incremento masivo de precios es una operación irreversible. Antes de confirmar, verifica cuidadosamente la vista previa para asegurarte de que los nuevos precios sean correctos. Se recomienda exportar el catálogo antes de aplicar cambios masivos como respaldo.

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

#### Análisis ABC

Dentro de la vista de Stock Actual, CostPro ofrece el **Análisis ABC**, una herramienta de clasificación que permite priorizar la gestión de inventario según el valor y la rotación de los productos. Al acceder a esta funcionalidad se despliega un **modal de Análisis ABC** que clasifica automáticamente el inventario en tres categorías:

| Categoría | Descripción | Características | Política de gestión sugerida |
|-----------|-------------|-----------------|-------------------------------|
| **A** | Alto valor, pocos artículos | Representan aprox. 80% del valor total del inventario con solo 20% de los productos | Control estricto, monitoreo diario, reabastecimiento prioritario |
| **B** | Valor medio, cantidad media | Representan aprox. 15% del valor con 30% de los productos | Control moderado, revisión semanal, reorden periódico |
| **C** | Bajo valor, muchos artículos | Representan aprox. 5% del valor con 50% de los productos | Control básico, revisión mensual, compras en volumen |

El análisis se calcula con base en el **valor del inventario** (costo unitario × cantidad en stock) y puede filtrarse por tienda y categoría. Utiliza esta clasificación para enfocar tus esfuerzos de gestión en los productos de mayor impacto financiero.

> 💡 **Tip**: Revisa el Análisis ABC al menos una vez al mes. Los cambios en la demanda pueden hacer que productos de categoría C suban a A, requiriendo un ajuste en tu estrategia de compras y almacenamiento.

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

#### Kardex (Libro de Movimientos)

Desde la vista de Stock Actual o Trazabilidad Stock, puedes acceder al **Kardex** de un producto específico. El Kardex es un **modal que muestra el libro mayor de movimientos** de ese producto de forma cronológica, incluyendo los saldos acumulados después de cada operación.

El Kardex presenta la siguiente información por cada movimiento registrado:

- **Fecha y hora** exacta del movimiento
- **Tipo de operación** (entrada, salida, ajuste, transferencia, venta)
- **Detalle / referencia** (número de transacción, documento de recepción, etc.)
- **Cantidad entrante** (entradas positivas)
- **Cantidad saliente** (salidas negativas)
- **Saldo acumulado** (stock resultante después del movimiento)
- **Costo promedio** vigente del producto

```
Fecha       | Tipo      | Referencia    | Entrada | Salida | Saldo | Costo Prom.
2024-01-01  | Inicial   | Saldo inicial |   100   |    -   |  100  | $ 12.00
2024-01-05  | Venta     | TXN-0042      |    -    |   -5   |   95  | $ 12.00
2024-01-10  | Recepción | REC-0123      |   +50   |    -   |  145  | $ 12.35
2024-01-15  | Ajuste    | AJU-0007      |    -    |   -2   |  143  | $ 12.35
```

Para abrir el Kardex de un producto:

1. Navega a **Stock Actual** o **Trazabilidad Stock**
2. Busca el producto deseado
3. Haz clic en el ícono de **Kardex** o selecciona "Ver Kardex" desde el menú de opciones del producto
4. Se despliega el modal con el historial completo de movimientos y saldos

> 💡 **Tip**: El Kardex es una herramienta fundamental para la conciliación de inventarios y la resolución de discrepancias. Utilízalo cuando necesites rastrear exactamente cuándo y por qué cambió el stock de un producto.

---

## 4. Recepciones (Ingreso de Mercancía)

Las recepciones permiten registrar la entrada de mercancía desde proveedores al inventario de tu tienda.

### 4.1 Ruta de Navegación

```
Operación → Logística → Recepciones (botón Nueva recepción)
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
Operación → Logística → Recepciones
```

Filtra por proveedor, fecha o estado para encontrar recepciones específicas.

---

## 5. Transferencias de Stock

Las transferencias permiten mover inventario entre tiendas, manteniendo la trazabilidad completa del movimiento.

### 5.1 Ruta de Navegación

```
Operación → Logística → Transferencia Stock
```

### 5.2 Flujo de Transferencia

Las transferencias en CostPro funcionan con un **flujo de confirmación en dos pasos** para garantizar la precisión:

#### Paso 1: Crear la Transferencia (Tienda Origen)

1. La **tienda de origen** es tu tienda activa
2. Selecciona el **almacén de destino** y agrega los productos y cantidades
3. El sistema verifica que haya stock **disponible** en la tienda de origen
4. Haz clic en **"Enviar Solicitud"**

```
Estado: 📤 PENDIENTE (stock reservado en origen; no disponible para ventas)
```

#### Paso 2: Confirmar la Recepción (Tienda Destino)

1. El operador de la **tienda destino** abre la transferencia (pestaña Entrantes)
2. Verifica físicamente que los productos y cantidades coincidan
3. Haz clic en **"Confirmar Recepción"**

```
Estado: ✅ CONFIRMADA (stock sale de origen y entra a destino en el mismo acto)
```

Si la transferencia confirmada estuvo mal, un usuario con rol en la tienda origen puede **Revertir** (estado REVERSADA); las pendientes pueden **Cancelarse**. Consulta **Estados de una transferencia** para el detalle completo.

### 5.3 Discrepancias al recibir

La confirmación aplica las cantidades del documento tal cual: no hay flujo de "discrepancia parcial" en la transferencia. Si llegó menos de lo enviado, confirme la transferencia y registre la diferencia como **Ajuste Documental** en la tienda correspondiente, con su motivo.

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

1. Navega a **Operación → Almacén → Ajustes Documentales**
2. Crea el ajuste y selecciona los **productos** a corregir
3. Ingresa la **cantidad contada** (no la diferencia)
4. El sistema calcula automáticamente la **diferencia** (positiva o negativa)
5. Escribe el **motivo** (campo obligatorio); el sistema lo clasifica en uno de los 4 motivos oficiales:

| Motivo | Descripción |
|--------|-------------|
| `FALTANTE DE CONTEO` | El conteo dio menos que el sistema |
| `SOBRANTE DE CONTEO` | El conteo dio más que el sistema |
| `PRODUCTO DAÑADO` | Producto dañado o inservible |
| `OTRO` | Otro motivo (se clasifica según el texto) |

6. El documento se crea **En Proceso**; revísalo y aplica con **Confirmar y Aplicar** (o anúlalo si estuvo mal)
7. Los documentos confirmados pueden **Revertirse** o **Duplicarse** desde su detalle

> ⚠️ **Importante**: Todos los ajustes documentales quedan registrados permanentemente en el **log de auditoría**. Este registro es inmutable y puede ser consultado en cualquier momento por supervisores o auditores.

---

## 7. Inventario Físico

El **Inventario Físico** es el proceso formal de conteo de la tienda (o de una categoría/selección de productos), con corte de existencias, conteo (opcionalmente ciego), conciliación de diferencias y generación automática de ajustes documentales. Cada inventario recibe un número **IF-AAAA-NNNNN** y recorre los estados Borrador → Preparado → En conteo → Conteo completado → En conciliación → (Pendiente de autorización) → Conciliado → Cerrado.

### 7.1 Ruta de Navegación

```
Operación → Almacén → Inventario Físico
```

### 7.2 Proceso Paso a Paso

#### Paso 1: Crear el Inventario

1. Haz clic en **Nuevo Inventario Físico**
2. Define la **fecha y hora de corte**, la descripción y el **responsable del conteo**
3. Define el **alcance**: catálogo completo, por categoría o selección de productos
4. Decide si el conteo será **ciego** (oculta las teóricas a quien cuenta)

#### Paso 2: Contar

1. Pulsa **Preparar conteo**: el stock teórico se congela al corte
2. Pulsa **Iniciar conteo** y captura las cantidades (con autosave) o usa la **Hoja de conteo PDF** / **Importar Excel**
3. Pulsa **Completar conteo** al terminar

#### Paso 3: Conciliar y Cerrar

1. Pulsa **Enviar a conciliación**: revisa teórico vs. contado, diferencias con su valor y movimientos post-corte
2. Si tu flujo lo requiere, **Enviar a autorización** y que un rol de gestión apruebe
3. Pulsa **Generar ajustes documentales**: se crean los ajustes de faltante y sobrante, enlazados al inventario (badge IF-…)
4. Pulsa **Cerrar inventario** para sellar el ciclo

> 💡 **Tip**: Programa inventarios físicos periódicos (mensuales como mínimo). La herramienta **Venta por Conteo** (Ventas → Opciones) es otra cosa: sirve para liquidar por diferencia de conteo, no para auditar inventario.

---

## 8. Tabla de Rutas de Navegación

| Función | Ruta en el menú |
|---------|-----------------|
| Catálogo de productos | `Operación → Almacén → Inventario (tab Catálogo)` |
| Niveles de stock | `Operación → Almacén → Inventario (tab Stock Actual)` |
| Historial de movimientos | `Operación → Almacén → Inventario (tab Trazabilidad)` |
| Ajustes documentales | `Operación → Almacén → Ajustes Documentales` |
| Inventario físico | `Operación → Almacén → Inventario Físico` |
| Etiquetas y códigos | `Operación → Almacén → Etiquetas y Códigos` |
| Vales de salida | `Operación → Almacén → Vales de Salida` |
| Nueva recepción | `Operación → Logística → Recepciones (nueva recepción)` |
| Historial de recepciones | `Operación → Logística → Recepciones` |
| Servicios recibidos | `Operación → Logística → Servicios Recibidos` |
| Órdenes de compra | `Operación → Logística → Órdenes de Compra` |
| Nueva transferencia | `Operación → Logística → Transferencia Stock` |
| Punto de venta | `Operación → Ventas → Vender` |
| Historial de ventas | `Operación → Ventas → Opciones → Historial de Ventas` |
| Caja (turnos y arqueo) | `Operación → Caja → Caja` |

---

## 9. Buenas Prácticas de Gestión de Inventario

> **📋 Convención de SKUs**: Define una convención de nomenclatura clara y consistente para los SKU. Por ejemplo: `[CATEGORÍA]-[SUBCATEGORÍA]-[CORRELATIVO]`. Esto facilita la búsqueda y evita duplicados.
>
> **📦 Recepciones inmediatas**: Registra las recepciones de mercancía **inmediatamente** al recibir los productos. No dejes mercancía sin registrar, ya que esto genera diferencias entre el stock físico y el del sistema.
>
> **🔄 Transferencias verificadas**: Siempre confirma las transferencias en la tienda destino **verificando físicamente** la mercancía. No confíes solo en la documentación.
>
> **📊 Stock mínimo realista**: Configura el stock mínimo basándote en el **historial de ventas** y el **tiempo de reposición** de cada producto, no en estimaciones arbitrarias.
>
> **🔍 Inventarios físicos regulares**: Programa inventarios físicos al menos una vez al mes. Las tiendas con alto volumen deberían realizar conteos semanales de las categorías de mayor rotación.
>
> **📝 Motivos claros en ajustes**: Siempre escribe descripciones claras y detalladas en los ajustes documentales. "Error" no es suficiente — indica qué error ocurrió y cómo se detectó.
>
> **🚨 Alertas proactivas**: Revisa las alertas de stock al inicio de cada turno y toma acción inmediata sobre los productos en nivel rojo. Un quiebre de stock significa una venta perdida.
>
> **🧹 Productos inactivos**: Revisa periódicamente el catálogo para identificar productos sin movimiento. Considera darlos de baja o hacer promociones para reducir inventario estancado.
