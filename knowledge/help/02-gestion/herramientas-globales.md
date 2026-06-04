# Herramientas Globales del Sistema

CostPro incorpora un conjunto de herramientas disponibles desde cualquier punto de la aplicación, diseñadas para agilizar la operación diaria, mejorar la productividad y personalizar la experiencia del usuario. Estas herramientas operan de forma transversal a todos los módulos y no requieren navegar a una sección específica para ser utilizadas.

## Paleta de Comandos (Ctrl+K)

La Paleta de Comandos es el centro de navegación rápida de CostPro. Permite buscar y ejecutar acciones en cualquier módulo sin necesidad de usar el ratón.

### Cómo Usarla

Presiona `Ctrl + K` (o `Cmd + K` en macOS) desde cualquier pantalla. Se abrirá un cuadro de búsqueda flotante en el centro de la pantalla.

### Características

- **Búsqueda difusa (fuzzy search):** Escribe parte del nombre de un módulo, acción o documento y el sistema encontrará coincidencias en tiempo real, incluso con errores tipográficos menores.
- **Búsqueda global:** Los resultados incluyen módulos de navegación, acciones contextuales (crear venta, nueva ficha, exportar) y documentos del sistema.
- **Filtrado instantáneo:** Los resultados se actualizan con cada tecla presionada, sin necesidad de esperar ni presionar Enter.
- **Navegación por teclado:** Utiliza las flechas arriba/abajo para seleccionar un resultado y Enter para ejecutarlo.

> **Tip:** La Paleta de Comandos reconoce abreviaturas. Escribe "pos" para acceder directamente al terminal de punto de venta, o "ficha" para ir al editor de fichas de costo.

## Calculadora Flotante

La Calculadora Flotante es una herramienta de cálculo rápido accesible desde cualquier módulo de la aplicación.

### Cómo Accederla

Haz clic en el icono de calculadora en la barra superior, o bien actívala desde la Paleta de Comandos buscando "calculadora".

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
| **Gemini** | Google Gemini | Integración nativa con Google Cloud |
| **GPT** | OpenAI GPT | Requiere clave API de OpenAI |
| **Qwen** | Alibaba Qwen | Alternativa de alto rendimiento multilingüe |
| **DeepSeek** | DeepSeek | Optimizado para tareas de razonamiento |
| **Kimi** | Moonshot Kimi | Soporte avanzado para documentos largos |

### Configuración de IA Darian

Para gestionar las claves de API de los proveedores de IA:

1. Navega a **CONFIGURACIÓN > Ajustes > Configuración de IA Darian**.
2. Haz clic en **Agregar Proveedor** para registrar una nueva clave API.
3. Completa el nombre del proveedor y la clave API correspondiente.
4. Activa o desactiva cada proveedor mediante el toggle de estado.
5. El proveedor activo será el utilizado por el ChatBot y el asistente de fichas de costo.

> **Importante:** Las claves API se almacenan de forma segura y encriptada en el sistema. Nunca se comparten entre instancias ni se exponen en la interfaz tras su registro.

## Atajos de Teclado Completos

CostPro define atajos de teclado para agilizar la navegación y las acciones más frecuentes:

| Atajo | Acción |
|-------|--------|
| `Ctrl + K` | Abrir la Paleta de Comandos |
| `Alt + 1` | Ir al módulo COSTOS |
| `Alt + 2` | Ir al módulo MULTI-TIENDA |
| `Alt + 3` | Ir al módulo IPV |
| `Alt + 4` | Ir al módulo OTROS |
| `Alt + 5` | Ir al módulo CONFIGURACIÓN |
| `Alt + 6` | Ir al módulo MÁS RECURSOS |
| `Alt + E` | Acción rápida de edición (contextual al módulo) |
| `Alt + P` | Acción rápida de impresión / exportación |
| `Alt + H` | Abrir el Centro de Ayuda |
| `Cmd + S` | Guardar cambios en el formulario o ficha activa |
| `Escape` | Cerrar menús, modales o cancelar la acción en curso |

> **Tip:** Los atajos con `Alt` no funcionan durante la edición de campos de texto. Primero cierra el campo (Escape) y luego usa el atajo deseado.

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
| **4G Fast** | Modo predeterminado. Todas las animaciones, transiciones y efectos visuales activos. Requiere buena conexión a internet. |
| **3G Savings** | Modo de ahorro de datos. Reduce animaciones, precarga selectiva y optimiza las peticiones de red. Ideal para conexiones inestables o planes de datos limitados. |

> **Nota:** Los temas Fast y el modo 3G Savings son particularmente útiles para usuarios que operan desde dispositivos móviles o en zonas con cobertura de red limitada. Las funciones del sistema no se ven afectadas, solo la presentación visual.

Para cambiar el tema, haz clic en el icono de sol/luna en la barra superior. Para cambiar el modo de conectividad, accede a CONFIGURACIÓN > Ajustes.

## Soporte PWA (Progressive Web App)

CostPro es una aplicación web progresiva (PWA), lo que permite instalarla directamente en el dispositivo del usuario como si fuera una aplicación nativa.

### Instalación

1. Abre CostPro en el navegador Chrome o Edge.
2. Si el navegador muestra el banner de instalación, haz clic en **Instalar**.
3. Alternativamente, haz clic en el icono de instalación en la barra de direcciones del navegador.
4. Confirma la instalación. CostPro aparecerá como un acceso directo en el escritorio y en el menú de aplicaciones.

### Funcionamiento Offline

- **Almacenamiento local:** Los datos de la sesión actual se almacenan en caché local.
- **Modo offline:** Si se pierde la conexión, la aplicación sigue accesible para consultas de datos en caché.
- **Sincronización:** Al recuperar la conexión, los cambios pendientes se sincronizan automáticamente con el servidor.
- **Notificaciones:** La PWA puede enviar notificaciones push al dispositivo incluso cuando la aplicación está cerrada.

> **Importante:** La operativa completa (ventas, modificaciones) requiere conexión activa. El modo offline permite solo lectura de datos en caché.

## Configuración de Impuestos

CostPro permite configurar el comportamiento de los impuestos de forma flexible para adaptarse a la normativa fiscal de cada jurisdicción.

### Parámetros Configurables

| Parámetro | Descripción |
|-----------|-------------|
| **Impuesto habilitado** | Activar o desactivar el cálculo automático de impuestos en las ventas |
| **Tipo de cálculo** | Por porcentaje (ej. 16% IVA) o por monto fijo (ej. $2.00 por transacción) |
| **Valor del impuesto** | El porcentaje o monto fijo a aplicar |
| **Umbral mínimo exento** | Monto mínimo de venta por debajo del cual no se aplica impuesto |

Para configurar impuestos, navega a **CONFIGURACIÓN > Ajustes > Impuestos**.

> **Tip:** Si tu jurisdicción exige exenciones para ventas menores (por ejemplo, ventas menores a $100 no tributan), configura el umbral mínimo exento para automatizar el cálculo.

## Notificaciones del Sistema

CostPro genera notificaciones automáticas para mantener al usuario informado de eventos relevantes:

| Tipo de Notificación | Descripción | Configurable |
|---------------------|-------------|:---:|
| **Alerta de stock bajo** | Se emite cuando un producto cae por debajo del mínimo de stock configurado | ✅ |
| **Confirmación de venta** | Notificación al registrar una venta exitosa | ✅ |
| **Recepción de transferencia** | Aviso cuando una tienda destino recibe mercancía transferida | ✅ |
| **Recordatorio de cierre** | Aviso para realizar el cierre de caja al finalizar el turno | ✅ |

Las notificaciones aparecen en el icono de campana de la barra superior y pueden configurarse desde **CONFIGURACIÓN > Ajustes > Notificaciones**.
