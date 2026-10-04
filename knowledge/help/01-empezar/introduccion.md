# Introducción a CostPro

## Bienvenido a CostPro

CostPro es una plataforma empresarial integral diseñada para la **gestión de costos, punto de venta (POS), inventario multi-tienda e índices de precios**. Construida como una aplicación web moderna progresiva (PWA), CostPro unifica en un solo sistema las operaciones de costeo de productos, la gestión comercial en sucursales, el control de inventario y el análisis de variaciones de precios.

La plataforma está orientada a empresas que requieren precisión en el cálculo de costos —con soporte para fórmulas complejas, anexos (I–X), auditoría completa y firmas digitales— y que operan bajo un modelo de **múltiples puntos de venta o sucursales** con control centralizado.

CostPro combina un motor de costos con asistente IA (Darian), un POS con pago mixto multi-moneda, análisis estadístico avanzado y una tienda pública accesible desde cualquier dispositivo —todo ello con soporte offline y almacenamiento local persistente.

## Secciones Principales

CostPro se organiza en **secciones** accesibles desde la barra lateral izquierda:

| Sección | Descripción |
|---------|-------------|
| **Inicio** | AI Command Center: pídele a Darian lo que necesitas. Incluye el Panel de Control con el Resumen de Indicadores (KPI de rendimiento con perspectiva Día/Mes/Año), acciones recomendadas según tu rol, resumen de actividad y alertas de stock. |
| **Operación** | El trabajo diario: Dashboard de la tienda activa (tabs Resumen, Productos y Comportamiento); Ventas con **Vender** (POS con carrito, escáner, pago mixto y Vale de Salida) y **Opciones** (Historial de Ventas, Caja, Venta por Conteo, Devoluciones, Cotizaciones, Ofertas, Clientes, Cuentas por Pagar y Cobros); Almacén (Inventario con tabs Stock/Catálogo/Trazabilidad, Servicios Recibidos, Ajustes Documentales, Etiquetas y Códigos); Logística (Recepciones, Órdenes de Compra, Transferencia Stock); Costo (Fichas de Costo, Estructura de Costo, Costeo Dinámico, Órdenes de Producción y Trabajo); Trabajadores y Comisiones; Gestión de Tiendas; Auditoría; y Redes (WhatsApp/Telegram). |
| **Análisis** | Análisis de datos (tabla dinámica de costos, márgenes y rentabilidad), Inteligencia Cambiaria (tasas oficiales vs informales, simulador), Tablón de Noticias, Reportes (generador PDF/Excel) y Análisis ABC. |
| **Sistema** | Administración del sistema (solo administradores): Ajustes, Usuarios, Roles, Salud, Monitoreo, Gestión RSS y Cierre Fiscal. |
| **Ayuda** | Este Centro de Ayuda: documentación funcional y técnica de CostPro. |
| **En desarrollo** | Capacidades que existen pero aún no están completamente integradas (experimentales): IPV, Pick3, Billetera, Wiki Contable, Academia, Marco Legal y Conciliación Bancaria. |

## Navegación

### Barra Lateral

La barra lateral izquierda organiza todos los módulos en grupos colapsables. Haz clic en un grupo para expandirlo y acceder a sus opciones individuales. Cada grupo muestra un ícono distintivo junto a su nombre. Los grupos que contienen submódulos con contenido nuevo o sin explorar pueden mostrar un indicador visual.

### Paleta de Comandos

Presiona `Ctrl + K` para abrir la **paleta de comandos**. Esta herramienta permite buscar y navegar rápidamente a cualquier sección del sistema mediante **búsqueda difusa (fuzzy search)** que cubre todas las acciones, módulos, fichas de costo y funciones disponibles —sin necesidad de usar el ratón.

### Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl + K` | Abrir la paleta de comandos |
| `Ctrl + B` | Mostrar/ocultar la barra lateral |
| `Ctrl + 1` | Ir a Inicio (dashboard) |
| `Ctrl + 2` | Ir a Vender (POS) |
| `Ctrl + 3` | Ir a Inventario (Stock) |
| `Ctrl + 4` | Ir al módulo IPV (En desarrollo, administradores) |
| `Ctrl + 5` | Ir a Fichas de Costo |
| `Ctrl + Shift + H` | Abrir el Centro de Ayuda |
| `Ctrl + /` | Ver la lista de atajos de teclado |
| `Escape` | Cerrar menús, modales o paneles activos |

### Barra Superior

La barra superior contiene el **selector de tienda activa**, notificaciones, el botón de cambio de tema, el selector de idioma y el menú de usuario. El selector de tienda es fundamental en entornos multi-sucursal, ya que filtra toda la información según la tienda seleccionada.

## Temas Visuales

CostPro ofrece **5 temas visuales** que se pueden cambiar desde el botón de tema en la barra superior:

| Tema | Descripción |
|------|-------------|
| **Auto** | Se adapta automáticamente a la preferencia del sistema operativo (claro u oscuro). |
| **Claro** | Tema claro predeterminado con fondos blancos y colores suaves. |
| **Oscuro** | Tema oscuro para entornos con poca luz o preferencia visual. |
| **Fast Light** | Tema claro optimizado para máxima velocidad de renderizado. |
| **Fast Dark** | Tema oscuro optimizado para máxima velocidad de renderizado. |

> **Tip**: Los temas *Fast* reducen las animaciones y efectos visuales complejos, resultando ideales para conexiones lentas o equipos con recursos limitados.

### Modos de Conectividad

Para optimizar la experiencia según la calidad de la conexión a Internet, CostPro dispone de dos modos de conectividad:

| Modo | Descripción |
|------|-------------|
| **4G Fast** | Activa toda la carga de assets, animaciones, iconos vectoriales y gráficos interactivos. Ideal para conexiones estables y de alta velocidad. |
| **3G Savings** | Reduce la carga de assets pesados, desactiva animaciones no esenciales y prioriza la funcionalidad sobre los efectos visuales. Recomendado para conexiones limitadas o datos móviles. |

> **Nota**: El tema **Auto** y los modos de conectividad se configuran de forma independiente. Puedes usar Auto con 3G Savings para un comportamiento inteligente que adapta tanto la apariencia como el rendimiento.

## Inicio — Tu Centro de Operaciones

Al iniciar sesión aterrizas en **Inicio** (puedes volver en cualquier momento con `Ctrl + 1`). Es el punto de partida diario y reúne:

- **Panel de Control (Resumen de Indicadores)**: el KPI de rendimiento compara tus ventas contra una referencia contextual (día, mes o año) con un anillo de cumplimiento y lectura cualitativa. Puedes cambiar la perspectiva temporal entre **día, mes y año** con el selector del encabezado.
- **Darian, tu asistente IA**: pídele en lenguaje natural costos, ventas, productos o acciones; responde con datos de tu tienda activa.
- **Acciones recomendadas**: sugerencias según tu rol y el estado del negocio (p. ej., revisar stock bajo o abrir turno de caja).
- **Resumen de actividad**: transacciones, ticket promedio y desglose por método de pago del período seleccionado.
- **Alertas de stock**: productos con niveles de inventario bajos, codificados por color (rojo, amarillo, verde).
- **Soporte multi-tienda**: con varias sucursales, la información corresponde siempre a la tienda activa; cámbiala con el selector de la barra superior.

> **Nota**: El contenido de Inicio se adapta según el rol del usuario. Un administrador verá el panorama completo, mientras que un cajero verá información relevante a su punto de venta —como ventas del día, arqueo pendiente y alertas de su sucursal.

## Herramientas Globales

CostPro incluye un conjunto de herramientas disponibles desde cualquier módulo que potencian la productividad diaria:

### Paleta de Comandos (`Ctrl + K`)

La paleta de comandos permite ejecutar cualquier acción del sistema mediante **búsqueda difusa (fuzzy search)**. Simplemente presiona `Ctrl + K`, escribe parte del nombre de una acción, ficha, módulo o función y selecciona el resultado deseado. No es necesario recordar la ubicación exacta en el menú.

### Calculadora Flotante

Una calculadora siempre accesible que se puede abrir desde la barra superior. Permite realizar cálculos rápidos sin abandonar la pantalla actual. Soporta operaciones aritméticas básicas y el resultado puede copiarse al portapapeles con un clic.

### ChatBot IA Global

Un asistente de IA integrado accesible desde cualquier punto de la aplicación. Puede responder preguntas sobre el uso de CostPro, explicar conceptos de costeo, ayudar con la navegación y proporcionar asistencia contextual basada en el módulo activo.

### Soporte PWA

CostPro es una **Progressive Web App (PWA)** instalable directamente desde el navegador. Una vez instalada:

- Funciona como una aplicación nativa en tu dispositivo.
- Dispone de **soporte offline**: las operaciones esenciales siguen disponibles sin conexión a Internet.
- Los datos se sincronizan automáticamente al recuperar la conectividad.
- Utiliza **almacenamiento local persistente** para garantizar que no se pierda información.

### Idiomas

La interfaz de CostPro está disponible en **dos idiomas**:

| Idioma | Código |
|--------|--------|
| **Español** | ES |
| **Inglés** | EN |

El idioma se puede cambiar desde la barra superior o desde **Sistema → Ajustes**. La preferencia se guarda por usuario.

### Generador de Reportes

Desde **Análisis → Reportes** se accede al Generador de Reportes, que produce **11 tipos de reportes** configurables:

| Tipo de Reporte | Descripción |
|-----------------|-------------|
| **Ventas (Sales)** | Reporte detallado de ventas por período, tienda y producto. |
| **Ganancias (Profit)** | Análisis de márgenes y rentabilidad por producto y categoría. |
| **Inventario (Inventory)** | Estado actual del inventario con valores y cantidades. |
| **Kardex** | Movimiento histórico de entradas y salidas por producto. |
| **Compras (Purchases)** | Registro de recepciones y compras a proveedores. |
| **Auditoría (Audit)** | Trazabilidad de cambios y acciones en el sistema. |
| **Ficha de Costo (Cost Sheet)** | Reporte completo de una ficha de costo con desglose. |
| **Ingresos Diarios (Daily Income)** | Resumen de ingresos desglosado por día y método de pago. |
| **Gastos Diarios (Daily Expenses)** | Control de gastos operativos diarios. |
| **Transferencias (Transfer)** | Historial de transferencias entre tiendas. |
| **Arqueo de Caja (Cash)** | Detalle de apertura, movimientos y cierre de caja. |

Todos los reportes permiten filtrado por fecha, tienda, categoría y otros parámetros, con exportación a PDF y Excel.

## Tienda Pública

Cada tienda configurada en CostPro dispone de una **tienda pública accesible** en la ruta `/tienda/[slug]`, donde `[slug]` es el identificador único asignado a cada sucursal durante su creación en **Gestión de Tiendas**.

Características de la tienda pública:

- **Diseño personalizable**: Seleccionable entre **4 plantillas de diseño** al crear la tienda, cada una con un estilo visual distinto.
- **Catálogo en línea**: Muestra los productos activos de la tienda con imágenes, precios y descripciones.
- **Acceso sin autenticación**: Los clientes pueden navegar el catálogo sin necesidad de iniciar sesión en CostPro.
- **Exportación de catálogo**: Desde la **Tabla de Venta**, los productos se pueden exportar para WhatsApp, Instagram y PDF con un formato profesional.
- **Venta directa**: El catálogo permite iniciar el proceso de venta directamente desde la vista pública.

> **Nota**: La tienda pública utiliza el **slug público** definido en la configuración de la tienda. Asegúrate de elegir un slug descriptivo y único que sea fácil de compartir con tus clientes.

## Requisitos del Sistema

Para utilizar CostPro se requiere:

| Requisito | Especificación |
|-----------|----------------|
| **Navegador** | Chrome, Firefox, Edge o Safari (últimas 2 versiones) |
| **Conexión** | Internet estable (la aplicación es completamente web, con soporte offline vía PWA) |
| **Resolución** | Mínima de 1024 × 768 píxeles |
| **Pantalla** | Recomendada 1366 × 768 o superior para experiencia óptima |

> **Tip**: Para el módulo de costos con vista Experto, se recomienda una pantalla de al menos 1440px de ancho para visualizar todas las columnas del editor sin desplazamiento horizontal.

## Centro de Ayuda

Este sistema de documentación que estás consultando se llama **Centro de Ayuda**. Está organizado en secciones según el framework **Diátaxis** para que encuentres la información rápidamente:

| Sección | Contenido |
|---------|-----------|
| **Para Empezar** | Introducción, primeros pasos y glosario de términos. |
| **Tutoriales** | Recorridos paso a paso: primer inicio, primera venta, primer producto y primer reporte. |
| **Cómo Hacer** | Guías de tareas concretas: cambiar de tienda, cerrar caja, recibir mercancía, ajustar inventario y más. |
| **Gestión** | Fichas de costo, procedimientos operativos, reportes y herramientas globales. |
| **Inventario** | Gestión de inventario, flujo de punto de venta, catálogo de ventas y exportaciones. |
| **Referencia** | Glosario, roles y permisos, atajos, temas visuales, tipos de reportes, métodos de pago y estados. |
| **Configuración** | Administración de tiendas, roles y tienda pública. |
| **Explicación** | Conceptos de fondo: multi-tienda, ficha de costo, IPV, auditoría, tasa cambiaria, offline. |
| **Referencia Avanzada** | Flujos de módulos especializados. |
| **Cumplimiento Normativo** | Políticas de seguridad y cumplimiento. |

Usa la **Biblioteca** (barra lateral interna) para navegar entre secciones, o el buscador de la parte superior para encontrar contenido específico. En escritorio puedes ocultar o mostrar la Biblioteca con el botón correspondiente de su encabezado.

> **Nota**: Este sistema de ayuda cumple con la norma **ISO/IEC 26514** de documentación de productos de software, garantizando una estructura clara, vocabulario consistente y trazabilidad en la información.
