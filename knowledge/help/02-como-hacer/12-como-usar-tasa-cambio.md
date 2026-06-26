# Cómo Hacer: Usar la Inteligencia Cambiaria (Tasa Inteligente)

> **Necesita esto cuando**: Su negocio compra en dólares (USD) o euros (EUR) pero vende en pesos (CUP), y necesita saber qué tasa aplicar hoy para no perder dinero.

## ¿Qué es la "Inteligencia Cambiaria"?

En Cuba y otros países con doble moneda, el valor del dólar cambia todos los días (a veces varias veces al día). Si usted compra mercancía en USD y vende en CUP, **tiene que actualizar la tasa** constantemente, porque si usa una tasa vieja, puede estar perdiendo dinero sin darse cuenta.

La **Inteligencia Cambiaria** de CostPro es un módulo que:

- **Consulta automáticamente** la tasa oficial del día (Banco Central, mercado informal, etc.).
- **Sugiere** la tasa a aplicar en sus ventas y recepciones.
- **Le avisa** cuando la tasa cambia significativamente.
- **Mantiene el historial** de todas las tasas usadas, con fecha y hora.

## Paso 1 — Ir a Inteligencia Cambiaria

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Inteligencia Cambiaria** (a veces llamado "Tasa Inteligente").
3. Verá un panel con la tasa actual y un gráfico de cómo ha cambiado en los últimos días.

## Paso 2 — Entender la pantalla principal

El panel muestra:

### Tasa actual (arriba, en grande)
- **Moneda**: USD, EUR, etc.
- **Tasa oficial**: la que reporta el Banco Central.
- **Tasa de mercado**: la que se usa en el mercado informal (informalCADEC).
- **Tasa recomendada**: la que CostPro sugiere aplicar (calculada con un promedio inteligente).
- **Última actualización**: hace cuántos minutos se actualizó.

### Gráfico histórico (al centro)
- Línea que muestra cómo ha cambiado la tasa en los últimos 7, 30 o 90 días (puede cambiar el período).
- Pase el mouse sobre la línea para ver la tasa exacta de un día específico.

### Botones de acción (abajo)
- **Actualizar tasa ahora**: consulta las fuentes en tiempo real.
- **Aplicar tasa recomendada**: actualiza la tasa de la tienda con la sugerencia.
- **Aplicar tasa personalizada**: si quiere usar un valor diferente.

## Paso 3 — Actualizar la tasa

Recomendado hacer esto **cada mañana** antes de abrir la tienda:

1. Haga clic en **"Actualizar tasa ahora"**.
2. Espere 5 segundos. El sistema consulta las fuentes.
3. Verá la nueva tasa en la pantalla.
4. Si la tasa cambió más de un 5% desde ayer, verá un letrero amarillo: *"Cambio significativo detectado"*.

## Paso 4 — Aplicar la tasa a la tienda

1. Haga clic en **"Aplicar tasa recomendada"**.
2. Aparece una ventana de confirmación: *"¿Aplicar tasa X a todas las operaciones de hoy?"*.
3. Haga clic en **"Sí, aplicar"**.
4. La tasa queda activa para:
   - Recepciones de mercancía en moneda extranjera.
   - Cálculo de precios de venta (si la ficha de costo lo requiere).
   - Reportes consolidados en una sola moneda.

> ⚠️ **Importante**: La tasa se aplica desde el momento en que la confirma. Las ventas y recepciones **anteriores** no se recalculan. Cada operación queda registrada con la tasa que estaba activa en ese momento.

## Paso 5 — Usar una tasa personalizada (avanzado)

Si por algún motivo quiere usar una tasa diferente a la recomendada:

1. Haga clic en **"Aplicar tasa personalizada"**.
2. Escriba el valor numérico (ej: 320 para 1 USD = 320 CUP).
3. Escriba un motivo (obligatorio). Ej: *"Proveedor cobró en USD a tasa diferente"*.
4. Haga clic en **"Aplicar"**.

> ⚠️ **Auditoría**: Las tasas personalizadas quedan registradas con el usuario, la fecha y el motivo. El administrador puede revisar el historial.

## Paso 6 — Ver el historial de tasas

1. Haga clic en la pestaña **"Historial"** (arriba del panel).
2. Verá una tabla con todas las tasas aplicadas:
   - Fecha y hora.
   - Moneda.
   - Tasa.
   - Tipo (Oficial, Mercado, Recomendada, Personalizada).
   - Usuario que la aplicó.
   - Motivo (si fue personalizada).

## Paso 7 — Configurar alertas automáticas (recomendado)

1. Haga clic en el ícono de **engrane** (arriba a la derecha).
2. En la sección **Alertas**, configure:
   - **Cambio mínimo para alertar**: por defecto 5%. Si la tasa cambia más de eso, recibe notificación.
   - **Hora de actualización automática**: por defecto 8:00 AM. El sistema actualiza solo a esa hora.
   - **Fuentes a consultar**: marque las que quiera usar (Banco Central, mercado informal, etc.).
3. Haga clic en **"Guardar configuración"**.

---

## Preguntas frecuentes

**¿La tasa se aplica automáticamente cada día?**
- Sí, si activó "actualización automática" en el paso 7.
- Si no la activó, tiene que actualizar manualmente cada mañana.

**¿Qué pasa si olvido actualizar la tasa?**
- El sistema sigue usando la última tasa aplicada.
- Si la tasa real cambió mucho, usted puede estar vendiendo barato o caro sin saberlo.
- Por eso es importante actualizar cada día.

**¿La tasa del sistema es la "oficial" o la del "mercado informal"?**
- Puede elegir. Por defecto, CostPro usa un **promedio inteligente** entre varias fuentes, para ser realista.
- Pero usted puede aplicar la oficial o la informal si lo prefiere.

**¿Puedo tener tasas diferentes para comprar y vender?**
- Sí. En la configuración avanzada hay "tasa de compra" (la que usa al recibir mercancía) y "tasa de venta" (la que usa al calcular precios).
- Por defecto son la misma, pero pueden ser diferentes.

**¿El sistema usa la tasa para el reporte de ganancias?**
- Sí. El reporte de ganancias convierte todo a una sola moneda usando la tasa activa al momento del reporte.
- Si la tasa cambia entre dos reportes, los valores pueden variar un poco. Es normal.

**¿Puedo bloquear la tasa para que nadie la cambie?**
- Sí, el administrador puede bloquear la tasa con una nota: *"Tasa congelada hasta el 15 por acuerdo con el dueño"*.
- Hasta que pase la fecha o se quite el bloqueo, nadie puede cambiarla.
