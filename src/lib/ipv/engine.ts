import { v4 as uuidv4 } from 'uuid';
import {
  type BankTransaction,
  type Product,
  type MatchingRule,
  type ReconciliationLine,
  type MatchingTrace,
  db
} from '../dexie';
import { isProductAMedida, fuzzySimilarity } from './utils';

/**
 * Genera un hash simple para idempotencia
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
  failReason?: string;
  movements: any[];
  trace: MatchingTrace[];
  appliedRules: string[];
  matchingConfidence: number;
}

const RULE_CONFIDENCE: Record<string, number> = {
    'AUTO_COMPLETE': 1.0,
    'HARD_REF': 0.95,
    'EXACT_SUM': 1.0,
    'PRICE_FLEX': 0.85,
    'WILDCARDS': 0.80,
    'TOLERANCE': 0.70,
    'CASH_FILL': 0.50
};

export const DEFAULT_MATCHING_RULES: MatchingRule[] = [
  { id: "1", tipo: "STOCK_LIMIT", prioridad: 1, activo: true },
  { id: "2", tipo: "HARD_REF", prioridad: 2, activo: true },
  { id: "3", tipo: "EXACT_SUM", prioridad: 3, activo: true },
  { id: "4", tipo: "PRICE_FLEX", prioridad: 4, activo: true, meta: { max_variation_percent: 20, max_variation_cents: 10 } },
  { id: "5", tipo: "WILDCARDS", prioridad: 5, activo: true },
  { id: "6", tipo: "TOLERANCE", prioridad: 6, activo: true, meta: { tolerance_cents: 100 } },
  { id: "7", tipo: "CASH_FILL", prioridad: 7, activo: false, meta: { daily_limit: 500 } }
];

export class MatchingEngine {
  private products: Product[];
  private rules: MatchingRule[];
  private stockMap: Map<string, number> = new Map();
  private useStockLimit: boolean = false;
  private allowNegativeStock: boolean = true;
  private pendingMovements: any[] = [];
  private dailyAdjustedPrices: Map<string, number> = new Map();

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);
    this.useStockLimit = this.rules.some(r => r.tipo === 'STOCK_LIMIT');
    const stockLimitRule = this.rules.find(r => r.tipo === 'STOCK_LIMIT');
    this.allowNegativeStock = stockLimitRule?.meta?.allow_negative !== false;
    this.pendingMovements = [];
    this.dailyAdjustedPrices = new Map();

    for (const p of this.products) {
        this.stockMap.set(p.cod, p.stock_inicial_manual || 0);
    }
  }

  private async persistLog(
    transaction: BankTransaction,
    result: MatchingResult,
    durationMs: number
  ) {
    try {
      await db.matching_logs.add({
        id: uuidv4(),
        transaction_ref: transaction.referencia_origen,
        fecha_ejecucion: new Date().toISOString(),
        resultado_estado: result.status,
        trace: result.trace,
        applied_rules: result.appliedRules,
        matching_confidence: result.matchingConfidence,
        fail_reason: result.failReason,
        reconciliation_lines_count: result.lines.length,
        duration_ms: durationMs,
        engine_version: "2.1.0",
        reglas_activas: this.rules.map(r => r.tipo),
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("Error persistiendo audit log:", e);
    }
  }

  async matchTransaction(transaction: BankTransaction, current_reconciled_cents: number = 0): Promise<MatchingResult> {
    const startTime = Date.now();
    const lines: ReconciliationLine[] = [];
    const logs: string[] = [];
    const trace: MatchingTrace[] = [];
    const appliedRules: string[] = [];
    let matchingConfidence = 1.0;

    const targetAmount = transaction.importe_venta_cents || transaction.importe_cents;
    let remaining_cents = targetAmount - current_reconciled_cents;

    const addTrace = (pass: number, rule: string, status: string, details: string, meta?: any) => {
        trace.push({
            id: uuidv4(),
            transaction_ref: transaction.referencia_origen,
            fecha_ejecucion: new Date().toISOString(),
            pass_number: pass,
            rule_type: rule,
            status: status as 'SUCCESS' | 'FAIL' | 'SKIPPED',
            details,
            metadata: meta
        });
        if (status === 'SUCCESS' && !appliedRules.includes(rule)) {
            appliedRules.push(rule);
            matchingConfidence = Math.min(matchingConfidence, RULE_CONFIDENCE[rule] || 1.0);
        }
    };

    logs.push(`Iniciando matching para transacción ${transaction.referencia_origen} (Importe: ${targetAmount} cts, Restante: ${remaining_cents} cts)`);

    if (transaction.tipo === 'Db' || transaction.excluido) {
      const reason = transaction.tipo === 'Db' ? 'Débito auto-finalizado' : 'Excluida del matching';
      return {
          lines: [],
          status: 'COMPLETO',
          logs: [reason],
          movements: [],
          trace: [{ id: uuidv4(), transaction_ref: transaction.referencia_origen, fecha_ejecucion: new Date().toISOString(), pass_number: 0, rule_type: 'AUTO_COMPLETE', status: 'SUCCESS', details: reason }],
          appliedRules: ['AUTO_COMPLETE'],
          matchingConfidence
      };
    }

    const catalogHash = await generateHash(JSON.stringify(this.products));
    const rulesHash = await generateHash(JSON.stringify(this.rules));
    const cacheKey = `${transaction.referencia_origen}-${catalogHash}-${rulesHash}`;

    const cached = await db.matching_cache.get(cacheKey);
    if (cached && Math.abs(cached.importe_cents - remaining_cents) < 0.001) {
        logs.push("Usando resultado de cache para esta transacción");
        for (const item of cached.results) {
            const product = this.products.find(p => p.cod === item.product_cod);
            if (product) {
                const line = await this.createLine(transaction, product, item.cantidad, 'AUTO_MATCH', 'Transferencia');
                lines.push(line);
                remaining_cents -= line.importe_linea_cents;
            }
        }
        const result: MatchingResult = {
            lines,
            status: Math.abs(remaining_cents) < 0.001 ? 'COMPLETO' : 'PARCIAL',
            logs,
            movements: [...this.pendingMovements],
            trace: [{ id: uuidv4(), transaction_ref: transaction.referencia_origen, fecha_ejecucion: new Date().toISOString(), pass_number: 0, rule_type: 'CACHE', status: 'SUCCESS', details: 'Recuperado de cache' }],
            appliedRules: ['CACHE'],
            matchingConfidence
        };
        await this.persistLog(transaction, result, Date.now() - startTime);
        return result;
    }

    const hardRefRule = this.rules.find(r => r.tipo === 'HARD_REF');
    if (hardRefRule && remaining_cents > 0) {
      let matchedProduct = this.products.find(p => {
        if (this.useStockLimit && !this.allowNegativeStock && this.getVirtualStock(p.cod) <= 0) return false;
        const obs = transaction.observaciones.toLowerCase();
        return obs.includes(p.cod.toLowerCase()) || obs.includes(p.descripcion.toLowerCase());
      });

      if (!matchedProduct) {
        const fuzzyMatch = this.products
          .map(p => ({ product: p, score: Math.max(fuzzySimilarity(transaction.observaciones, p.cod), fuzzySimilarity(transaction.observaciones, p.descripcion)) }))
          .filter(m => m.score >= 0.75)
          .sort((a, b) => b.score - a.score)[0];
        if (fuzzyMatch) {
          matchedProduct = fuzzyMatch.product;
          matchingConfidence = Math.min(matchingConfidence, 0.75);
          logs.push(`Fuzzy Match detected: ${matchedProduct.descripcion} (Score: ${fuzzyMatch.score.toFixed(2)})`);
        }
      }

      if (matchedProduct) {
        let qty = Math.floor(remaining_cents / matchedProduct.precio_cents);
        if (this.useStockLimit) {
            const available = this.getVirtualStock(matchedProduct.cod);
            if (!this.allowNegativeStock) qty = Math.min(qty, available);
        }

        if (qty > 0) {
          const line = await this.createLine(transaction, matchedProduct, qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
          logs.push(`PASS 1 (HARD_REF): Matched ${qty}x ${matchedProduct.descripcion}`);
          addTrace(1, 'HARD_REF', 'SUCCESS', `Detectado ${matchedProduct.descripcion}`, { product: matchedProduct.cod, qty });
        } else {
            addTrace(1, 'HARD_REF', 'FAIL', `Sin stock para ${matchedProduct.descripcion}`);
        }
      } else {
          addTrace(1, 'HARD_REF', 'FAIL', 'No se detectaron códigos o descripciones');
      }
    } else if (!hardRefRule) {
        addTrace(1, 'HARD_REF', 'SKIPPED', 'Regla inactiva');
    }

    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    if (exactSumRule && remaining_cents > 0) {
      const combination = this.findExactCombination(remaining_cents);
      if (combination.length > 0) {
        await db.matching_cache.put({
          id: cacheKey,
          importe_cents: remaining_cents,
          catalog_hash: catalogHash,
          rules_hash: rulesHash,
          results: combination.map(c => ({ product_cod: c.product.cod, cantidad: c.qty })),
          updated_at: new Date().toISOString()
        });

        for (const item of combination) {
          const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
          logs.push(`PASS 2 (EXACT_SUM): Matched ${item.qty}x ${item.product.descripcion}`);
        }
        addTrace(2, 'EXACT_SUM', 'SUCCESS', `Encontrada combinación exacta de ${combination.length} productos`);
      } else {
          addTrace(2, 'EXACT_SUM', 'FAIL', 'No se encontró combinación exacta con el stock disponible');
      }
    }

    const priceFlexRule = this.rules.find(r => r.tipo === 'PRICE_FLEX');
    if (priceFlexRule && remaining_cents > 0) {
        // Implementation for price flexibility
        addTrace(3, 'PRICE_FLEX', 'SKIPPED', 'No implementado en esta versión');
    }

    const wildcardsRule = this.rules.find(r => r.tipo === 'WILDCARDS');
    if (wildcardsRule && remaining_cents > 0) {
        const combination = this.findMinimumOverageCombination(remaining_cents);
        if (combination.length > 0) {
            for (const item of combination) {
                const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH', 'Transferencia');
                lines.push(line);
                remaining_cents -= line.importe_linea_cents;
                logs.push(`PASS 4 (WILDCARDS): Matched ${item.qty}x ${item.product.descripcion} (Wildcard)`);
            }
            addTrace(4, 'WILDCARDS', 'SUCCESS', `Completado usando productos wildcard`);
        } else {
            addTrace(4, 'WILDCARDS', 'FAIL', 'No hay productos marcados como comodín disponibles');
        }
    }

    const toleranceRule = this.rules.find(r => r.tipo === 'TOLERANCE');
    if (toleranceRule && remaining_cents > 0) {
        const tolerance = (toleranceRule.meta?.tolerance_cents ?? 100);
        if (Math.abs(remaining_cents) <= tolerance) {
            logs.push(`PASS 5 (TOLERANCE): Diferencia de ${remaining_cents} cts dentro de tolerancia`);
            addTrace(5, 'TOLERANCE', 'SUCCESS', `Diferencia residual aceptada`);
            remaining_cents = 0;
        } else {
            addTrace(5, 'TOLERANCE', 'FAIL', `Diferencia ${remaining_cents} excede tolerancia ${tolerance}`);
        }
    }

    const result: MatchingResult = {
      lines,
      status: Math.abs(remaining_cents) < 0.001 ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE'),
      logs,
      failReason: remaining_cents > 0 ? `Diferencia pendiente: ${remaining_cents} cts` : undefined,
      movements: [...this.pendingMovements],
      trace,
      appliedRules,
      matchingConfidence
    };

    await this.persistLog(transaction, result, Date.now() - startTime);
    return result;
  }

  private async attemptDecomposition(targetProductCod: string): Promise<boolean> {
    const targetProduct = this.products.find(p => p.cod === targetProductCod);
    if (!targetProduct) return false;

    const ancestors = this.products.filter(p => p.cod_hijo === targetProductCod);
    for (const ancestor of ancestors) {
      const ancestorStock = this.stockMap.get(ancestor.cod) || 0;
      if (ancestorStock > 0) {
        const conversionFactor = ancestor.contenido_paquete || 1;
        this.stockMap.set(ancestor.cod, ancestorStock - 1);
        const currentTargetStock = this.stockMap.get(targetProductCod) || 0;
        this.stockMap.set(targetProductCod, currentTargetStock + conversionFactor);

        this.pendingMovements.push({
          id: uuidv4(),
          fecha: new Date().toISOString(),
          producto_origen_cod: ancestor.cod,
          producto_destino_cod: targetProduct.cod,
          cantidad_origen: 1,
          cantidad_destino: conversionFactor,
          tipo: 'DECOMPOSITION',
          created_at: new Date().toISOString()
        });
        return true;
      }
    }
    return false;
  }

  private async createLine(
    transaction: BankTransaction,
    product: Product,
    qty: number,
    origen: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER',
    clasificacion: 'Transferencia' | 'Efectivo' | 'QR',
    observaciones?: string
  ): Promise<ReconciliationLine> {
    if (this.useStockLimit) {
        let currentStock = this.stockMap.get(product.cod) || 0;
        while (currentStock < qty) {
            const decomposed = await this.attemptDecomposition(product.cod);
            if (!decomposed) break;
            currentStock = this.stockMap.get(product.cod) || 0;
        }
    }

    const importe = product.precio_cents * qty;
    if (this.useStockLimit) {
        const current = this.stockMap.get(product.cod) || 0;
        this.stockMap.set(product.cod, this.allowNegativeStock ? current - qty : Math.max(0, current - qty));
    }

    return {
      id: uuidv4(),
      transaction_ref: transaction.referencia_origen,
      fecha_operacion: transaction.fecha,
      ingreso_banco_cents: transaction.importe_cents,
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
      observaciones,
      reconciliation_hash: await generateHash(`${transaction.referencia_origen}-${product.cod}-${qty}-${origen}`),
      created_at: new Date().toISOString()
    };
  }

  private getVirtualStock(productCod: string): number {
    const product = this.products.find(p => p.cod === productCod);
    if (!product || !product.id_grupo) return this.stockMap.get(productCod) || 0;
    const groupProducts = this.products.filter(p => p.id_grupo === product.id_grupo);
    const currentStock = new Map<string, number>();
    groupProducts.forEach(p => currentStock.set(p.cod, this.stockMap.get(p.cod) || 0));

    const calculateRecursiveStock = (targetCod: string): number => {
        let total = currentStock.get(targetCod) || 0;
        const parents = groupProducts.filter(p => p.cod_hijo === targetCod);
        for (const parent of parents) {
            const parentVirtualStock = calculateRecursiveStock(parent.cod);
            total += parentVirtualStock * (parent.contenido_paquete || 1);
        }
        return total;
    };
    return calculateRecursiveStock(productCod);
  }

  private findExactCombination(target: number, options?: { prioritizeLowStock?: boolean }): { product: Product, qty: number }[] {
    const sortedProducts = [...this.products].sort((a, b) => {
        if (options?.prioritizeLowStock) {
            const sA = this.getVirtualStock(a.cod);
            const sB = this.getVirtualStock(b.cod);
            if (sA > 0 && sB <= 0) return -1;
            if (sB > 0 && sA <= 0) return 1;
            if (sA > 0 && sB > 0 && sA !== sB) return sA - sB;
        }
        const pA = a.prioridad_algoritmo || 3;
        const pB = b.prioridad_algoritmo || 3;
        if (pA !== pB) return pA - pB;
        if (b.precio_cents !== a.precio_cents) return b.precio_cents - a.precio_cents;
        return a.cod.localeCompare(b.cod);
    });

    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    const MAX_DEPTH = exactSumRule?.meta?.max_depth ?? 12;
    const TIMEOUT_MS = exactSumRule?.meta?.timeout_ms ?? 2000;
    const startTime = Date.now();

    const solve = (remaining: number, index: number, depth: number): { product: Product, qty: number }[] | null => {
      if (Math.abs(remaining) < 0.001) return [];
      if (depth >= MAX_DEPTH || index >= sortedProducts.length || (Date.now() - startTime) > TIMEOUT_MS) return null;

      const p = sortedProducts[index];

      // Optimization: If remaining is less than the current product price, and it's the smallest price, skip
      if (remaining < p.precio_cents && index === sortedProducts.length - 1) return null;
      if (p.precio_cents <= 0) return solve(remaining, index + 1, depth);

      const maxQty = Math.floor((remaining + 0.001) / p.precio_cents);
      let actualMaxQty = maxQty;
      if (this.useStockLimit) actualMaxQty = Math.min(maxQty, this.getVirtualStock(p.cod));

      for (let qty = actualMaxQty; qty >= 1; qty--) {
        const nextRemaining = remaining - qty * p.precio_cents;

        if (this.useStockLimit) {
            const current = this.stockMap.get(p.cod) || 0;
            this.stockMap.set(p.cod, current - qty);
        }

        const sub = solve(nextRemaining, index + 1, depth + 1);

        if (this.useStockLimit) {
            const current = this.stockMap.get(p.cod) || 0;
            this.stockMap.set(p.cod, current + qty);
        }

        if (sub) return [{ product: p, qty }, ...sub];
      }
      return solve(remaining, index + 1, depth);
    };
    return solve(target, 0, 0) || [];
  }

  private findMinimumOverageCombination(target: number): { product: Product, qty: number }[] {
    const wildcards = this.products
      .filter(p => p.isWildcardCandidate)
      .filter(p => !this.useStockLimit || this.allowNegativeStock || this.getVirtualStock(p.cod) > 0)
      .sort((a, b) => b.precio_cents - a.precio_cents);

    if (wildcards.length === 0) return [];

    let bestCombination: { product: Product, qty: number }[] | null = null;
    let minOverage = Infinity;
    const startTime = Date.now();
    const TIMEOUT_MS = 1000;

    const solve = (remaining: number, index: number, current: { product: Product, qty: number }[]) => {
      if (Date.now() - startTime > TIMEOUT_MS || minOverage === 0) return;

      if (remaining <= 0) {
        const overage = Math.abs(remaining);
        if (overage < minOverage) {
          minOverage = overage;
          bestCombination = [...current];
        }
        return;
      }

      if (index >= wildcards.length || current.length >= 6) return;

      const p = wildcards[index];
      const needed = Math.ceil(remaining / p.precio_cents);

      for (let qty = needed; qty >= 0; qty--) {
          if (qty > 0) {
              const available = this.useStockLimit && !this.allowNegativeStock ? this.getVirtualStock(p.cod) : 999;
              const actualQty = Math.min(qty, available);
              if (actualQty > 0) {
                  current.push({ product: p, qty: actualQty });
                  solve(remaining - (actualQty * p.precio_cents), index + 1, current);
                  current.pop();
              }
          } else {
              solve(remaining, index + 1, current);
          }
          if (minOverage === 0) return;
      }
    };

    solve(target, 0, []);
    return bestCombination || [];
  }


  async reconcileAll(
    transactions: (BankTransaction & { current_reconciled_cents?: number })[],
    onProgress?: (percentage: number) => void,
    customStockMap?: Map<string, number>
  ): Promise<any[]> {
    const results: any[] = [];
    if (customStockMap) this.stockMap = new Map(customStockMap);

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      try {
          const res = await this.matchTransaction(tx, tx.current_reconciled_cents || 0);
          results.push({
              transactionId: tx.referencia_origen,
              status: res.status,
              lines: res.lines,
              failReason: res.failReason,
              movements: res.movements,
              trace: res.trace,
              appliedRules: res.appliedRules,
              matchingConfidence: res.matchingConfidence
          });
      } catch (error) {
          console.error(`Error matching transaction ${tx.referencia_origen}:`, error);
          results.push({
              transactionId: tx.referencia_origen,
              status: 'PENDIENTE',
              lines: [],
              movements: [],
              trace: [],
              appliedRules: [],
              matchingConfidence: 0
          });
      }

      if (onProgress) {
          const percentage = Math.round(((i + 1) / transactions.length) * 100);
          if (i % 5 === 0 || percentage === 100) {
              onProgress(Math.min(100, Math.max(0, percentage)));
          }
      }
    }
    return results;
  }

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
    await db.daily_aggregates.put({ fecha, total_cents, by_product: Array.from(by_product_map.values()) });
  }
}
