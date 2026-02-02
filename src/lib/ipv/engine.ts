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

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);
  }

  async matchTransaction(transaction: BankTransaction): Promise<MatchingResult> {
    const logs: string[] = [];
    const targetAmount = transaction.importe_venta_cents || transaction.importe_cents;
    let remaining_cents = targetAmount;
    const lines: ReconciliationLine[] = [];

    logs.push(`Iniciando matching para transacción ${transaction.referencia_origen} (Importe: ${transaction.importe_cents}, Venta: ${targetAmount} cts)`);

    // PASS 0: Debitos (Comisiones)
    if (transaction.tipo === 'Db') {
        const isCommission = transaction.observaciones.toLowerCase().includes('comision') ||
                            transaction.observaciones.toLowerCase().includes('banca remota') ||
                            transaction.observaciones.toLowerCase().includes('virtualbandec');

        if (isCommission) {
            logs.push(`PASS 0: Detectada comisión bancaria. Marcando como COMPLETO.`);
            return { lines: [], status: 'COMPLETO', logs };
        }
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
      const matchedProduct = this.products.find(p =>
        transaction.observaciones.includes(p.cod) ||
        transaction.observaciones.toLowerCase().includes(p.descripcion.toLowerCase())
      );

      if (matchedProduct) {
        // En un caso real, HARD_REF podría implicar una cantidad específica si viene en la obs.
        // Por ahora, si hay match de referencia, intentamos cubrir lo más posible.
        const qty = Math.floor(remaining_cents / matchedProduct.precio_cents);
        if (qty > 0) {
          const line = await this.createLine(transaction, matchedProduct, qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
          logs.push(`PASS 1 (HARD_REF): Matched ${qty}x ${matchedProduct.descripcion}`);
        }
      }
    }

    // PASS 2: EXACT_SUM (Backtracking)
    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    if (exactSumRule && remaining_cents > 0) {
      const combination = this.findExactCombination(remaining_cents);
      if (combination.length > 0) {
        // Guardar en caché
        await db.matching_cache.put({
          importe_cents: remaining_cents, // Usamos el restante por si hubo PASS 1
          catalog_hash: catalogHash,
          results: combination.map(c => ({ product_cod: c.product.cod, cantidad: c.qty })),
          updated_at: new Date().toISOString()
        });

        for (const item of combination) {
          const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
        }
        logs.push(`PASS 2 (EXACT_SUM): Encontrada combinación de ${combination.length} productos`);
      }
    }

    // PASS 3: TOLERANCE
    const toleranceRule = this.rules.find(r => r.tipo === 'TOLERANCE');
    if (toleranceRule && remaining_cents > 0 && toleranceRule.tolerancia_cents) {
      // Intentamos ver si con un producto más nos acercamos dentro de la tolerancia
      for (const product of this.products.sort((a,b) => b.precio_cents - a.precio_cents)) {
        const diff = Math.abs(remaining_cents - product.precio_cents);
        if (diff <= toleranceRule.tolerancia_cents) {
          const line = await this.createLine(transaction, product, 1, 'AUTO_MATCH', 'Transferencia');
          // Ajustamos el cuadre en la última línea o registramos la diferencia
          line.cuadre_cents = remaining_cents - product.precio_cents;
          lines.push(line);
          remaining_cents = 0;
          logs.push(`PASS 3 (TOLERANCE): Matched ${product.descripcion} con cuadre de ${line.cuadre_cents} cts`);
          break;
        }
      }
    }

    // PASS 4: CASH_FILL
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
        logs.push(`PASS 4 (CASH_FILL): Límite diario excedido. Saldo restante: ${remaining_cents} cts`);
      } else {
        // El excedente se marca como ajuste de efectivo si la regla está activa
        const line: ReconciliationLine = {
        id: uuidv4(),
        transaction_ref: transaction.referencia_origen,
        fecha_operacion: transaction.fecha,
        ingreso_banco_cents: 0,
        venta_real_calculada_cents: remaining_cents,
        comision_banco_cents: 0,
        product_cod: 'CASH',
        product_um: 'U',
        cantidad: 1,
        precio_unitario_cents: remaining_cents,
        importe_linea_cents: remaining_cents,
        cuadre_cents: 0,
        clasificacion: 'Efectivo',
        origen_dato: 'CASH_FILLER',
        reconciliation_hash: await generateHash(transaction.referencia_origen + 'CASH_FILL' + remaining_cents),
        created_at: new Date().toISOString()
      };
        lines.push(line);
        remaining_cents = 0;
        logs.push(`PASS 4 (CASH_FILL): Cubierto gap de ${line.importe_linea_cents} cts con efectivo`);
      }
    }

    const status = Math.abs(remaining_cents) < 0.001 ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE');

    return {
      lines,
      status,
      logs
    };
  }

  private async createLine(
    transaction: BankTransaction,
    product: Product,
    qty: number,
    origen: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER',
    clasificacion: 'Transferencia' | 'Efectivo' | 'QR'
  ): Promise<ReconciliationLine> {
    const importe = product.precio_cents * qty;
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
   * Algoritmo con backtracking limitado para balancear precisión y performance.
   */
  private findExactCombination(target: number): { product: Product, qty: number }[] {
    const sortedProducts = [...this.products].sort((a, b) => {
        // Prioridad algoritmo asc, luego precio desc, luego cod para determinismo
        if (a.prioridad_algoritmo !== b.prioridad_algoritmo) {
            return a.prioridad_algoritmo - b.prioridad_algoritmo;
        }
        if (b.precio_cents !== a.precio_cents) {
            return b.precio_cents - a.precio_cents;
        }
        return a.cod.localeCompare(b.cod);
    });

    const MAX_DEPTH = 6;
    const TIMEOUT_MS = 500;
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
      for (let qty = maxQty; qty >= 1; qty--) {
        const sub = solve(remaining - qty * p.precio_cents, index + 1, depth + 1);
        if (sub) {
          return [{ product: p, qty }, ...sub];
        }
      }

      // Try skipping this product
      return solve(remaining, index + 1, depth);
    };

    return solve(target, 0, 0) || [];
  }

  async reconcileAll(transactions: BankTransaction[], onProgress?: (percentage: number) => void): Promise<any[]> {
    const results = [];
    const total = transactions.length;

    for (let i = 0; i < total; i++) {
        const tx = transactions[i];
        const res = await this.matchTransaction(tx);
        results.push({
            transactionId: tx.id,
            status: res.status,
            lines: res.lines
        });

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
