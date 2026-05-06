import { Product, IntelligentReceipt, CostTrace } from '../dexie';

export type CostEngineMode = 'PERCENTAGE' | 'TARGET_PROFIT';

export interface CostEngineConfig {
  type: CostEngineMode;
  value: number; // Porcentaje (0.6) o Monto Utilidad (cents)
  usuario_id: string;
}

export interface CostValidationResult {
  isValid: boolean;
  message?: string;
  type: 'WARNING' | 'ERROR' | 'INFO';
}

/**
 * Motor de Cálculo de Costos IPV
 * Basado en la regla de normalización a UNIT.
 */
export function calculateCosts(
  receipts: IntelligentReceipt[],
  products: Product[],
  config: CostEngineConfig
): IntelligentReceipt[] {
  const productMap = new Map<string, Product>();
  products.forEach(p => productMap.set(p.cod, p));

  // 1. Normalización y obtención de precios de venta en UNIT
  const units = receipts.map(r => {
    const product = productMap.get(r.product_id);
    if (!product) throw new Error(`Producto no encontrado: ${r.product_id}`);

    // Obtener factor de conversión a UNIT
    let factor = 1;
    if (r.level === 'BOX') factor = product.unit_factor || 1;
    else if (r.level === 'PACK') factor = product.contenido_paquete || 1;

    const precioVentaUnitarioCents = product.precio_cents; // El precio en el catálogo suele ser por la unidad mínima o la unidad de la entrada?
    // Según requerimiento: "El costo SIEMPRE se define en el nivel de menor descomposición (UNIT)"
    // Asumimos que product.precio_cents es el precio de VENTA de 1 UNIT.

    return {
      receipt: r,
      product,
      factor,
      totalUnits: r.quantity * factor,
      ventaTotalCents: r.quantity * (r.level === 'UNIT' ? product.precio_cents : (product.precio_cents * factor)) // Simplificado: total_units * precio_unit
    };
  });

  const totalVentaGlobalCents = units.reduce((sum, u) => sum + u.ventaTotalCents, 0);

  const results: IntelligentReceipt[] = [];

  if (config.type === 'PERCENTAGE') {
    units.forEach(u => {
      const costoUnitarioCents = Math.round(u.product.precio_cents * config.value);
      const costoNivelCents = costoUnitarioCents * u.factor;

      results.push({
        ...u.receipt,
        costo_unitario_cents: costoNivelCents,
        costo_total_cents: costoNivelCents * u.receipt.quantity,
        cost_trace: {
          metodo: 'PERCENTAGE',
          parametro: config.value,
          timestamp: Date.now(),
          usuario_id: config.usuario_id
        }
      });
    });
  } else if (config.type === 'TARGET_PROFIT') {
    // FIX-LOG-018: Guard against division by zero when total ventas is 0
    if (totalVentaGlobalCents === 0) {
      return []; // No cost distribution possible with zero sales
    }
    const costoTotalPermitidoCents = totalVentaGlobalCents - config.value;

    units.forEach(u => {
      const peso = u.ventaTotalCents / totalVentaGlobalCents;
      const costoTotalProductoCents = Math.round(costoTotalPermitidoCents * peso);
      const costoUnitarioNivelCents = Math.round(costoTotalProductoCents / u.receipt.quantity);

      results.push({
        ...u.receipt,
        costo_unitario_cents: costoUnitarioNivelCents,
        costo_total_cents: costoTotalProductoCents,
        cost_trace: {
          metodo: 'TARGET_PROFIT',
          parametro: config.value,
          timestamp: Date.now(),
          usuario_id: config.usuario_id
        }
      });
    });
  }

  return results;
}

export function validateMargins(receipts: IntelligentReceipt[], products: Product[]): CostValidationResult[] {
  const productMap = new Map<string, Product>();
  products.forEach(p => productMap.set(p.cod, p));
  const results: CostValidationResult[] = [];

  receipts.forEach(r => {
    if (r.costo_unitario_cents === undefined) return;

    const product = productMap.get(r.product_id);
    if (!product) return;

    let factor = 1;
    if (r.level === 'BOX') factor = product.unit_factor || 1;
    else if (r.level === 'PACK') factor = product.contenido_paquete || 1;

    const ventaUnitarioNivelCents = product.precio_cents * factor;
    const costoUnitarioNivelCents = r.costo_unitario_cents;

    // FIX-LOG-002: Guard against division by zero when precio venta is 0
    if (ventaUnitarioNivelCents === 0) {
      results.push({ isValid: false, type: 'ERROR', message: 'El precio de venta es 0 — no se puede calcular margen' });
      return;
    }
    const margenCents = ventaUnitarioNivelCents - costoUnitarioNivelCents;
    const margenPercent = margenCents / ventaUnitarioNivelCents;

    if (margenCents < 0) {
      results.push({
        isValid: false,
        type: 'ERROR',
        message: `Margen negativo en ${product.descripcion} (${r.level}): ${margenCents / 100} Pesos`
      });
    } else if (margenPercent < 0.10) {
      // FIX-LOG-003: Round to avoid floating-point display artifacts
      const displayPercent = Math.round(margenPercent * 1000) / 10;
      results.push({
        isValid: true,
        type: 'WARNING',
        message: `Margen bajo (<10%) en ${product.descripcion}: ${displayPercent}%`
      });
    }
  });

  return results;
}
