# Herramientas Globales del Sistema

CostPro incorpora un conjunto de herramientas disponibles desde cualquier punto de la aplicación, diseñadas para agilizar la operación diaria, mejorar la productividad y personalizar la experiencia del usuario. Estas herramientas operan de forma transversal a todos los módulos y no requieren navegar a una sección específica para ser utilizadas.

## Paleta de Comandos (Ctrl+K)

La Paleta de Comandos es el centro de navegación rápida de CostPro. Permite buscar y ejecutar acciones en cualquier módulo sin necesidad de usar el ratón.

### Cómo Usarla

Presiona `Ctrl + K` (o `Cmd + K` en macOS) desde cualquier pantalla. Se abrirá un cuadro de búsqueda flotante en el centro de la pantalla.

### Características

- **Búsqueda difusa (fuzzy search):** Escribe parte del nombre de un módulo, acción o documento y el sistema encontrará coincidencias en tiempo real, incluso con errores tipográficos menores.
- **Búsqueda global:** Los resultados incluyen módulos de navegación, acciones contextuales (crear venta, nueva ficha, exportar) y las tiendas a las que perteneces.
- **Filtrado instantáneo:** Los resultados se actualizan con cada tecla presionada, sin necesidad de esperar ni presionar Enter.
- **Navegación por teclado:** Utiliza las flechas arriba/abajo para seleccionar un resultado y Enter para ejecutarlo.

> **Tip:** La Paleta de Comandos reconoce abreviaturas. Escribe "pos" para acceder directamente al terminal de punto de venta, o "ficha" para ir al editor de fichas de costo.

## Calculadora Flotante

La Calculadora Flotante es una herramienta de cálculo rápido accesible desde cualquier módulo de la aplicación.

### Cómo Accederla

Haz clic en el icono de calculadora de la barra lateral (grupo inferior de iconos), o bien actívala desde la Paleta de Comandos buscando "calculadora".

### Funcionalidades

- **Operaciones aritméticas básicas:** Suma (`+`), resta (`-`), multiplicación (`×`), división (`÷`).
- **Operaciones porcentuales:** Cálculo de porcentajes directamente desde el teclado numérico.
- **Ventana flotante:** Se abre como un panel pequeño que no interrumpe el flujo de trabajo. Puede moverse y posicionarse en cualquier zona de la pantalla.
- **Persistencia:** Permanece abierta al navegar entre módulos, cerrándola solo cuando el usuario la cierra explícitamente.

> **Tip:** Es especialmente útil durante el registro de ventas para calcular descuentos o al ingresar datos en fichas de costos para verificar cálculos rápidos.

## ChatBot IA Global

CostPro integra un asistente de inteligencia artificial accesible desde toda la aplicación, denominado **Darian AI**. Este chatbot puede responder preguntas sobre el sistema, asistir en la configuración y generar sugerencias operativas.

### Proveedores de IA Configurables

El sistema soporta múltiples proveedores de modelos de lenguaje, configurables desde la sección de ajustes:

| Proveedor | Modelo | Notas |
|-----------|--------|-------|
| **z.ai** | GLM-4 | **Proveedor por defecto**: funciona sin configurar clave API |
| **Gemini** | Google Gemini | Integración nativa con Google Cloud |
| **GPT** | OpenAI GPT | Requiere clave API de OpenAI |
| **Qwen** | Alibaba Qwen | Alternativa de alto rendimiento multilingüe |
| **DeepSeek** | DeepSeek | Optimizado para tareas de razonamiento |
| **Kimi** | Moonshot Kimi | Soporte avanzado para documentos largos |

### Configuración de IA Darian

Para gestionar las claves de API de los proveedores de IA:

1. Navega a **SISTEMA > Ajustes** y abre **Configuración de Darian AI**.
2. Haz clic en **Agregar** para registrar una nueva clave API.
3. Completa el nombre del proveedor y la clave API correspondiente.
4. Activa o desactiva cada proveedor mediante el toggle de estado.
5. El proveedor activo será el utilizado por el ChatBot y el asistente de fichas de costo. Darian funciona con **z.ai (GLM-4)** sin necesidad de configurar clave API.

> **Importante:** No compartas tus claves API: se registran en el sistema y no se vuelven a mostrar en la interfaz tras su registro.

## Atajos de Teclado Completos

CostPro define atajos de teclado para agilizar la navegación y las acciones más frecuentes:

| Atajo | Acción |
|-------|--------|
| `Ctrl + K` | Abrir la Paleta de Comandos |
| `Ctrl + 1` | Ir a Inicio (dashboard) |
| `Ctrl + 2` | Ir a Vender (POS) |
| `Ctrl + 3` | Ir a Inventario (Stock) |
| `Ctrl + 4` | Ir al módulo IPV (En desarrollo, administradores) |
| `Ctrl + 5` | Ir a Fichas de Costo |
| `Ctrl + B` | Mostrar/ocultar la barra lateral |
| `Ctrl + Shift + H` | Abrir el Centro de Ayuda |
| `Ctrl + /` | Ver la lista de atajos de teclado |
| `Escape` | Cerrar menús, modales o cancelar la acción en curso |

> **Tip:** Los atajos con `Ctrl` también funcionan mientras escribe en un campo de texto (por ejemplo, `Ctrl + 2` lo lleva a Vender sin salir del campo).

## Temas Visuales

CostPro ofrece 5 temas visuales y 2 modos de conectividad para adaptar la interfaz al entorno de trabajo del usuario:

### Temas Disponibles

| Tema | Descripción | Ideal para |
|------|-------------|------------|
| **Claro** | Tema claro predeterminado con fondos blancos y paleta de colores suaves | Entornos de oficina con buena iluminación |
| **Oscuro** | Tema oscuro con fondos gris oscuro y texto claro | Entornos con poca luz o uso nocturno |
| **Fast Light** | Tema claro con animaciones y efectos visuales reducidos | Conexiones lentas o equipos de bajo rendimiento |
| **Fast Dark** | Tema oscuro con animaciones y efectos visuales reducidos | Conexiones lentas o equipos de bajo rendimiento |
| **Auto** | Detecta automáticamente la preferencia del sistema operativo y aplica Claro u Oscuro | Usuarios que alternan entre modo claro y oscuro en su dispositivo |

### Modos de Conectividad

| Modo | Descripción |
|------|-------------|
| **4G Rápido** | Modo predeterminado. Todas las animaciones, transiciones y efectos visuales activos. Requiere buena conexión a internet. |
| **3G Ahorro** | Modo de ahorro de datos. Reduce animaciones, precarga selectiva y optimiza las peticiones de red. Ideal para conexiones inestables o planes de datos limitados. |

> **Nota:** Los temas Fast y el modo 3G Ahorro son particularmente útiles para usuarios que operan desde dispositivos móviles o en zonas con cobertura de red limitada. Las funciones del sistema no se ven afectadas, solo la presentación visual.

Para cambiar el tema, haz clic en el icono de sol/luna en la barra superior. Para cambiar el modo de conectividad, accede a **SISTEMA > Ajustes**.

## Soporte PWA (Progressive Web App)

CostPro es una aplicación web progresiva (PWA), lo que permite instalarla directamente en el dispositivo del usuario como si fuera una aplicación nativa.

### Instalación

1. Abre CostPro en el navegador Chrome o Edge.
2. Si el navegador muestra el banner de instalación, haz clic en **Instalar**.
3. Alternativamente, haz clic en el icono de instalación en la barra de direcciones del navegador.
4. Confirma la instalación. CostPro aparecerá como un acceso directo en el escritorio y en el menú de aplicaciones.

### Funcionamiento Offline

- **Almacenamiento local:** Los datos de la sesión actual se almacenan en caché local.
- **Modo offline:** Si se pierde la conexión, la operativa esencial sigue funcionando: las **ventas se quedan en cola local** y se sincronizan automáticamente al reconectar.
- **Sincronización:** Al recuperar la conexión, los cambios pendientes se envían al servidor y el inventario y la caja se actualizan con ellos.
- **Notificaciones:** Las notificaciones de la aplicación se muestran mientras CostPro está en uso; no existe envío push externo cuando la aplicación está cerrada.

> **Importante:** La operación normal requiere conexión activa. Si se pierde, las ventas quedan en cola local esperando sincronización; consulte *Cómo funciona el modo offline* para el detalle de qué funciona y qué no.

## Gestión de Impuestos

La sección **Gestión de Impuestos** lista los impuestos existentes de la tienda y permite **activarlos o desactivarlos** para las ventas. La creación y los parámetros fiscales (tipo, valor, umbral exento) no se editan desde esta pantalla.

Para ver los impuestos, navega a **SISTEMA > Ajustes > Gestión de Impuestos**.

> **Tip:** Para ventas con ITBIS manual en ofertas y promociones, consulte *Cómo crear una oferta*.

## Notificaciones del Sistema

CostPro genera notificaciones automáticas para mantener al usuario informado de eventos relevantes:

| Tipo de Notificación | Descripción | Configurable |
|---------------------|-------------|:---:|
| **Alertas de Stock Bajo** | Se emite cuando un producto cae por debajo del mínimo de stock configurado | ✅ |
| **Confirmación de Ventas** | Notificación al registrar una venta exitosa | ✅ |

Las notificaciones aparecen en el icono de campana de la barra superior y pueden activarse o desactivarse desde **SISTEMA > Ajustes > Notificaciones**.
