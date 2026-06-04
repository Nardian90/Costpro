# Introducción a CostPro

## Bienvenido a CostPro

CostPro es una plataforma empresarial integral diseñada para la **gestión de costos, punto de venta (POS), inventario multi-tienda e índices de precios**. Construida como una aplicación web moderna progresiva (PWA), CostPro unifica en un solo sistema las operaciones de costeo de productos, la gestión comercial en sucursales, el control de inventario y el análisis de variaciones de precios.

La plataforma está orientada a empresas que requieren precisión en el cálculo de costos —con soporte para fórmulas complejas, anexos (I–X), auditoría completa y firmas digitales— y que operan bajo un modelo de **múltiples puntos de venta o sucursales** con control centralizado.

CostPro combina un motor de costos con asistente IA (Darian), una terminal POS con 6 métodos de pago, conciliación bancaria automática con 9 reglas de matching, análisis estadístico avanzado y una tienda pública accesible desde cualquier dispositivo —todo ello con soporte offline y almacenamiento local persistente.

## Módulos Principales

CostPro se organiza en **7 grupos de módulos** accesibles desde la barra lateral izquierda:

| Grupo | Descripción |
|-------|-------------|
| **ESCRITORIO** | Centro de Control (OCC): KPIs en tiempo real, fichas de costo recientes, acciones rápidas, estado del sistema y alertas relevantes. Adaptado al rol del usuario (administrador, cajero, analista). |
| **COSTOS** | Motor completo de fichas de costos: Tablero Principal, Modo Asistido (wizard interactivo con diagramas SVG), Modo Lectura (narrativa del costo), Generación Rápida y Experta, Explorador de Plantillas (11 plantillas sectoriales), Arena FC (BETA — comparación y simulación de costos), Importar/Exportar JSON, Exportar Excel/PDF, Asistente IA Darian, Generador Masivo, Calculadora de Estructuras Metálicas, Modo Auditoría, Firmas Digitales y KPI Tablero con Solver (Goal Seek). |
| **MULTI-TIENDA** | Operaciones comerciales por sucursal: Dashboard KPI (visualización ejecutiva con anillos de progreso y sparklines), Generador de Reportes, Terminal POS (6 métodos de pago incluyendo Wallet; variantes de producto box/pack/unidad; descuentos globales y por ítem; pagos mixtos; auditoría precio-bajo-costo), Catálogo de Ventas IPV (tabla estilo Excel con edición inline, exportación WhatsApp/Instagram/PDF y venta directa), Historial de Ventas, Arqueo de Caja, Catálogo Maestro (CRUD completo, importación CSV masiva, incremento masivo de precios), Stock Actual (vista tabla/tarjeta, ABC Analysis, Kardex, alertas por color), Trazabilidad de Stock, Ajustes Documentales (7 motivos), Etiquetas y Códigos de Barras, Recepciones, Historial de Recepciones, Transferencias (flujo de 2 pasos con exportación PDF), y Auditoría de Conteo. |
| **IPV** | Índice de Precios y Variaciones: Dashboard Institucional, Gestión de Transacciones, Ingesta de Extracto Bancario (BANDEC), Catálogo de Productos, Directorio de Clientes, Conciliación Manual, Reglas de Matching (9 tipos: HARD_REF, EXACT_SUM, TOLERANCE, CASH_FILL, PRICE_FLEX, WILDCARDS, GOAL_WITH_TOLERANCE, STOCK_LIMIT, AUTO_SUPPLY), Simulación de Escenarios, Recepciones IA (motor inteligente), Reportes SC-3-01, Pagos QR, Extracto Consolidado (Pivot), Desglose Operativo, Planeación Fiscal, Registro de Auditoría, Trazabilidad de Flujo, Centro de Errores, Mapeo Dinámico, Exportación MVT y Transacciones Mipyme. |
| **OTROS** | Herramientas complementarias: Pick 3 Intelligence (predicciones, gestión de bankroll, análisis estadístico avanzado) y Billetera Digital (importación de SMS, analítica de finanzas personales). |
| **CONFIGURACIÓN** | Administración del sistema: Usuarios (CRUD, estado, reset de contraseña), Roles (7 roles con permisos granulares), Tiendas (4 plantillas de diseño, slug público, storefront), Salud de la Plataforma (6 pestañas con métricas detalladas), Auditoría Global (timeline con filtros avanzados), Ajustes Globales (tema visual, impuestos, notificaciones, proveedores IA: Gemini, GPT, Qwen, DeepSeek y Kimi), Tablón de Noticias y Gestión RSS. |
| **MÁS RECURSOS** | Soporte y documentación: Marco Legal, Centro de Ayuda (este sistema documental conforme a ISO/IEC 26514), Wiki Contable (clasificador, catálogo de cuentas, asientos contables) y Academia Pro (flashcards con algoritmo SM-2, generación de contenido con IA). |

## Navegación

### Barra Lateral

La barra lateral izquierda organiza todos los módulos en grupos colapsables. Haz clic en un grupo para expandirlo y acceder a sus opciones individuales. Cada grupo muestra un ícono distintivo junto a su nombre. Los grupos que contienen submódulos con contenido nuevo o sin explorar pueden mostrar un indicador visual.

### Paleta de Comandos

Presiona `Ctrl + K` para abrir la **paleta de comandos**. Esta herramienta permite buscar y navegar rápidamente a cualquier sección del sistema mediante **búsqueda difusa (fuzzy search)** que cubre todas las acciones, módulos, fichas de costo y funciones disponibles —sin necesidad de usar el ratón.

### Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl + K` | Abrir la paleta de comandos |
| `Cmd + S` / `Ctrl + S` | Guardar la ficha de costo activa |
| `Alt + 1` a `Alt + 9` | Ir a la sección correspondiente del sidebar |
| `Alt + 1` | Ir al módulo COSTOS |
| `Alt + 2` | Ir al módulo MULTI-TIENDA |
| `Alt + 3` | Ir al módulo IPV |
| `Alt + 4` | Ir al módulo OTROS |
| `Alt + 5` | Ir al módulo CONFIGURACIÓN |
| `Alt + 6` | Ir al módulo MÁS RECURSOS |
| `Alt + E` | Expandir o colapsar la sección activa |
| `Alt + P` | Abrir el panel de problemas / incidencias |
| `Alt + H` | Abrir el Centro de Ayuda |
| `Escape` | Cerrar menús, modales o volver atrás |

> **Tip**: Los atajos `Alt + 1` a `Alt + 9` corresponden directamente al orden de los grupos en la barra lateral, lo que permite memorizarlos fácilmente una vez identificado el layout habitual.

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

## Dashboard — Centro de Operaciones (OCC)

Al iniciar sesión, el **OCC (Centro de Operaciones y Comando)** es la pantalla principal. Funciona como un centro de operaciones que muestra:

- **KPIs en tiempo real**: Indicadores clave del negocio actualizados dinámicamente, presentados con **anillos de progreso (ring visualization)** que ofrecen una lectura ejecutiva inmediata del estado global.
- **Fichas de costo recientes**: Acceso rápido a las últimas fichas modificadas, con indicadores de estado y fecha.
- **Acciones rápidas**: Atajos para crear nuevas fichas, ver reportes y acceder a funciones frecuentes.
- **Estado del sistema**: Información sobre la salud del sistema, uso de almacenamiento y alertas relevantes.
- **Soporte multi-tienda**: Cuando hay varias sucursales configuradas, el OCC muestra un resumen consolidado con la posibilidad de filtrar por tienda individual.
- **Alternancia de períodos**: Controles para cambiar la perspectiva temporal entre **día, mes y año**, permitiendo analizar tendencias y variaciones en el rango deseado.
- **Alertas de stock**: Sección dedicada que muestra productos con niveles de inventario bajos, próximos a vencimiento o con movimientos inusuales, codificados por color (rojo, amarillo, verde).

> **Nota**: El contenido del OCC se adapta según el rol del usuario. Un administrador verá KPIs globales de todas las tiendas, mientras que un cajero verá información relevante a su punto de venta —como ventas del día, arqueo pendiente y alertas de su sucursal.

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

El idioma se puede cambiar desde la barra superior o desde Ajustes Globales en Configuración. La preferencia se guarda por usuario.

### Generador de Reportes

Desde el módulo Multi-Tienda se accede al Generador de Reportes, que produce **11 tipos de reportes** configurables:

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

Cada tienda configurada en CostPro dispone de una **tienda pública accesible** en la ruta `/tienda/[slug]`, donde `[slug]` es el identificador único asignado a cada sucursal durante su creación en Configuración.

Características de la tienda pública:

- **Diseño personalizable**: Seleccionable entre **4 plantillas de diseño** al crear la tienda, cada una con un estilo visual distinto.
- **Catálogo en línea**: Muestra los productos activos de la tienda con imágenes, precios y descripciones.
- **Acceso sin autenticación**: Los clientes pueden navegar el catálogo sin necesidad de iniciar sesión en CostPro.
- **Exportación de catálogo**: Desde el Catálogo de Ventas IPV, los productos se pueden exportar para WhatsApp, Instagram y PDF con un formato profesional.
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

Este sistema de documentación que estás consultando se llama **Centro de Ayuda**. Está organizado en **5 secciones temáticas** para que encuentres la información rápidamente:

| Sección | Contenido |
|---------|-----------|
| **Para Empezar** | Introducción, primeros pasos y glosario de términos. |
| **Gestión de Costos** | Fichas de costo, procedimientos operativos y cálculos avanzados. |
| **Inventario y Ventas** | Gestión de inventario, flujo de POS y recepciones. |
| **Configuración y Roles** | Administración de tiendas, usuarios y permisos. |
| **Referencia Técnica** | Documentación normativa, compliance y módulos especializados. |

Usa la barra lateral izquierda para navegar entre secciones, o el buscador de la parte superior para encontrar contenido específico.

> **Nota**: Este sistema de ayuda cumple con la norma **ISO/IEC 26514** de documentación de productos de software, garantizando una estructura clara, vocabulario consistente y trazabilidad en la información.
