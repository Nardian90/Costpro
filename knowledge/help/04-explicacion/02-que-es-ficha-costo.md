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

![Editor de fichas de costo con las secciones de gastos materiales, salario directo y estructura completa](/help/capturas/fichas-costo-gestion.webp "Figura 1. Ficha de Costo en el editor — secciones y filas del costo")

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

## El método de costeo de CostPro

La ficha de CostPro sigue el esquema de **costeo absorbente**: incluye materiales, mano de obra y gastos indirectos hasta llegar al costo total, más el margen. Además, el **Costeo Dinámico** recalcula el costo de reposición absorbiendo servicios, comisiones y la tasa de cambio vigente.

| Componente | Qué incluye | Ejemplo |
|-----------|-------------|---------|
| **Materiales** | Insumos directos del producto. | Harina, huevos, azúcar. |
| **Mano de obra** | Trabajo aplicado a la elaboración. | Horas del pastelero. |
| **Gastos indirectos** | Electricidad, depreciación, embalaje. | Costo proporcional del horno. |

> 💡 **Para personas mayores**: No se asuste por la terminología. La ficha le va pidiendo cada componente con ejemplos; si duda, use el **modo asistido**.

## El motor de cálculo de CostPro

CostPro tiene un **motor de cálculo avanzado** que le permite:

### 1. Usar fórmulas
En lugar de escribir números fijos, puede escribir fórmulas que se calculan solas dentro de la ficha.
- `ref("12.1") * 0.3` → toma el valor de otra fila de la ficha y le aplica un factor.
- Si cambia un valor de origen, las filas que lo referencian se recalculan en cadena dentro de la misma ficha.

### 2. Anexos (I, II, III, IV…)
Anexos con numeración romana para detallar cálculos auxiliares:
- Anexo I: detalle de costos de empaque.
- Anexo II: depreciación de equipos.
- etc.

Las fórmulas pueden referenciar totales de anexos (por ejemplo `AnexoI`).

### 3. Auditoría automática
Cada cambio en la ficha queda registrado:
- Quién lo cambió.
- Cuándo.
- Qué cambió (antes → después).

### 4. Solver (Goal Seek)
Herramienta que resuelve el problema inverso: en lugar de *"dame el costo para este precio"*, pregunta *"¿qué cantidad debo producir para que el costo unitario sea X?"*.

### 5. Firmas y aprobaciones
La ficha incluye bloques de **Firmas** ("Elaborado por" / "Aprobado por", obligatorios) para dejar constancia de los responsables del documento.

## Los modos de visualización

CostPro le permite ver una ficha de costo de varias maneras, según su necesidad:

| Modo | Para qué sirve |
|------|----------------|
| **Resumen** | Vista compacta de los datos clave. |
| **Completo (editor por secciones)** | El editor completo: plantillas, datos generales, estructura y anexos. |
| **Asistido** | Wizard paso a paso con diagramas. Para principiantes. |
| **Informe** | Narrativa del costo, explicado en palabras. Para presentar a clientes. |
| **Vistazo** | Lectura rápida de los totales. |
| **Auditoría** | Resalta los cambios recientes (antes → después). Para revisión. |

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

**¿Qué pasa si cambian los costos de los insumos? ¿Se ajustan los precios solos?**
- El sistema no usa un índice de precios externo para indexar fichas.
- Lo que sí hace: el **Costeo Dinámico** (OPERACIÓN → Costo) recalcula el costo de reposición absorbiendo servicios, comisiones y la tasa de cambio vigente; usted simula los nuevos precios y confirma cuándo aplicarlos.

**¿Las fichas de costo son obligatorias?**
- No, son opcionales. Puede operar CostPro sin usarlas.
- Pero si su negocio fabrica productos, son **muy recomendables** para no perder dinero.

**¿Cómo aprendo a usar el motor de fórmulas?**
- Empiece por el modo asistido, que no requiere fórmulas.
- Cuando se sienta cómodo, lea la documentación de fórmulas en el módulo de Costos.
- Use el asistente IA Darian para que le ayude a construir fórmulas.
