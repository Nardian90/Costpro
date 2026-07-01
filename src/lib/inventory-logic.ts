/**
 * Lógica de Ajuste de Inventario y Costo Promedio Ponderado
 */

export interface AdjustmentInput {
  stock_actual: number;
  costo_total_actual: number;
  ajuste_unidades: number;
  ajuste_valor_unitario?: number; // Opcional: Nuevo costo propuesto por el usuario
}

export interface AdjustmentResult {
  nuevo_stock: number;
  nuevo_costo_total: number;
  nuevo_costo_unitario: number;
}

/**
 * Calcula los nuevos valores de stock e inventario basándose en las reglas de Costo Promedio.
 *
 * @param input Valores actuales y ajustes propuestos
 * @returns Resultados con nuevo stock, costo total y costo unitario promedio
 */
export function calcularAjusteInventario(input: AdjustmentInput): AdjustmentResult {
  const { stock_actual, costo_total_actual, ajuste_unidades, ajuste_valor_unitario } = input;

  // 1. Cálculo de Nuevo Stock (con límite en 0)
  // Define si permites stock negativo o si el límite es 0: En este caso, limitamos a 0.
  const nuevo_stock = Math.max(0, stock_actual + ajuste_unidades);

  // 2. Determinar el costo unitario a utilizar para el ajuste
  const costo_unitario_promedio_actual = stock_actual > 0 ? costo_total_actual / stock_actual : 0;

  let nuevo_costo_total = costo_total_actual;

  if (ajuste_unidades < 0) {
    // CASO: Reducción de Stock (Salida)
    const unidades_a_retirar = Math.abs(ajuste_unidades);

    // Si el usuario no toca el costo, usamos el promedio (Cálculo de Salida Estándar)
    // Si se provee ajuste_valor_unitario, usamos ese valor (Re-valuación)
    const costo_unitario_salida = ajuste_valor_unitario !== undefined
      ? ajuste_valor_unitario
      : costo_unitario_promedio_actual;

    const costo_salida_total = unidades_a_retirar * costo_unitario_salida;

    nuevo_costo_total = Math.max(0, costo_total_actual - costo_salida_total);
  } else if (ajuste_unidades > 0) {
    // CASO: Incremento de Stock (Entrada)
    const unidades_a_sumar = ajuste_unidades;

    // Si no se provee costo, se asume $0 (Dilución de costo - Caso C)
    const costo_unitario_entrada = ajuste_valor_unitario !== undefined
      ? ajuste_valor_unitario
      : 0;

    const costo_entrada_total = unidades_a_sumar * costo_unitario_entrada;

    nuevo_costo_total = costo_total_actual + costo_entrada_total;
  } else if (ajuste_valor_unitario !== undefined) {
    // CASO: Ajuste de solo valor (re-valuación sin cambio de stock)
    nuevo_costo_total = stock_actual * ajuste_valor_unitario;
  }

  // 3. Guardrail Crítico: Prohibición de Unidades Cero con Valor Positivo
  // No puede quedar un stock de 0 unidades con un importe mayor a $0.
  if (nuevo_stock === 0) {
    nuevo_costo_total = 0;
  }

  // 4. Cálculo de Nuevo Costo Unitario Promedio
  const nuevo_costo_unitario = nuevo_stock > 0 ? nuevo_costo_total / nuevo_stock : 0;

  return {
    nuevo_stock,
    nuevo_costo_total,
    nuevo_costo_unitario
  };
}
