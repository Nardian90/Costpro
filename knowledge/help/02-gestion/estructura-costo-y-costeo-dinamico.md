# Referencia: Estructura de Costo y Costeo Dinámico

> **Necesita esto cuando**: Quiere entender de qué se compone el costo de un producto o simular cómo cambia con la tasa de cambio.

## Estructura de Costo

### Qué es

La vista **Estructura de Costo** muestra la **composición del costo** de cada producto: cuánto aporta cada componente —costo base, transportación, manipulación, comisiones, servicios y variación cambiaria— al costo final.

### Dónde está

```
Operación → Costo → Estructura de Costo
```

### Para qué sirve

- Analizar qué parte del costo es materia prima y qué parte es logística o cambiaria.
- Detectar productos cuyo costo depende demasiado de un solo componente.
- Sustentar decisiones de precio con datos.

### Qué muestra

Una tabla con los productos de la **tienda activa** y el desglose de sus componentes de costo. Seleccione una tienda para poblar la tabla; si no hay productos, la vista lo indica.

![Vista Estructura de Costo con el desglose por producto: existencia, costo unitario, transportación, manipulación, comisiones y variación cambiaria](/help/capturas/ficha-costo-editor.webp "Figura 1. Estructura de Costo — desglose de componentes por producto")

---

## Costeo Dinámico

### Qué es

La vista **Costeo Dinámico** calcula el **costo real de reposición** de cada producto absorbiendo los servicios (transporte, manipulación, seguro, aduana), las comisiones y el **impacto cambiario** actual.

### Dónde está

```
Operación → Costo → Costeo Dinámico
```

### Para qué sirve

- Saber cuánto costaría **volver a comprar** cada producto hoy, con la tasa de cambio vigente.
- Decidir aumentos de precio con base en el costo de reposición, no en el costo histórico.
- Simular escenarios: *"¿qué pasa con mis costos si el dólar sube a X?"*

![Vista de Costeo Dinámico con el costo real de reposición del inventario](/help/capturas/costeo-dinamico.webp "Figura 2. Costeo Dinámico — costo de reposición con la tasa vigente")

### Cómo usarla

1. Seleccione la tienda activa (la vista lo indica si no hay tienda seleccionada).
2. Revise la tabla de productos con sus costos dinámicos.
3. Use el campo **"Tasa a simular (CUP/USD)"** para probar un escenario cambiario.
4. La simulación **no modifica datos reales**: es una proyección.
5. Si el resultado le sirve como base, use **"Confirmar actualización"** para aplicar los valores; puede **"Restablecer"** o **"Limpiar filtro"** en cualquier momento.

### Precauciones

- La simulación es segura; **confirmar** una actualización **sí modifica** datos. Revise antes de confirmar.
- La tasa simulada afecta la proyección completa: pruebe con valores razonables.

## Preguntas frecuentes

**¿Estas vistas cambian las fichas de costo?**
- No directamente: son análisis sobre los costos. Las fichas se editan en **Fichas de Costo** (`Operación → Costo → Fichas de Costo`).

**¿De dónde salen los servicios que absorbe el costeo dinámico?**
- De los **Servicios Recibidos** registrados en la operación de la tienda (transporte, manipulación, seguro, aduana).
