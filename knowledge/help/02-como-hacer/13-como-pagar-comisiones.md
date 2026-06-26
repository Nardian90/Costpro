# Cómo Hacer: Pagar Comisiones a Trabajadores

> **Necesita esto cuando**: Tiene trabajadores (cajeros, vendedores) que ganan comisión por ventas y debe calcular cuánto pagarles al final del período.

## ¿Qué es una comisión?

Una comisión es un **porcentaje de las ventas** que se le paga al trabajador como incentivo. Por ejemplo: si un cajero vende 1000 pesos en el mes y su comisión es del 3%, gana 30 pesos extra en su salario.

CostPro lleva el control automático de:

- **Quién vendió qué**: cada venta queda registrada con el usuario que la cobró.
- **Cuánto vendió cada uno en el período**: ventas totales por trabajador.
- **Qué comisión le corresponde**: según el porcentaje configurado para ese trabajador.
- **Qué ventas fueron anuladas**: las anuladas no cuentan para comisión.

## Paso 1 — Configurar el porcentaje de comisión de cada trabajador (primera vez)

1. Vaya a **Multi-Tienda → Trabajadores y Comisiones**.
2. Verá una lista con todos los trabajadores de la tienda.
3. Haga clic en el trabajador que quiere configurar.
4. En el campo **"% Comisión"**, escriba el porcentaje (ej: 3 para 3%).
5. Haga clic en **"Guardar"**.

> 💡 **Consejo**: Configure las comisiones al inicio, cuando contrata al trabajador. No las cambie en medio del período porque el cálculo se vuelve confuso.

## Paso 2 — Al final del período, ir al módulo

1. Vaya a **Multi-Tienda → Trabajadores y Comisiones**.
2. Verá un panel con dos pestañas:
   - **Resumen**: totales por trabajador.
   - **Detalle**: ventas individuales de cada trabajador.

## Paso 3 — Elegir el período a pagar

1. Arriba, en los campos de fecha, elija:
   - **Desde**: primer día del período (ej: 1ro del mes).
   - **Hasta**: último día del período (ej: último día del mes).
2. Haga clic en **"Calcular"**.
3. El sistema procesa y muestra los resultados.

## Paso 4 — Revisar el resumen por trabajador

Verá una tabla como esta:

| Trabajador | Ventas totales | Ventas anuladas | Ventas válidas | % Comisión | Comisión a pagar |
|------------|----------------|-----------------|----------------|------------|------------------|
| Juan Pérez | 5,200 CUP | 100 CUP | 5,100 CUP | 3% | 153 CUP |
| María López | 8,400 CUP | 200 CUP | 8,200 CUP | 3% | 246 CUP |
| Carlos Ruiz | 3,100 CUP | 0 CUP | 3,100 CUP | 2% | 62 CUP |

**Columnas explicadas:**

- **Ventas totales**: todo lo que cobró el trabajador, incluyendo anuladas.
- **Ventas anuladas**: lo que se anuló después (no cuenta para comisión).
- **Ventas válidas**: totales menos anuladas. Es la base para calcular comisión.
- **% Comisión**: el porcentaje configurado en el paso 1.
- **Comisión a pagar**: ventas válidas × % comisión. Es lo que hay que pagarle.

## Paso 5 — Revisar el detalle (opcional pero recomendado)

1. Haga clic en la pestaña **"Detalle"**.
2. Seleccione un trabajador en el desplegable de arriba.
3. Verá todas sus ventas del período:
   - Folio, fecha, monto, método de pago, estado.
4. Verifique que las ventas sean correctas.
5. Si ve alguna venta que no debería contar (por ejemplo, una venta grande a un familiar que se hizo para inflar comisión), puede **excluirla** marcando la casilla "Excluir".

## Paso 6 — Generar el reporte de comisiones

1. Vuelva a la pestaña **"Resumen"**.
2. Haga clic en **"Generar reporte de comisiones"** (arriba a la derecha).
3. Elija el formato: PDF o Excel.
4. Se descarga el reporte con:
   - Los totales por trabajador.
   - El detalle de cada venta.
   - La firma del trabajador (espacio en blanco en PDF para firmar a mano).
   - La firma del encargado.

## Paso 7 — Imprimir y entregar

1. Imprima el reporte PDF.
2. Entréguelo a cada trabajador para que lo revise.
3. El trabajador debe firmar conforme está de acuerdo con el monto.
4. El encargado también firma.
5. Archive el reporte firmado para sus registros contables.

## Paso 8 — Marcar como pagado

1. En el sistema, vuelva a **Trabajadores y Comisiones**.
2. Seleccione el período que acaba de pagar.
3. Haga clic en **"Marcar como pagado"**.
4. Esto evita que ese período se vuelva a calcular por error en el futuro.

---

## Preguntas frecuentes

**¿Las devoluciones afectan la comisión?**
- Sí. Si una venta se anula, no cuenta para comisión.
- Si ya pagó la comisión y después se anula la venta, no se puede "descontar" automáticamente. Tendrá que descontarlo del próximo pago.

**¿Puedo tener diferentes porcentajes para diferentes productos?**
- Sí, en la configuración avanzada puede asignar % por categoría o por producto.
- Por ejemplo: 5% en electrónica, 2% en alimentos.

**¿Qué pasa si un trabajador tiene dos tiendas?**
- Las comisiones se calculan por separado para cada tienda.
- Genere el reporte para cada tienda donde trabajó.

**¿Las horas extra afectan la comisión?**
- No. Las comisiones son por ventas. Las horas extra se pagan aparte en nómina.
- CostPro no maneja nómina, solo comisiones por venta.

**¿Puedo pagar comisiones por períodos más cortos (quincenal)?**
- Sí. En el paso 3, elija las fechas de la quincena (1-15 o 16-fin de mes).
- Calcule, genere el reporte y pague.

**¿Cómo evito fraudes en las comisiones?**
- Configure que ventas de más de X monto requieren autorización de supervisor.
- Revise siempre el detalle antes de pagar.
- Esté atento a trabajadores con picos anómalos de ventas en el último día del período.
- Compare el % de ventas anuladas por trabajador. Si uno anula muy poco y otro mucho, investigue.

**¿Las comisiones se registran en la contabilidad automáticamente?**
- No. CostPro calcula y genera el reporte, pero el registro contable lo hace el contador aparte.
- El reporte PDF es el documento fuente para el asiento contable.
