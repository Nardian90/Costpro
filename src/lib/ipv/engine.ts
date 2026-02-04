import {
  type BankTransaction,
  type Product,
  type MatchingRule,
  type ReconciliationLine,
  db
} from '../dexie';
import { v4 as uuidv4 } from 'uuid';

/**
 * Genera un hash simple para idempotencia (SHA-256 es preferible, pero esto es síncrono y portable)
 */
export async function generateHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export interface MatchingResult {
  lines: ReconciliationLine[];
  status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE';
  logs: string[];
}

export class MatchingEngine {
  private products: Product[];
  private rules: MatchingRule[];
  private stockMap: Map<string, number> = new Map();
  private useStockLimit: boolean = false;

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);
    this.useStockLimit = this.rules.some(r => r.tipo === 'STOCK_LIMIT');

    // Inicializar mapa de inventario virtual para la sesión de matching
    for (const p of this.products) {
        this.stockMap.set(p.cod, p.stock_inicial_manual || 0);
    }
  }

  async matchTransaction(transaction: BankTransaction, current_reconciled_cents: number = 0): Promise<MatchingResult> {
    const logs: string[] = [];
    const targetAmount = transaction.importe_venta_cents || transaction.importe_cents;
    let remaining_cents = targetAmount - current_reconciled_cents;
    const lines: ReconciliationLine[] = [];

    logs.push(`Iniciando matching para transacción ${transaction.referencia_origen} (Importe: ${targetAmount} cts, Restante: ${remaining_cents} cts)`);

    // PASS 0: AUTO-COMPLETE DEBITS OR EXCLUDED (Commissions/Expenses/Excluded)
    if (transaction.tipo === 'Db' || transaction.estado_conciliacion === 'NO_PROCESAR') {
      logs.push(`PASS 0: Transacción ${transaction.tipo === 'Db' ? 'Débito' : 'Excluida'} auto-finalizada sin productos.`);
      return {
          lines: [],
          status: 'COMPLETO',
          logs
      };
    }

    // Intentar recuperación desde caché (sólo para PASS 2 EXACT_SUM)
    const catalogHash = await generateHash(JSON.stringify(this.products.map(p => ({ cod: p.cod, price: p.precio_cents }))));
    const cached = await db.matching_cache.get(targetAmount);
    if (cached && cached.catalog_hash === catalogHash) {
      logs.push(`Caché hit para importe ${targetAmount}`);
      for (const item of cached.results) {
        const product = this.products.find(p => p.cod === item.product_cod);
        if (product) {
          const line = await this.createLine(transaction, product, item.cantidad, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
        }
      }
      if (Math.abs(remaining_cents) < 0.001) {
        return { lines, status: 'COMPLETO', logs };
      }
    }

    // PASS 1: HARD_REF
    const hardRefRule = this.rules.find(r => r.tipo === 'HARD_REF');
    if (hardRefRule && remaining_cents > 0) {
      const matchedProduct = this.products.find(p => {
        // Si hay límite de stock, ignorar productos sin existencia
        if (this.useStockLimit && (this.stockMap.get(p.cod) || 0) <= 0) return false;

        return transaction.observaciones.includes(p.cod) ||
               transaction.observaciones.toLowerCase().includes(p.descripcion.toLowerCase());
      });

      if (matchedProduct) {
        let qty = Math.floor(remaining_cents / matchedProduct.precio_cents);

        // Ajustar cantidad al stock disponible si aplica
        if (this.useStockLimit) {
            const available = this.stockMap.get(matchedProduct.cod) || 0;
            qty = Math.min(qty, available);
        }

        if (qty > 0) {
          const line = await this.createLine(transaction, matchedProduct, qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
          logs.push(`PASS 1 (HARD_REF): Matched ${qty}x ${matchedProduct.descripcion}`);
        }
      }
    }

    // PASS 2: EXACT_SUM / EXACT_MATCH
    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    if (exactSumRule && remaining_cents > 0) {
      const combination = this.findExactCombination(remaining_cents);
      if (combination.length > 0) {
        // Guardar en caché
        await db.matching_cache.put({
          importe_cents: remaining_cents,
          catalog_hash: catalogHash,
          results: combination.map(c => ({ product_cod: c.product.cod, cantidad: c.qty })),
          updated_at: new Date().toISOString()
        });

        for (const item of combination) {
          const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
        }
        logs.push(`PASS 2 (EXACT_SUM): Encontrada combinación exacta`);
      }
    }

    // PASS 3: PRICE_FLEX (Ajuste táctico de precio)
    const priceFlexRule = this.rules.find(r => r.tipo === 'PRICE_FLEX');
    if (priceFlexRule && remaining_cents > 0) {
        const maxAbs = priceFlexRule.meta?.maxAbs || 10;
        const maxPercent = priceFlexRule.meta?.maxPercent || 20;

        // Intentamos encontrar un producto de categoría flexible que al añadirlo y ajustar su precio cierre el gap
        const flexProduct = this.products.find(p => {
            // Si hay límite de stock, ignorar productos sin existencia
            if (this.useStockLimit && (this.stockMap.get(p.cod) || 0) <= 0) return false;

            return p.categoria?.toLowerCase().includes('flexible') ||
                   p.categoria?.toLowerCase().includes('caramelo') ||
                   p.isWildcardCandidate;
        });

        if (flexProduct) {
            const basePrice = flexProduct.precio_cents;
            // Necesitamos cubrir 'remaining_cents'.
            // Si usamos 1 unidad de flexProduct, el nuevo precio sería remaining_cents.
            // Pero Price Flex suele actuar sobre un mismatch PEQUEÑO después de un match parcial.
            // Si remaining_cents es pequeño, podemos "vender" el producto flexible a ese precio.

            const adjustment = remaining_cents - basePrice;
            const maxPercentAbs = basePrice * (maxPercent / 100);

            if (adjustment > 0 && adjustment <= maxAbs && adjustment <= maxPercentAbs) {
                // El ajuste es válido
                const line = await this.createLine(transaction, flexProduct, 1, 'AUTO_MATCH', 'Transferencia');
                line.precio_unitario_cents = remaining_cents;
                line.importe_linea_cents = remaining_cents;
                    line.cuadre_cents = 0;
                    line.origen_dato = 'AUTO_MATCH';
                    // Nota: createLine usa el precio base del producto, aquí sobreescribimos
                    lines.push(line);
                    remaining_cents = 0;
                    logs.push(`PASS 3 (PRICE_FLEX): Ajustado precio de ${flexProduct.descripcion} de ${basePrice} a ${line.precio_unitario_cents}`);
            }
        }
    }

    // PASS 4: WILDCARDS (Productos estratégicos)
    const wildcardsRule = this.rules.find(r => r.tipo === 'WILDCARDS');
    if (wildcardsRule && remaining_cents > 0) {
        const wildcards = this.products
            .filter(p => p.isWildcardCandidate)
            .filter(p => !this.useStockLimit || (this.stockMap.get(p.cod) || 0) > 0)
            .sort((a,b) => b.precio_cents - a.precio_cents);

        for (const p of wildcards) {
            if (p.precio_cents <= remaining_cents && p.precio_cents > 0) {
                let qty = Math.floor(remaining_cents / p.precio_cents);

                if (this.useStockLimit) {
                    const available = this.stockMap.get(p.cod) || 0;
                    qty = Math.min(qty, available);
                }

                if (qty > 0) {
                    const line = await this.createLine(transaction, p, qty, 'AUTO_MATCH', 'Transferencia');
                    lines.push(line);
                    remaining_cents -= line.importe_linea_cents;
                    logs.push(`PASS 4 (WILDCARDS): Añadido ${qty}x ${p.descripcion} como comodín`);
                }
            }
        }
    }

    // PASS 5: TOLERANCE
    const toleranceRule = this.rules.find(r => r.tipo === 'TOLERANCE');
    if (toleranceRule && remaining_cents > 0 && toleranceRule.tolerancia_cents) {
      const candidateProducts = this.products
        .filter(p => !this.useStockLimit || (this.stockMap.get(p.cod) || 0) > 0)
        .sort((a,b) => b.precio_cents - a.precio_cents);

      for (const product of candidateProducts) {
        if (product.precio_cents <= 0) continue;

        // Buscamos la cantidad que más se acerque al importe restante
        let qty = Math.round(remaining_cents / product.precio_cents);
        if (qty <= 0) qty = 1;

        // Ajustar cantidad al stock disponible si aplica
        if (this.useStockLimit) {
            const available = this.stockMap.get(product.cod) || 0;
            qty = Math.min(qty, available);
        }

        if (qty <= 0) continue;

        const diff = Math.abs(remaining_cents - (product.precio_cents * qty));
        if (diff <= toleranceRule.tolerancia_cents) {
          const line = await this.createLine(transaction, product, qty, 'AUTO_MATCH', 'Transferencia');
          line.cuadre_cents = remaining_cents - (product.precio_cents * qty);
          // IMPORTANTE: El importe de la línea debe ser el total incluyendo el descuadre
          // para que el UI y los totales cuadren a 0.
          line.importe_linea_cents = remaining_cents;
          lines.push(line);
          remaining_cents = 0;
          logs.push(`PASS 5 (TOLERANCE): Matched ${qty}x ${product.descripcion} con cuadre de ${line.cuadre_cents}`);
          break;
        }
      }
    }

    // PASS 6: CASH_FILL (Justified with real products if possible)
    const cashFillRule = this.rules.find(r => r.tipo === 'CASH_FILL');
    if (cashFillRule && remaining_cents > 0) {
      const dailyLimit = cashFillRule.meta?.dailyLimitCents || Infinity;

      // Consultar cuánto se ha usado hoy en CASH_FILLER
      const usedToday = await db.reconciliation_lines
        .where('fecha_operacion').equals(transaction.fecha)
        .and(l => l.origen_dato === 'CASH_FILLER')
        .toArray()
        .then(lines => lines.reduce((sum, l) => sum + l.importe_linea_cents, 0));

      if (usedToday + remaining_cents > dailyLimit) {
        logs.push(`PASS 6 (CASH_FILL): Límite diario excedido. Saldo restante: ${remaining_cents} cts`);
      } else {
        // Justificación: Intentamos usar productos comodín primero para "disfrazar" el cash fill
        const wildcards = this.products
            .filter(p => p.isWildcardCandidate)
            .filter(p => !this.useStockLimit || (this.stockMap.get(p.cod) || 0) > 0)
            .sort((a,b) => b.precio_cents - a.precio_cents);

        for (const p of wildcards) {
          if (p.precio_cents <= remaining_cents && p.precio_cents > 0) {
            let qty = Math.floor(remaining_cents / p.precio_cents);

            if (this.useStockLimit) {
                const available = this.stockMap.get(p.cod) || 0;
                qty = Math.min(qty, available);
            }

            if (qty > 0) {
                const line = await this.createLine(transaction, p, qty, 'CASH_FILLER', 'Efectivo');
                lines.push(line);
                remaining_cents -= line.importe_linea_cents;
                logs.push(`PASS 6 (CASH_FILL): Justificado con ${qty}x ${p.descripcion}`);

                // Si después de esto queda un residuo pequeño, lo ajustamos con Price Flex automático sobre esta misma línea
                if (remaining_cents > 0 && remaining_cents < p.precio_cents * 0.5) {
                    line.precio_unitario_cents += Math.floor(remaining_cents / qty);
                    line.importe_linea_cents += remaining_cents;
                    remaining_cents = 0;
                    logs.push(`PASS 6 (CASH_FILL): Residuo ajustado en la línea de ${p.descripcion}`);
                }
            }
          }
        }

        if (remaining_cents > 0) {
            // REBAJA LOGIC: Usar un comodín y ajustar su precio (rebaja/ajuste) para cubrir el faltante exacto
            const fillerProduct = wildcards.find(p => !this.useStockLimit || (this.stockMap.get(p.cod) || 0) > 0)
                               || this.products.find(p => !this.useStockLimit || (this.stockMap.get(p.cod) || 0) > 0);

            if (fillerProduct) {
                const line = await this.createLine(transaction, fillerProduct, 1, 'CASH_FILLER', 'Efectivo');
                const diff = remaining_cents - fillerProduct.precio_cents;
                line.importe_linea_cents = remaining_cents;
                line.cuadre_cents = diff;
                lines.push(line);
                logs.push(`PASS 6 (CASH_FILL): Cubierto gap residual de ${remaining_cents} cts con ${fillerProduct.descripcion} (Ajuste: ${diff})`);
                remaining_cents = 0;
            }
        }
      }
    }

    const status = Math.abs(remaining_cents) < 0.001 ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE');

    return {
      lines,
      status,
      logs
    };
  }

  /**
   * Realiza una simulación de matching para un objetivo monetario arbitrario.
   */
  async matchSimulation(targetAmount: number): Promise<MatchingResult> {
    const mockTx: BankTransaction = {
      id: 'sim',
      fecha: new Date().toISOString().split('T')[0],
      referencia_corta: 'SIM',
      referencia_origen: 'SIM-' + Date.now(),
      observaciones: 'Simulación de matching',
      importe_cents: targetAmount,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: new Date().toISOString(),
      ingestion_hash: 'sim'
    };
    return this.matchTransaction(mockTx);
  }

  /**
   * Distribuye una diferencia de objetivo global entre varios días.
   * Útil para llegar a una meta mensual/semanal repartiendo el faltante como efectivo.
   * Implementa aleatoriedad para evitar una distribución plana sospechosa.
   */
  async distributeGlobalGoal(targetTotal: number, currentTotal: number, dates: string[]): Promise<ReconciliationLine[]> {
    const diff = targetTotal - currentTotal;
    if (diff <= 0 || dates.length === 0) return [];

    // Generar pesos aleatorios para cada día
    const weights = dates.map(() => 0.5 + Math.random());
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const lines: ReconciliationLine[] = [];
    let remainingTotal = diff;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const weight = weights[i];
      // Para el último día, usamos exactamente lo que falta para asegurar que cuadre perfecto
      const targetForDay = (i === dates.length - 1)
        ? remainingTotal
        : Math.floor((diff * weight) / totalWeight);

      if (targetForDay <= 0) continue;

      // Usar findExactCombination para encontrar productos reales que sumen el objetivo del día
      const combination = this.findExactCombination(targetForDay);

      if (combination.length > 0) {
        for (const item of combination) {
            const line = await this.createLine(
                { fecha: date, referencia_origen: `GOAL-${date}` } as any,
                item.product,
                item.qty,
                'CASH_FILLER',
                'Efectivo'
            );
            lines.push(line);
            remainingTotal -= line.importe_linea_cents;
        }
      } else {
        // FALLBACK: Si no encuentra combinación exacta, usamos un producto comodín o el de mayor precio
        // y ajustamos su precio para cubrir el objetivo del día.
        const filler = this.products.find(p => p.isWildcardCandidate) || this.products[0];
        if (filler) {
            const line = await this.createLine(
                { fecha: date, referencia_origen: `GOAL-${date}` } as any,
                filler,
                1,
                'CASH_FILLER',
                'Efectivo'
            );
            line.importe_linea_cents = targetForDay;
            line.cuadre_cents = targetForDay - filler.precio_cents;
            lines.push(line);
            remainingTotal -= targetForDay;
        }
      }
    }

    return lines;
  }

  private async createLine(
    transaction: BankTransaction,
    product: Product,
    qty: number,
    origen: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER',
    clasificacion: 'Transferencia' | 'Efectivo' | 'QR'
  ): Promise<ReconciliationLine> {
    // Business Rule: Never match with zero stock if STOCK_LIMIT is active
    if (this.useStockLimit && (this.stockMap.get(product.cod) || 0) <= 0) {
        throw new Error(`Business Rule Violation: Product ${product.cod} has no stock but matching was attempted.`);
    }

    const importe = product.precio_cents * qty;

    // Descontar del inventario virtual de la sesión si aplica
    if (this.useStockLimit) {
        const current = this.stockMap.get(product.cod) || 0;
        this.stockMap.set(product.cod, Math.max(0, current - qty));
    }

    return {
      id: uuidv4(),
      transaction_ref: transaction.referencia_origen,
      fecha_operacion: transaction.fecha,
      ingreso_banco_cents: transaction.importe_cents, // Simplificación: asociamos el ingreso original
      venta_real_calculada_cents: importe,
      comision_banco_cents: 0,
      product_cod: product.cod,
      product_um: product.um,
      cantidad: qty,
      precio_unitario_cents: product.precio_cents,
      importe_linea_cents: importe,
      cuadre_cents: 0,
      clasificacion,
      origen_dato: origen,
      reconciliation_hash: await generateHash(`${transaction.referencia_origen}-${product.cod}-${qty}-${origen}`),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Busca una combinación exacta de productos que sumen el monto.
   * Considera la prioridad dinámica/manual de los productos.
   */
  private findExactCombination(target: number): { product: Product, qty: number }[] {
    const sortedProducts = [...this.products].sort((a, b) => {
        // Modo híbrido/automático: Priorizar según prioridad_algoritmo (1 mejor)
        const pA = a.prioridad_algoritmo || 3;
        const pB = b.prioridad_algoritmo || 3;

        if (pA !== pB) return pA - pB;

        // Desempate por precio (mayor primero)
        if (b.precio_cents !== a.precio_cents) {
            return b.precio_cents - a.precio_cents;
        }
        return a.cod.localeCompare(b.cod);
    });

    const MAX_DEPTH = 12;
    const TIMEOUT_MS = 2000;
    const startTime = Date.now();

    const solve = (remaining: number, index: number, depth: number): { product: Product, qty: number }[] | null => {
      // Base case: target reached (using epsilon for float precision)
      if (Math.abs(remaining) < 0.001) return [];

      // Constraints: depth limit, exhausted products, or timeout
      if (depth >= MAX_DEPTH || index >= sortedProducts.length || (Date.now() - startTime) > TIMEOUT_MS) {
        return null;
      }

      const p = sortedProducts[index];
      if (p.precio_cents <= 0) return solve(remaining, index + 1, depth);

      // Try using this product (from max possible quantity down to 1)
      const maxQty = Math.floor((remaining + 0.001) / p.precio_cents);

      // Ajuste por Stock Limit
      let actualMaxQty = maxQty;
      if (this.useStockLimit) {
          const available = this.stockMap.get(p.cod) || 0;
          actualMaxQty = Math.min(maxQty, available);
      }

      for (let qty = actualMaxQty; qty >= 1; qty--) {
        // Al usar una cantidad en la recursión, debemos descontarla temporalmente del stockMap
        // si queremos ser estrictos en la combinación.
        if (this.useStockLimit) {
            const current = this.stockMap.get(p.cod) || 0;
            this.stockMap.set(p.cod, current - qty);
        }

        const sub = solve(remaining - qty * p.precio_cents, index + 1, depth + 1);

        // Restaurar stock tras la prueba (backtracking)
        if (this.useStockLimit) {
            const current = this.stockMap.get(p.cod) || 0;
            this.stockMap.set(p.cod, current + qty);
        }

        if (sub) {
          return [{ product: p, qty }, ...sub];
        }
      }

      // Try skipping this product
      return solve(remaining, index + 1, depth);
    };

    return solve(target, 0, 0) || [];
  }

  async reconcileAll(
    transactions: (BankTransaction & { current_reconciled_cents?: number })[],
    onProgress?: (percentage: number) => void,
    customStockMap?: Map<string, number>
  ): Promise<any[]> {
    const results = [];
    const total = transactions.length;

    if (customStockMap) {
        this.stockMap = new Map(customStockMap);
    }

    for (let i = 0; i < total; i++) {
        const tx = transactions[i];
        try {
            const res = await this.matchTransaction(tx, tx.current_reconciled_cents || 0);
            results.push({
                transactionId: tx.referencia_origen,
                status: res.status,
                lines: res.lines
            });
        } catch (error) {
            console.error(`[MatchingEngine] Error processing transaction ${tx.referencia_origen}:`, error);
            results.push({
                transactionId: tx.referencia_origen,
                status: 'PENDIENTE',
                lines: []
            });
        }

        if (onProgress) {
            const percentage = Math.round(((i + 1) / total) * 100);
            onProgress(percentage);
        }
    }
    return results;
  }

  /**
   * Genera agregados diarios para un reporte de IPV
   */
  async generateDailyAggregate(fecha: string): Promise<void> {
    const lines = await db.reconciliation_lines.where('fecha_operacion').equals(fecha).toArray();

    let total_cents = 0;
    const by_product_map = new Map<string, { cod: string, descripcion: string, cantidad: number, importe_cents: number }>();

    for (const line of lines) {
      if (line.product_cod === 'CASH') continue;

      total_cents += line.importe_linea_cents;

      const existing = by_product_map.get(line.product_cod);
      if (existing) {
        existing.cantidad += line.cantidad;
        existing.importe_cents += line.importe_linea_cents;
      } else {
        const product = this.products.find(p => p.cod === line.product_cod);
        by_product_map.set(line.product_cod, {
          cod: line.product_cod,
          descripcion: product?.descripcion || 'Producto desconocido',
          cantidad: line.cantidad,
          importe_cents: line.importe_linea_cents
        });
      }
    }

    await db.daily_aggregates.put({
      fecha,
      total_cents,
      by_product: Array.from(by_product_map.values())
    });
  }
}
