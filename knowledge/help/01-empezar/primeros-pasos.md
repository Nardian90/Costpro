# Primeros Pasos en CostPro

## Contenido

- [Primer Inicio de Sesión](#primer-inicio-de-sesión)
  - [Selección de Tienda](#selección-de-tienda)
- [Inicio — Tu Centro de Operaciones](#inicio-tu-centro-de-operaciones)
  - [Panel de Control (Resumen de Indicadores)](#panel-de-control-resumen-de-indicadores)
  - [Darian, tu Asistente IA](#darian-tu-asistente-ia)
  - [Acciones Recomendadas](#acciones-recomendadas)
- [Las Secciones del Sistema](#las-secciones-del-sistema)
  - [Operación](#operación)
  - [Análisis](#análisis)
  - [Sistema](#sistema)
  - [Ayuda](#ayuda)
  - [En Desarrollo](#en-desarrollo)
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

![Selector de tienda abierto con el buscador de sucursales y la lista de tiendas accesibles](/help/capturas/selector-tienda.webp "Figura 1. Selector de Tienda — cambio de sucursal activa desde la barra superior")

> **Importante**: Toda la información mostrada —ventas, inventario, costos— se filtra según la tienda seleccionada. Si solo tienes acceso a una tienda, el selector no estará disponible.

## Inicio — Tu Centro de Operaciones

**Inicio** es tu pantalla principal y punto de partida (vuelve a ella con `Ctrl + 1`). Está organizada en las siguientes zonas:

### Panel de Control (Resumen de Indicadores)

El KPI de rendimiento compara tus ventas del período contra una referencia contextual, con un anillo de cumplimiento y una lectura cualitativa. El selector del encabezado cambia la perspectiva temporal:

- **Día**: ventas del día vs promedio diario del mes anterior.
- **Mes**: total del mes vs promedio mensual reciente.
- **Año**: acumulado del año vs el año anterior.

Al lado encontrarás el **resumen de actividad**: transacciones, ticket promedio y desglose por método de pago del período seleccionado.

![Panel de Control de Inicio con el KPI de rendimiento y las acciones recomendadas](/help/capturas/dashboard-command-center.webp "Figura 2. Panel de Control — Resumen de Indicadores con perspectiva Día/Mes/Año")

### Darian, tu Asistente IA

Darian es el asistente de inteligencia artificial integrado. Pídele en lenguaje natural lo que necesites: consultar ventas, revisar costos, buscar productos o ejecutar acciones. Responde con datos de tu tienda activa.

![Chat de Darian listo para consultas en lenguaje natural con sugerencias rápidas](/help/capturas/asistente-darian.webp "Figura 3. Darian — consulta de ventas, costos y acciones en lenguaje natural")

### Acciones Recomendadas

Sugerencias que se adaptan a tu rol y al estado del negocio: revisar productos con stock bajo, abrir el turno de caja, completar datos de costos pendientes u otras tareas de tu alcance. Haz clic en una acción para ir directo al lugar correspondiente.

## Las Secciones del Sistema

La barra lateral organiza CostPro en secciones. Haz clic en una sección para ver sus módulos; en móvil, usa el botón del menú en la barra superior.

### Operación

El trabajo diario de la tienda:

| Módulo | Descripción |
|--------|-------------|
| Dashboard | Indicadores de la tienda activa: Resumen, Productos y Comportamiento |
| Ventas → Vender | Punto de venta rápido con carrito, escáner y pago mixto |
| Ventas → Opciones | Historial de Ventas, Caja, Venta por Conteo, Devoluciones, Cotizaciones, Ofertas, Clientes y cuentas |
| Almacén → Inventario | Existencias (tab Stock), catálogo de productos y trazabilidad de movimientos |
| Almacén → Ajustes Documentales | Correcciones de stock con justificación documental |
| Almacén → Etiquetas y Códigos | Etiquetas con código de barras y QR para imprimir |
| Logística | Recepciones, Órdenes de Compra y Transferencia Stock |
| Costo | Fichas de Costo, Estructura de Costo, Costeo Dinámico y Órdenes de Producción y Trabajo |
| Trabajadores y Comisiones | Equipo, reglas de comisión y pagos con auditoría |
| Gestión de Tiendas | Centro unificado: crear y configurar tiendas, backups y KPIs por tienda |
| Auditoría | Qué ocurrió, cuándo y quién: actividad en lenguaje claro |
| Redes | Bots de WhatsApp y Telegram por tienda |

### Análisis

Módulos de análisis y decisión:

- **Análisis de datos**: tabla dinámica de costos, márgenes y rentabilidad de tus fichas.
- **Inteligencia Cambiaria**: tasas oficiales vs informales, impacto en precios y simulador de escenarios.
- **Tablón de Noticias**: noticias económicas y fiscales con detección de tasas.
- **Reportes**: generador de reportes profesionales en PDF/Excel.
- **Análisis ABC**: clasificación de productos por impacto en ventas.

### Sistema

Administración del sistema (solo administradores): **Ajustes** (preferencias, impuestos, claves de IA), **Usuarios**, **Roles**, **Salud** (estado de servicios), **Monitoreo** (consumo y límites), **Gestión RSS** (fuentes del Tablón) y **Cierre Fiscal** (bloqueo de periodos con inmutabilidad).

### Ayuda

**Centro de Ayuda**: esta documentación. Nada más — así la encuentras siempre en el mismo lugar.

### En Desarrollo

Capacidades que **existen** pero aún no están completamente integradas. Son experimentales y pueden cambiar:

- **IPV** (administradores): banco de trabajo de conciliación con reportes, extractos, procesamiento IA y auditoría.
- **Pick3** (administradores): gestor de riesgo de inversión con métricas cuantitativas y backtest.
- **Billetera** (administradores): billetera digital experimental con importación de backups de Transfermóvil.
- **Wiki Contable**: asientos con Debe/Haber, plan de cuentas y normativas NC-29/ONAT.
- **Academia**: flashcards con repetición espaciada (SRS).
- **Marco Legal**: consultor de normativa cubana y generador de formularios oficiales.
- **Conciliación Bancaria**: vista de extractos y estado de conciliación en solo lectura (beta, capacidad parcial).

## El Módulo de Costos en Profundidad

### ¿Qué es una Ficha de Costo?

La **Ficha de Costo** es el documento central de CostPro. Representa el análisis de costos completo de un producto o servicio, desglosando cada componente que incurre en su costo final.

### Anatomía del Editor de Fichas

El editor de fichas de costo se estructura en tres zonas principales:

![Editor de fichas de costo con plantillas, estructura de costos por secciones y filas](/help/capturas/fichas-costo-gestion.webp "Figura 4. Editor de Fichas de Costo — estructura por secciones (1–16) y filas")

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
| `Ctrl + 1` | Ir a Inicio (dashboard) |
| `Ctrl + 2` | Ir a Vender (POS) |
| `Ctrl + 3` | Ir a Inventario (Stock) |
| `Ctrl + 4` | Ir al módulo IPV (En desarrollo, administradores) |
| `Ctrl + 5` | Ir a Fichas de Costo |
| `Ctrl + Shift + H` | Abrir el Centro de Ayuda |
| `Ctrl + /` | Ver la lista de atajos de teclado |
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

1. Abre la sección **Ayuda** en la barra lateral.
2. Haz clic en **Centro de Ayuda**.
3. Utiliza la barra de búsqueda para encontrar artículos específicos o navega por la Biblioteca (el panel interno de secciones).

![Centro de Ayuda abierto desde la sección Ayuda de la barra lateral](/help/capturas/centro-ayuda.webp "Figura 5. Centro de Ayuda — Biblioteca de secciones y buscador")

> **Tip**: También puedes pulsar `Ctrl + Shift + H`, escribir "ayuda" o "help" en la paleta de comandos (`Ctrl + K`), o usar el botón **?** que aparece en varias vistas para abrir directamente la documentación de esa vista.
