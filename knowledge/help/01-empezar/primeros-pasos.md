# Primeros Pasos en CostPro

## Contenido

- [Primer Inicio de Sesión](#primer-inicio-de-sesión)
  - [Selección de Tienda](#selección-de-tienda)
- [Dashboard — Centro de Operaciones (OCC)](#dashboard-centro-de-operaciones-occ)
  - [KPIs Principales](#kpis-principales)
  - [Fichas de Costo Recientes](#fichas-de-costo-recientes)
  - [Acciones Rápidas](#acciones-rápidas)
- [Los 6 Grupos de Módulos](#los-6-grupos-de-módulos)
  - [COSTOS](#costos)
  - [MULTI-TIENDA](#multi-tienda)
  - [IPV — Índice de Precios y Variaciones](#ipv-índice-de-precios-y-variaciones)
  - [OTROS](#otros)
  - [CONFIGURACIÓN](#configuración)
  - [MÁS RECURSOS](#más-recursos)
- [El Módulo de Costos en Profundidad](#el-módulo-de-costos-en-profundidad)
  - [¿Qué es una Ficha de Costo?](#qué-es-una-ficha-de-costo)
  - [Anatomía del Editor de Fichas](#anatomía-del-editor-de-fichas)
  - [Los 5 Modos de Visualización](#los-5-modos-de-visualización)
  - [Asistente IA — Darian](#asistente-ia-darian)
- [Atajos de Teclado](#atajos-de-teclado)
- [Cambio de Tema](#cambio-de-tema)
- [Cómo Acceder a la Ayuda](#cómo-acceder-a-la-ayuda)

## Primer Inicio de Sesión

Al acceder a CostPro por primera vez, el sistema utiliza autenticación basada en **Supabase**. Ingresa tus credenciales (correo electrónico y contraseña) proporcionadas por el administrador del sistema.

### Selección de Tienda

Una vez dentro, verifica la **tienda activa** en el selector ubicado en la barra superior. Este selector es fundamental en entornos multi-sucursal:

1. Haz clic en el nombre de la tienda actual en la barra superior.
2. Se desplegará una lista de las tiendas a las que tienes acceso asignado.
3. Selecciona la tienda con la que deseas trabajar.

> **Importante**: Toda la información mostrada —ventas, inventario, costos— se filtra según la tienda seleccionada. Si solo tienes acceso a una tienda, el selector no estará disponible.

## Dashboard — Centro de Operaciones (OCC)

El OCC es tu pantalla principal y punto de partida. Está dividido en las siguientes secciones:

### KPIs Principales

Los indicadores clave de rendimiento se muestran en tarjetas visuales en la parte superior del dashboard. Estos KPIs incluyen métricas de ventas, costos e inventario actualizadas en tiempo real.

### Fichas de Costo Recientes

Un panel muestra las fichas de costo que han sido modificadas recientemente, permitiendo acceso rápido para continuar el trabajo o revisar cambios.

### Acciones Rápidas

Botones de acceso directo para las operaciones más frecuentes:

- Crear nueva ficha de costo
- Abrir el KPI Tablero
- Acceder a la terminal POS
- Ver reportes del día

## Los 6 Grupos de Módulos

### COSTOS

El corazón de CostPro. Contiene el **editor de fichas de costo** con las siguientes funcionalidades:

- **KPI Tablero**: Panel de indicadores con función Solver (Goal Seek) para búsqueda de objetivos.
- **Fichas de Costo**: Creación y edición de costos con 5 modos de visualización.
- **Generador Masivo**: Creación masiva de fichas a partir de plantillas.
- **Explorador de Plantillas**: Biblioteca de plantillas de costo reutilizables.
- **Motor de Fórmulas**: 6 métodos de cálculo (FIJO, FORMULA, PRORRATEO, ANEXO, IMPORTAR_ANEXO, COEFICIENTE).

### MULTI-TIENDA

Gestión comercial operativa por sucursal:

| Función | Descripción |
|---------|-------------|
| Dashboard KPI | Indicadores de ventas y rendimiento por tienda |
| Terminal POS | Punto de venta para registro de transacciones |
| Historial de Ventas | Registro completo de ventas realizadas |
| Cierre de Caja | Arqueo y cierre del turno de caja |
| Catálogo | Gestión de productos disponibles para venta |
| Inventario | Control de existencias en la tienda |
| Historial de Stock | Movimientos históricos de inventario |
| Recepciones | Ingreso de mercancía al inventario |
| Transferencias | Movimiento de productos entre tiendas |
| Conteo de Inventario | Verificación física de existencias |
| Ajustes | Correcciones manuales de stock |

### IPV — Índice de Precios y Variaciones

Análisis y seguimiento de cambios en precios:

- **Reportes**: Informes de variación de precios por período.
- **Transacciones**: Registro de todas las operaciones de precios.
- **Catálogo**: Productos sujetos a seguimiento de precios.
- **Reglas**: Configuración de reglas de cálculo automático.
- **Simulación**: Proyección de escenarios de precios.
- **Recibos Inteligentes**: Generación de recibos con datos de ingreso.
- **Desglose**: Desglose detallado de componentes de precio.
- **Exportación MVT**: Exportación en formato MVT.
- **Auditoría**: Registro de cambios en el sistema IPV.
- **Movimientos**: Control de movimientos de precios.
- **Planificación**: Herramientas de planificación de precios.
- **Mipyme**: Funciones específicas para mipymes.

### OTROS

Funciones adicionales y complementarias del sistema.

### CONFIGURACIÓN

Administración y personalización del sistema:

- **Usuarios**: Gestión de cuentas de usuario.
- **Roles**: Definición y asignación de roles y permisos.
- **Tiendas**: Administración de sucursales.
- **Salud del Sistema**: Monitoreo del estado de la plataforma.
- **Logs de Auditoría**: Registro de todas las acciones del sistema.
- **Ajustes**: Configuración general del sistema.
- **Reportes**: Gestión de plantillas y configuración de reportes.
- **Noticias**: Publicaciones y comunicados internos.
- **RSS**: Configuración de fuentes de noticias.

### MÁS RECURSOS

Soporte y documentación:

- **Legal**: Marco legal y normativo.
- **Centro de Ayuda**: Sistema de ayuda en línea (este documento).
- **Wiki Contable**: Referencia contable y de costos.
- **Academia**: Material de capacitación.

## El Módulo de Costos en Profundidad

### ¿Qué es una Ficha de Costo?

La **Ficha de Costo** es el documento central de CostPro. Representa el análisis de costos completo de un producto o servicio, desglosando cada componente que incurre en su costo final.

### Anatomía del Editor de Fichas

El editor de fichas de costo se estructura en tres zonas principales:

#### Encabezado

Contiene los datos generales de la ficha: nombre del producto, código, unidad de medida, fecha de vigencia, estado y metadatos del documento.

#### Secciones (Filas 1–16)

Las secciones organizan los costos en una estructura de árbol jerárquica:

- **Filas Padre**: Representan categorías o grupos de costos (ej: Materia Prima, Mano de Obra, Gastos Indirectos).
- **Filas Hija**: Contienen los costos individuales dentro de cada categoría.
- Cada fila puede utilizar un **método de cálculo** diferente: FIJO (valor manual), FORMULA (expresión matemática), PRORRATEO (distribución proporcional), ANEXO (valor importado de un anexo), IMPORTAR_ANEXO o COEFICIENTE.
- El motor de cálculo soporta las funciones `ref()` para referencias entre filas y `vh()` para variables globales.
- Los cálculos utilizan **Decimal.js** para garantizar precisión decimal en todas las operaciones.

#### Anexos (I–X)

Los anexos son tablas complementarias que almacenan datos de referencia importados o calculados:

- Hasta **10 anexos** (I a X) por ficha.
- Los anexos **I y II** permiten ajuste de coeficientes.
- Se utilizan con los métodos de cálculo ANEXO e IMPORTAR_ANEXO.
- Pueden contener datos de proveedores, listas de materiales o tablas de referencia.

#### Firmas

La ficha incluye un bloque de firmas digitales para la aprobación y validación del documento por los responsables correspondientes.

### Los 5 Modos de Visualización

El editor de fichas ofrece 5 modos de visualización adaptados a diferentes necesidades:

| Modo | Descripción | Caso de Uso |
|------|-------------|-------------|
| **Experto** | Vista completa con todas las columnas, fórmulas y herramientas de edición avanzada. | Analistas de costos y administradores que necesitan control total. |
| **Asistido** | Vista simplificada con guías y asistentes paso a paso para la entrada de datos. | Usuarios nuevos o que completan fichas de forma rutinaria. |
| **Lectura Narrativa** | Presenta la ficha como un documento narrativo, mostrando los costos en formato de lectura fluida. | Revisiones, auditorías y presentación a stakeholders. |
| **Vistazo** | Vista compacta que muestra solo los totales y valores clave sin detalles. | Revisiones rápidas y aprobaciones de gestión. |
| **Auditoría** | Muestra el historial completo de cambios, valores anteriores y registros de modificación. | Auditores y supervisores que verifican la integridad de los datos. |

### Asistente IA — Darian

Darian es el asistente de inteligencia artificial integrado en el módulo de costos. Permite interactuar en lenguaje natural para:

- Consultar información sobre fichas de costo.
- Obtener explicaciones de cálculos y fórmulas.
- Recibir sugerencias de optimización de costos.
- Resolver dudas sobre el uso del sistema.

## Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl + K` | Abrir la paleta de comandos — busca cualquier función o sección del sistema |
| `Alt + 1` | Ir al grupo COSTOS |
| `Alt + 2` | Ir al grupo MULTI-TIENDA |
| `Alt + 3` | Ir al grupo IPV |
| `Alt + 4` | Ir al grupo OTROS |
| `Alt + 5` | Ir al grupo CONFIGURACIÓN |
| `Alt + 6` | Ir al grupo MÁS RECURSOS |
| `Escape` | Cerrar menús desplegables, modales y paneles |

> **Tip**: La paleta de comandos (`Ctrl + K`) es la forma más rápida de navegar. Escribe el nombre de cualquier módulo, ficha o función y presiona Enter para ir directamente.

## Cambio de Tema

CostPro ofrece 4 temas visuales accesibles desde el botón de tema en la barra superior:

1. Haz clic en el ícono de tema (sol/luna) en la esquina de la barra superior.
2. Selecciona uno de los temas disponibles:

| Tema | Características |
|------|-----------------|
| **Claro** | Fondo blanco, colores de acento suaves, ideal para ambientes iluminados |
| **Oscuro** | Fondo oscuro, reduce la fatiga visual en ambientes con poca luz |
| **Fast Light** | Claro con animaciones reducidas, mayor rendimiento |
| **Fast Dark** | Oscuro con animaciones reducidas, mayor rendimiento |

La selección se guarda automáticamente y persiste entre sesiones para cada usuario.

## Cómo Acceder a la Ayuda

Para acceder al sistema de ayuda en cualquier momento:

1. Desplázate hasta el grupo **MÁS RECURSOS** en la barra lateral.
2. Haz clic en **Centro de Ayuda**.
3. Utiliza la barra de búsqueda para encontrar artículos específicos o navega por las categorías disponibles.

> **Tip**: También puedes escribir "ayuda" o "help" en la paleta de comandos (`Ctrl + K`) para acceder directamente al centro de ayuda.
