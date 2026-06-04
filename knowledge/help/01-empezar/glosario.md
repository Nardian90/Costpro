# Glosario de Términos

Referencia rápida de los términos técnicos utilizados en CostPro. Organizado por áreas funcionales para facilitar la consulta.

---

### Costos y Fórmulas

**Costo Directo**: Gasto que puede asignarse de forma directa e inequívoca a un producto o servicio específico, como materia prima o mano de obra directa.

**Costo Indirecto**: Gasto operativo que no puede asignarse a un solo producto y debe distribuirse mediante un método de prorrateo o coeficiente.

**Margen**: Diferencia entre el precio de venta y el costo total de un producto, expresado como valor absoluto o porcentaje sobre el precio.

**Coeficiente**: Factor numérico de ajuste aplicable a los anexos I y II de una ficha de costo para calibrar los valores importados desde las tablas de referencia.

**Ficha de Costo**: Documento central de CostPro que detalla la estructura completa de costos de un producto, incluyendo secciones, anexos y cálculos.

**Plantilla de Costo**: Modelo reutilizable que define la estructura de secciones, filas y métodos de cálculo para crear fichas de costo de productos similares.

**Sección**: Conjunto de filas dentro de una ficha de costo organizadas jerárquicamente, identificadas por números (1 a 16), donde las filas padre agrupan filas hija con costos individuales.

**Anexo**: Tabla complementaria dentro de una ficha de costo que almacena datos de referencia (I a X), utilizada por los métodos de cálculo ANEXO e IMPORTAR_ANEXO.

**Fila Padre**: Fila de nivel superior en la estructura de árbol de una ficha de costo que agrupa y totaliza los valores de las filas hija asociadas.

**Fila Hija**: Fila subordinada dentro de una sección que contiene un costo individual y cuyo valor se acumula en la fila padre correspondiente.

**Motor de Cálculo**: Motor interno de CostPro que procesa fórmulas y métodos de cálculo utilizando Decimal.js para garantizar precisión decimal en todas las operaciones aritméticas.

**Fórmula ref()**: Función del motor de cálculo que permite hacer referencia al valor de otra fila dentro de la misma ficha de costo, creando dependencias entre líneas.

**Fórmula vh()**: Función del motor de cálculo que accede a variables globales del sistema, como tasas de cambio, porcentajes de impuestos u otros valores compartidos.

**Forma de Cálculo FIJO**: Método de cálculo donde el usuario ingresa manualmente un valor numérico estático en la celda de la fila.

**Forma de Cálculo FORMULA**: Método de cálculo que evalúa una expresión matemática escrita por el usuario, soportando operadores aritméticos y las funciones ref() y vh().

**Forma de Cálculo PRORRATEO**: Método de cálculo que distribuye un costo indirecto de forma proporcional entre varias filas según una base de distribución definida.

**Forma de Cálculo ANEXO**: Método de cálculo que importa un valor desde una celda específica de un anexo (tabla complementaria) de la ficha de costo.

**Solver (Goal Seek)**: Herramienta del KPI Tablero que permite calcular el valor de entrada necesario para alcanzar un resultado objetivo en una ficha de costo.

**Darian AI**: Asistente de inteligencia artificial integrado en el módulo de costos que responde preguntas, explica cálculos y sugiere optimizaciones en lenguaje natural.

---

### Editor de Fichas y Modos de Vista

**Modo Experto**: Vista completa del editor de fichas con acceso a todas las columnas, fórmulas, herramientas de edición y funciones avanzadas del sistema.

**Modo Asistido**: Vista simplificada del editor que guía al usuario paso a paso con asistentes para la entrada de datos en fichas de costo.

**Lectura Narrativa**: Modo de visualización que presenta la ficha de costo como un documento de lectura fluida, mostrando los costos en formato descriptivo.

**Vistazo**: Modo de visualización compacto que muestra únicamente los totales y valores clave de cada sección sin desglose de detalles.

**Modo Auditoría**: Vista que despliega el historial completo de cambios de una ficha, mostrando valores anteriores, fechas de modificación y usuario responsable.

---

### Inventario y Ventas

**SKU**: Stock Keeping Unit — Código alfanumérico único que identifica cada producto en el sistema de inventario.

**Stock Disponible**: Cantidad de unidades de un producto listas para la venta en una tienda determinada.

**Stock Mínimo**: Umbral configurado por producto que, al ser alcanzado o superado, genera una alerta de reposición en el sistema.

**Ajuste de Inventario**: Corrección manual registrada para modificar la cantidad de stock de un producto, con motivo y autorización documentada.

**Recepción**: Proceso de ingreso de mercancía al inventario de una tienda, registrado con fecha, proveedor, cantidades recibidas y documentos de referencia.

**Transferencia**: Movimiento de productos entre dos tiendas del sistema, que decrementa el stock en la tienda de origen e incrementa en la tienda de destino.

**Conteo**: Verificación física del inventario existente en una tienda, donde se comparan las cantidades reales con las registradas en el sistema.

**POS**: Point of Sale — Terminal de punto de venta donde se registran las transacciones comerciales con los clientes.

**GIF**: Generador de Inventario Físico — Herramienta para crear y gestionar conteos de inventario de forma organizada.

**Análisis ABC**: Método de clasificación de inventario que categoriza los productos en tres niveles (A: alto valor/baja cantidad, B: medio, C: bajo valor/alta cantidad) para priorizar la gestión de stock.

**Kardex**: Registro detallado y cronológico de todos los movimientos de inventario de un producto, mostrando entradas, salidas y saldo acumulado para un control preciso del stock.

**Variante de Producto**: Presentación alternativa de un producto con diferente cantidad y precio (por ejemplo: unidad, paquete, caja), vinculada por un factor de conversión que ajusta automáticamente el stock.

**Descuento por Ítem**: Reducción de precio aplicada individualmente a una línea específica del carrito de venta, independiente del descuento global de la transacción.

**Código QR de Venta**: Código QR único generado automáticamente en cada comprobante de venta, que permite la verificación electrónica de la transacción.

---

### IPV y Finanzas

**IPV**: Índice de Precios y Variaciones — Sistema de seguimiento y análisis de cambios en los precios de productos a lo largo del tiempo.

**Índice de Precios**: Valor numérico que representa el nivel de precios de un conjunto de productos en un período determinado, utilizado como referencia para análisis de variaciones.

**Variación**: Cambio porcentual o absoluto en el precio de un producto entre dos períodos, calculado y registrado por el módulo IPV.

**Recibo de Ingreso**: Documento generado en el módulo IPV que registra el ingreso de mercancía con los datos de precio aplicado en el momento de la recepción.

**SC-204**: Formato estándar de comunicación de inventario utilizado para la exportación de datos de recepción hacia sistemas externos.

**Conciliación**: Proceso de verificación y ajuste entre los registros internos de precios del sistema IPV y los datos de fuentes externas o documentos de referencia.

**Regla de Matching**: Configuración que define el criterio automático para emparejar transacciones bancarias con registros internos. CostPro soporta 9 tipos: HARD_REF, EXACT_SUM, TOLERANCE, CASH_FILL, PRICE_FLEX, WILDCARDS, GOAL_WITH_TOLERANCE, STOCK_LIMIT y AUTO_SUPPLY.

**Motor de Matching Inteligente**: Sistema avanzado de conciliación que utiliza IA para mejorar la precisión del emparejamiento de transacciones más allá de las reglas manuales.

**Extracto Bancario BANDEC**: Formato específico de extracto bancario del Banco de Crédito y Comercio (BANDEC) de Cuba, con parser dedicado para su importación automática al módulo IPV.

**MVT**: Modelo de Valoración y Transferencia — Formato de exportación de datos del módulo IPV hacia sistemas externos, con plantillas configurables y editor visual.

---

### Reportes y Herramientas

**Reporte**: Documento generado por el sistema que consolida datos de ventas, inventario, costos o finanzas en un período determinado. CostPro soporta 11 tipos: ventas, ganancias, inventario, kardex, compras, auditoría, fichas de costo, ingresos diarios, gastos diarios, transferencias y caja.

**Paleta de Comandos**: Herramienta de búsqueda global activada con Ctrl+K que permite acceder rápidamente a cualquier módulo, acción o documento del sistema sin usar el ratón.

**PWA (Progressive Web App)**: Tecnología que permite instalar CostPro como aplicación nativa en el dispositivo, con soporte para funcionar sin conexión a internet y sincronizar automáticamente al reconectarse.

**Tienda Pública**: Catálogo en línea accesible públicamente por clientes a través de la URL /tienda/[slug], donde cada tienda tiene su propia página con sus productos y datos de contacto.

**Billetera Digital**: Módulo de seguimiento de finanzas personales que permite importar transacciones desde mensajes SMS, generar analíticas de gastos y exportar respaldos.

**Academy Pro**: Sistema de aprendizaje basado en tarjetas de estudio (flashcards) con algoritmo SM-2 de repetición espaciada, modos de dificultad (Básico, Operativo, Experto) y generación de tarjetas mediante IA.

**Wiki Contable**: Módulo de consulta contable que incluye un clasificador de cuentas, visor detallado de cuentas y registro de asientos contables, accesible desde Más Recursos.

**Modo de Conectividad**: Configuración que ajusta el rendimiento visual de la aplicación según la calidad de conexión a internet: 4G Fast (modo completo con animaciones) y 3G Savings (modo ligero sin animaciones complejas).

---

### Sistema y Configuración

**OCC**: Centro de Operaciones y Comando — Dashboard principal que muestra KPIs, fichas recientes y acciones rápidas al iniciar sesión.

**Rol Costo**: Séptimo rol del sistema con acceso exclusivo al módulo de costos (fichas, plantillas, KPI Tablero, Solver, Darian, exportaciones), sin acceso a ventas, inventario, IPV ni configuración.

**Permiso Granular**: Flag individual del sistema que controla acceso específico a una funcionalidad (como canCreateProducts, canViewInventory, canVoidTransactions). Existen 17 permisos distribuidos en 5 categorías.

**Slug**: Identificador único generado automáticamente a partir del nombre de una tienda, utilizado en la URL de la tienda pública (ejemplo: tienda-costpro para "Tienda CostPro").
