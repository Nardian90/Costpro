# Glosario de Términos

**Costo Directo**: Gasto que puede asignarse de forma directa e inequívoca a un producto o servicio específico, como materia prima o mano de obra directa.

**Costo Indirecto**: Gasto operativo que no puede asignarse a un solo producto y debe distribuirse mediante un método de prorrateo o coeficiente.

**Margen**: Diferencia entre el precio de venta y el costo total de un producto, expresado como valor absoluto o porcentaje sobre el precio.

**SKU**: Stock Keeping Unit — Código alfanumérico único que identifica cada producto en el sistema de inventario.

**POS**: Point of Sale — Terminal de punto de venta donde se registran las transacciones comerciales con los clientes.

**IPV**: Índice de Precios y Variaciones — Sistema de seguimiento y análisis de cambios en los precios de productos a lo largo del tiempo.

**OCC**: Centro de Operaciones y Comando — Dashboard principal que muestra KPIs, fichas recientes y acciones rápidas al iniciar sesión.

**GIF**: Generador de Inventario Físico — Herramienta para crear y gestionar conteos de inventario de forma organizada.

**Ficha de Costo**: Documento central de CostPro que detalla la estructura completa de costos de un producto, incluyendo secciones, anexos y cálculos.

**Plantilla de Costo**: Modelo reutilizable que define la estructura de secciones, filas y métodos de cálculo para crear fichas de costo de productos similares.

**Anexo**: Tabla complementaria dentro de una ficha de costo que almacena datos de referencia (I a X), utilizada por los métodos de cálculo ANEXO e IMPORTAR_ANEXO.

**Sección**: Conjunto de filas dentro de una ficha de costo organizadas jerárquicamente, identificadas por números (1–16), donde las filas padre agrupan filas hija con costos individuales.

**Motor de Cálculo**: Motor interno de CostPro que procesa fórmulas y métodos de cálculo utilizando Decimal.js para garantizar precisión decimal en todas las operaciones aritméticas.

**Fórmula ref()**: Función del motor de cálculo que permite hacer referencia al valor de otra fila dentro de la misma ficha de costo, creando dependencias entre líneas.

**Fórmula vh()**: Función del motor de cálculo que accede a variables globales del sistema, como tasas de cambio, porcentajes de impuestos u otros valores compartidos.

**Solver (Goal Seek)**: Herramienta del KPI Tablero que permite calcular el valor de entrada necesario para alcanzar un resultado objetivo en una ficha de costo.

**Darian AI**: Asistente de inteligencia artificial integrado en el módulo de costos que responde preguntas, explica cálculos y sugiere optimizaciones en lenguaje natural.

**Fila Padre**: Fila de nivel superior en la estructura de árbol de una ficha de costo que agrupa y totaliza los valores de las filas hija asociadas.

**Fila Hija**: Fila subordinada dentro de una sección que contiene un costo individual y cuyo valor se acumula en la fila padre correspondiente.

**Forma de Cálculo FIJO**: Método de cálculo donde el usuario ingresa manualmente un valor numérico estático en la celda de la fila.

**Forma de Cálculo FORMULA**: Método de cálculo que evalúa una expresión matemática escrita por el usuario, soportando operadores aritméticos y las funciones ref() y vh().

**Forma de Cálculo PRORRATEO**: Método de cálculo que distribuye un costo indirecto de forma proporcional entre varias filas según una base de distribución definida.

**Forma de Cálculo ANEXO**: Método de cálculo que importa un valor desde una celda específica de un anexo (tabla complementaria) de la ficha de costo.

**Modo Experto**: Vista completa del editor de fichas con acceso a todas las columnas, fórmulas, herramientas de edición y funciones avanzadas del sistema.

**Modo Asistido**: Vista simplificada del editor que guía al usuario paso a paso con asistentes para la entrada de datos en fichas de costo.

**Lectura Narrativa**: Modo de visualización que presenta la ficha de costo como un documento de lectura fluida, mostrando los costos en formato descriptivo.

**Vistazo**: Modo de visualización compacto que muestra únicamente los totales y valores clave de cada sección sin desglose de detalles.

**Modo Auditoría**: Vista que despliega el historial completo de cambios de una ficha, mostrando valores anteriores, fechas de modificación y usuario responsable.

**Stock Disponible**: Cantidad de unidades de un producto listas para la venta en una tienda determinada.

**Stock Mínimo**: Umbral configurado por producto que, al ser alcanzado o superado, genera una alerta de reposición en el sistema.

**Ajuste de Inventario**: Corrección manual registrada para modificar la cantidad de stock de un producto, con motivo y autorización documentada.

**Recepción**: Proceso de ingreso de mercancía al inventario de una tienda, registrado con fecha, proveedor, cantidades recibidas y documentos de referencia.

**Transferencia**: Movimiento de productos entre dos tiendas del sistema, que decrementa el stock en la tienda de origen e incrementa en la tienda de destino.

**Conteo**: Verificación física del inventario existente en una tienda, donde se comparan las cantidades reales con las registradas en el sistema.

**Índice de Precios**: Valor numérico que representa el nivel de precios de un conjunto de productos en un período determinado, utilizado como referencia para análisis de variaciones.

**Variación**: Cambio porcentual o absoluto en el precio de un producto entre dos períodos, calculado y registrado por el módulo IPV.

**Recibo de Ingreso**: Documento generado en el módulo IPV que registra el ingreso de mercancía con los datos de precio aplicado en el momento de la recepción.

**SC-204**: Formato estándar de comunicación de inventario utilizado para la exportación de datos de recepción hacia sistemas externos.

**Conciliación**: Proceso de verificación y ajuste entre los registros internos de precios del sistema IPV y los datos de fuentes externas o documentos de referencia.

**Coeficiente**: Factor numérico de ajuste aplicable a los anexos I y II de una ficha de costo para calibrar los valores importados desde las tablas de referencia.
