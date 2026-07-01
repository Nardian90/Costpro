# Explicación: ¿Qué es una Ficha de Costo?

> **Lea esto cuando**: Quiere entender qué es una ficha de costo, para qué sirve y por qué es el corazón del módulo de Costos.

## La pregunta básica: ¿a cuánto me sale?

Imagine que usted hace pasteles y los vende. Un cliente le pregunta: *"¿A cuánto me sale un pastel de chocolate para 20 personas?"*. Usted necesita saber el precio, pero ¿cómo lo calcula?

Para hacer el pastel, usted compró:
- Harina: 1 kg a 2 pesos el kg.
- Azúcar: 500 g a 1.5 pesos el kg.
- Huevos: 6 unidades a 0.20 pesos cada uno.
- Chocolate: 200 g a 5 pesos el kg.
- Electricidad del horno: estimado 1 peso.
- Su tiempo: 2 horas de trabajo.

Y encima quiere ganar algo, así que necesita agregar un margen de ganancia.

Una **ficha de costo** es exactamente eso: un documento donde se anota **todo lo que cuesta hacer un producto**, se suma, y se le agrega el margen para llegar al precio de venta.

## Componentes de una ficha de costo

Una ficha de costo bien hecha tiene **4 secciones**:

### 1. Materiales directos
Todo lo que se "ve" en el producto final. En el pastel:
- Harina, azúcar, huevos, chocolate.
- Para cada uno: cantidad usada, precio unitario, subtotal.

### 2. Mano de obra directa
El tiempo que alguien invierte en hacer el producto, valorizado.
- 2 horas del pastelero.
- Si el pastelero gana 5 pesos la hora, son 10 pesos.

### 3. Gastos indirectos de fabricación
Costos que no se pueden atribuir a un solo producto, pero que son necesarios.
- Electricidad del horno (estimada).
- Depreciación de los equipos.
- Limpieza de la cocina.
- Alquiler del local (parte proporcional).

### 4. Margen de ganancia
El porcentaje que usted quiere ganar sobre el costo total.
- Si el costo total es 25 pesos y quiere ganar 20%, agrega 5 pesos.
- Precio de venta final: 30 pesos.

## ¿Por qué es tan importante?

### Para no perder dinero
Si usted calcula mal el costo y vende por debajo del costo real, está perdiendo dinero en cada venta sin darse cuenta. Esto es **la causa #1 de quiebra** en pequeños negocios.

### Para fijar precios justos
Si calcula bien el costo, puede fijar precios que sean:
- **Rentables**: ganancia suficiente para vivir.
- **Competitivos**: no tan caros que ahuyenten clientes.
- **Consistentes**: el mismo producto siempre al mismo precio (no cambia según el humor).

### Para detectar ineficiencias
Si su pastel de chocolate le cuesta 25 pesos y el de la competencia 18, algo está mal. La ficha de costo le permite ver dónde está la diferencia:
- ¿Compra la harina más cara?
- ¿Tarda más tiempo en hacerlo?
- ¿Gasta mucha electricidad?

### Para justificar precios ante el cliente
Si un cliente le dice *"¿por qué tan caro?"*, usted puede mostrarle la ficha de costo y explicar:
- *"Los materiales cuestan 12 pesos, mi trabajo 8, los gastos 5. Total de costo: 25 pesos. Le vendo a 30 para ganar 5."*

El cliente entiende y respeta el precio.

## Las 6 formas de calcular el costo (métodos)

CostPro soporta 6 métodos de cálculo, dependiendo del tipo de negocio:

| Método | Cuándo usarlo | Ejemplo |
|--------|---------------|---------|
| **Costeo absorbente** | Quando quieres incluir todos los costos (materiales + mano de obra + indirectos). | Manufactura tradicional. |
| **Costeo directo** | Cuando solo quieres materiales + mano de obra (sin indirectos). | Servicios simples. |
| **Costeo por actividad (ABC)** | Cuando quieres mucha precisión y asignar costos por actividad. | Empresas grandes. |
| **Costeo estándar** | Cuando usas costos promedio predefinidos y comparas con lo real. | Producción repetitiva. |
| **Costeo por orden** | Cuando cada trabajo es único y se costea aparte. | Construcción, proyectos. |
| **Costeo por proceso** | Cuando produces en serie y el costo se promedia. | Alimentos, bebidas. |

> 💡 **Para personas mayores**: No se asuste por los 6 métodos. El más usado en pequeños negocios es el **costeo absorbente**. Si no sabe cuál usar, empiece por ese.

## El motor de cálculo de CostPro

CostPro tiene un **motor de cálculo avanzado** que le permite:

### 1. Usar fórmulas
En lugar de escribir números fijos, puede escribir fórmulas que se calculan solas.
- `=ref("harina_precio_kg") * 1.5` → multiplica el precio de la harina por la cantidad usada.
- Si cambia el precio de la harina, todas las fichas que la usan se actualizan automáticamente.

### 2. Referenciar otras fichas
Si usted hace "Bizcocho base" como insumo para varios pasteles, puede referenciar el costo del bizcocho desde las otras fichas. Si el bizcocho cambia de precio, todas las fichas se actualizan.

### 3. Anexos (I, II, III, IV, V, VI, VII, VIII, IX, X)
Hasta 10 anexos por ficha para detallar cálculos auxiliares:
- Anexo I: detalle de costos de empaque.
- Anexo II: depreciación de equipos.
- etc.

### 4. Auditoría automática
Cada cambio en la ficha queda registrado:
- Quién lo cambió.
- Cuándo.
- Qué cambió (antes → después).

### 5. Solver (Goal Seek)
Herramienta que resuelve el problema inverso: en lugar de *"dame el costo para este precio"*, pregunta *"¿qué cantidad debo producir para que el costo unitario sea X?"*.

### 6. Firmas digitales
Para fichas críticas, se pueden requerir firmas digitales del supervisor y del contador. Así nadie puede modificar la ficha sin autorización.

## Los 5 modos de visualización

CostPro le permite ver una ficha de costo de 5 maneras diferentes, según su necesidad:

| Modo | Para qué sirve |
|------|----------------|
| **Tabla principal** | Vista normal, con todas las secciones. |
| **Modo asistido** | Wizard paso a paso con diagramas. Para principiantes. |
| **Modo lectura** | Narrativa del costo, explicado en palabras. Para presentar a clientes. |
| **Modo experto** | Vista en columnas paralelas, para comparar variantes. |
| **Modo auditoría** | Resalta los cambios recientes. Para revisión. |

> 💡 **Recomendación para personas mayores**: Use el **modo asistido**. Le va guiando paso a paso con explicaciones en lenguaje sencillo.

## Preguntas frecuentes

**¿Cada producto necesita una ficha de costo?**
- No. Solo los productos que usted **fabrica** o **transforma**.
- Los productos que compra y vende sin transformar (ej: un refresco que compra a 1 peso y vende a 1.50) no necesitan ficha. Solo necesita el precio de compra y el precio de venta en el catálogo.

**¿Cada cuánto debo actualizar una ficha de costo?**
- Cuando los precios de los insumos cambian significativamente.
- Mínimo: cada 3 meses.
- Ideal: cada mes, antes de cerrar la contabilidad.

**¿Qué pasa si una ficha de costo cambia, las ventas pasadas se recalculan?**
- No. Las ventas pasadas quedaron registradas con el precio de venta de ese momento.
- La ficha nueva aplica solo a las próximas ventas.

**¿Puedo tener varias fichas para el mismo producto?**
- Sí, en el **Arena FC** (módulo de comparación). Sirve para simular qué pasaría si cambia algún insumo o algún proceso.
- La ficha "oficial" es una sola.

**¿Qué es el "índice de precios" (IPV) y cómo se relaciona?**
- El IPV mide cómo cambian los precios en el tiempo a nivel macroeconómico.
- CostPro puede usar el IPV para **indexar** automáticamente los precios de las fichas.
- Si el IPV sube 5% en el mes, las fichas se ajustan automáticamente.
- Ver: *Explicación: ¿Qué es el IPV?* para más detalles.

**¿Las fichas de costo son obligatorias?**
- No, son opcionales. Puede operar CostPro sin usarlas.
- Pero si su negocio fabrica productos, son **muy recomendables** para no perder dinero.

**¿Cómo aprendo a usar el motor de fórmulas?**
- Empiece por el modo asistido, que no requiere fórmulas.
- Cuando se sienta cómodo, lea la documentación de fórmulas en el módulo de Costos.
- Use el asistente IA Darian para que le ayude a construir fórmulas.
