import { v4 as uuidv4 } from 'uuid';
import {
  type BankTransaction,
  type Product,
  type MatchingRule,
  type ReconciliationLine,
  type MatchingTrace,
  db
} from '../dexie';
import { isProductAMedida } from './utils';

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
    this.allowNegativeStock = this.useStockLimit ? (stockLimitRule?.meta?.allow_negative === true) : true;
    this.pendingMovements = [];
    this.dailyAdjustedPrices = new Map();

    for (const p of this.products) {
        this.stockMap.set(p.cod, p.stock_inicial_manual || 0);
    }
  }

  private async persistLog(
    transaction: BankTransaction,
    result: MatchingResult,
    durationMs: number,
    retries = 3
  ) {
    for (let i = 0; i < retries; i++) {
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
            engine_version: "2.5.0",
            reglas_activas: this.rules.map(r => r.tipo),
            created_at: new Date().toISOString()
          });
          return;
        } catch (e) {
          console.error(`Error persistiendo audit log (intento ${i+1}/${retries}):`, e);
          if (i < retries - 1) await new Promise(res => setTimeout(res, 500 * (i + 1)));
        }
    }
  }

  async matchTransaction(
    transaction: BankTransaction,
    current_reconciled_cents: number = 0,
    cashFillUsedTodayInMemory: number = 0
  ): Promise<MatchingResult> {
    const startTimeMs = performance.now();
    const logs: string[] = [];
    const trace: MatchingTrace[] = [];
    const appliedRules: string[] = [];
    let matchingConfidence = 1.0;

    const targetAmount = transaction.importe_venta_cents || transaction.importe_cents;
    let current_remaining = targetAmount - current_reconciled_cents;
    const lines: ReconciliationLine[] = [];

    const addTrace = (pass: number, rule: string, status: "SUCCESS" | "FAIL" | "SKIPPED", reason?: string, details?: any) => {
        trace.push({
            pass,
            rule,
            status,
            reason,
            details,
            timestamp: Date.now()
        });
        if (status === 'SUCCESS') {
            if (!appliedRules.includes(rule)) appliedRules.push(rule);
            matchingConfidence = Math.min(matchingConfidence, RULE_CONFIDENCE[rule] || 1.0);
        }
    };

    logs.push(`Iniciando matching para transacción ${transaction.referencia_origen} (Importe: ${targetAmount} cts, Restante: ${current_remaining} cts)`);

    if (transaction.tipo === 'Db' || transaction.estado_conciliacion === 'NO_PROCESAR') {
      const reason = transaction.tipo === 'Db' ? 'Débito auto-finalizado' : 'Excluida del matching';
      addTrace(0, 'AUTO_COMPLETE', 'SUCCESS', reason);
      const result: MatchingResult = {
          lines: [],
          status: 'COMPLETO',
          logs,
          movements: [],
          trace,
          appliedRules,
          matchingConfidence
      };
      await this.persistLog(transaction, result, performance.now() - startTimeMs);
      return result;
    }

    for (const rule of this.rules) {
      if (current_remaining <= 0) break;

      switch (rule.tipo) {
        case 'HARD_REF':
          await this.applyHardRef(rule, transaction, current_remaining, lines, logs, addTrace);
          break;
        case 'EXACT_SUM':
          await this.applyExactSum(rule, transaction, current_remaining, lines, logs, addTrace);
          break;
        case 'PRICE_FLEX':
          await this.applyPriceFlex(rule, transaction, current_remaining, lines, logs, addTrace);
          break;
        case 'WILDCARDS':
          await this.applyWildcards(rule, transaction, current_remaining, lines, logs, addTrace);
          break;
        case 'TOLERANCE':
          await this.applyTolerance(rule, transaction, current_remaining, lines, logs, addTrace);
          break;
        case 'CASH_FILL':
          await this.applyCashFill(rule, transaction, current_remaining, lines, logs, addTrace, cashFillUsedTodayInMemory);
          break;
      }

      current_remaining = targetAmount - current_reconciled_cents - lines.reduce((sum, l) => sum + (l.importe_linea_cents || 0), 0);
    }

    const result: MatchingResult = {
        lines,
        status: Math.abs(current_remaining) < 0.001 ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE'),
        logs,
        movements: this.pendingMovements,
        trace,
        appliedRules,
        matchingConfidence,
        failReason: current_remaining > 0 ? `Faltan ${current_remaining} cts para completar` : undefined
    };

    await this.persistLog(transaction, result, performance.now() - startTimeMs);
    return result;
  }

  private async applyHardRef(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any) {
    const matchedProduct = this.products.find(p => {
      if (this.useStockLimit && !this.allowNegativeStock && this.getVirtualStock(p.cod) <= 0) return false;
      const obs = tx.observaciones.toLowerCase();
      return obs.includes(p.cod.toLowerCase()) || obs.includes(p.descripcion.toLowerCase());
    });

    if (matchedProduct) {
      let qty = Math.floor(remaining / matchedProduct.precio_cents);
      if (this.useStockLimit && !this.allowNegativeStock) qty = Math.min(qty, this.getVirtualStock(matchedProduct.cod));

      if (qty > 0) {
        try {
          const line = await this.createLine(tx, matchedProduct, qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
          logs.push(`HARD_REF: Matched ${qty}x ${matchedProduct.descripcion}`);
          addTrace(rule.prioridad, 'HARD_REF', 'SUCCESS', `Detectado ${matchedProduct.descripcion}`, { product: matchedProduct.cod, qty });
        } catch (e: any) {
          addTrace(rule.prioridad, 'HARD_REF', 'FAIL', e.message);
        }
      } else {
        addTrace(rule.prioridad, 'HARD_REF', 'FAIL', `Sin stock para ${matchedProduct.descripcion}`);
      }
    } else {
      addTrace(rule.prioridad, 'HARD_REF', 'FAIL', 'No se detectaron códigos o descripciones');
    }
  }

  private async applyExactSum(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any) {
    const catalogHash = await generateHash(JSON.stringify(this.products.map(p => ({ cod: p.cod, price: p.precio_cents, stock: p.stock_inicial_manual }))));
    const rulesHash = await generateHash(JSON.stringify(this.rules.map(r => ({ id: r.id, tipo: r.tipo, prioridad: r.prioridad }))));
    const cacheKey = `${remaining}-${catalogHash}-${rulesHash}`;

    const cached = await db.matching_cache.get(cacheKey);
    if (cached && cached.catalog_hash === catalogHash && cached.rules_hash === rulesHash) {
      let added = 0;
      for (const item of cached.results) {
        const product = this.products.find(p => p.cod === item.product_cod);
        if (product) {
          try {
            const line = await this.createLine(tx, product, item.cantidad, 'AUTO_MATCH', 'Transferencia');
            lines.push(line);
            added++;
          } catch {}
        }
      }
      if (added > 0) {
        logs.push(`EXACT_SUM: Recuperado de caché`);
        addTrace(rule.prioridad, 'EXACT_SUM', 'SUCCESS', 'Combinación recuperada de caché');
        return;
      }
    }

    const combination = this.findExactCombination(remaining);
    if (combination.length > 0) {
      await db.matching_cache.put({
        id: cacheKey,
        importe_cents: remaining,
        catalog_hash: catalogHash,
        rules_hash: rulesHash,
        results: combination.map(c => ({ product_cod: c.product.cod, cantidad: c.qty })),
        updated_at: new Date().toISOString()
      });

      try {
        for (const item of combination) {
          const line = await this.createLine(tx, item.product, item.qty, 'AUTO_MATCH', 'Transferencia');
          lines.push(line);
        }
        logs.push(`EXACT_SUM: Encontrada combinación exacta`);
        addTrace(rule.prioridad, 'EXACT_SUM', 'SUCCESS', 'Combinación exacta encontrada', { items: combination.length });
      } catch (e: any) {
        addTrace(rule.prioridad, 'EXACT_SUM', 'FAIL', e.message);
      }
    } else {
      addTrace(rule.prioridad, 'EXACT_SUM', 'FAIL', 'No se encontró combinación exacta');
    }
  }

  private async applyPriceFlex(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any) {
    const maxAbs = rule.meta?.max_variation_cents ?? 10;
    const maxPercent = rule.meta?.max_variation_percent ?? 20;

    const flexProduct = this.products.find(p => {
        if (this.useStockLimit && !this.allowNegativeStock && this.getVirtualStock(p.cod) <= 0) return false;
        const lockedPrice = this.dailyAdjustedPrices.get(p.cod);
        if (lockedPrice !== undefined) return lockedPrice === remaining;
        return (p.variacion_permisible_percent || 0) > 0 || p.isWildcardCandidate;
    });

    if (flexProduct) {
        const basePrice = flexProduct.precio_cents;
        const lockedPrice = this.dailyAdjustedPrices.get(flexProduct.cod);
        const targetPrice = lockedPrice !== undefined ? lockedPrice : remaining;
        const adjustment = Math.abs(targetPrice - basePrice);
        const allowedPercent = flexProduct.variacion_permisible_percent || maxPercent;
        const maxPercentAbs = basePrice * (allowedPercent / 100);

        if (adjustment <= maxAbs || adjustment <= maxPercentAbs) {
            if (lockedPrice === undefined) {
                this.dailyAdjustedPrices.set(flexProduct.cod, targetPrice);
                this.pendingMovements.push({
                    id: uuidv4(),
                    fecha: new Date().toISOString(),
                    producto_origen_cod: flexProduct.cod,
                    producto_destino_cod: flexProduct.cod,
                    tipo: 'PRICE_ADJUSTMENT',
                    valor_anterior: basePrice.toString(),
                    valor_nuevo: targetPrice.toString(),
                    motivo: 'Matching PRICE_FLEX',
                    created_at: new Date().toISOString()
                });
            }
            try {
              const line = await this.createLine(tx, flexProduct, 1, 'AUTO_MATCH', 'Transferencia');
              line.precio_unitario_cents = targetPrice;
              line.importe_linea_cents = targetPrice;
              lines.push(line);
              logs.push(`PRICE_FLEX: Ajustado ${flexProduct.descripcion} a ${targetPrice}`);
              addTrace(rule.prioridad, 'PRICE_FLEX', 'SUCCESS', `Ajuste de precio en ${flexProduct.descripcion}`, { adjustment: targetPrice - basePrice });
            } catch (e: any) {
              addTrace(rule.prioridad, 'PRICE_FLEX', 'FAIL', e.message);
            }
        }
    }
  }

  private async applyWildcards(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any) {
    const wildcards = this.products
        .filter(p => p.isWildcardCandidate)
        .filter(p => !this.useStockLimit || this.allowNegativeStock || this.getVirtualStock(p.cod) > 0)
        .sort((a,b) => b.precio_cents - a.precio_cents);

    let addedCount = 0;
    let temp_remaining = remaining;
    for (const p of wildcards) {
        if (p.precio_cents <= temp_remaining && p.precio_cents > 0) {
            let qty = Math.floor(temp_remaining / p.precio_cents);
            if (this.useStockLimit && !this.allowNegativeStock) qty = Math.min(qty, this.getVirtualStock(p.cod));
            if (qty > 0) {
                try {
                  const line = await this.createLine(tx, p, qty, 'AUTO_MATCH', 'Transferencia');
                  lines.push(line);
                  temp_remaining -= line.importe_linea_cents;
                  addedCount += qty;
                } catch {}
            }
        }
    }
    if (addedCount > 0) addTrace(rule.prioridad, 'WILDCARDS', 'SUCCESS', `Añadidos ${addedCount} comodines`);
  }

  private async applyTolerance(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any) {
    const toleranceCents = rule.meta?.tolerance_cents ?? rule.tolerancia_cents ?? 0;
    if (toleranceCents <= 0) return;

    const candidateProducts = this.products
      .filter(p => !this.useStockLimit || this.allowNegativeStock || this.getVirtualStock(p.cod) > 0)
      .sort((a,b) => b.precio_cents - a.precio_cents);

    for (const product of candidateProducts) {
      if (product.precio_cents <= 0) continue;
      let qty = Math.round(remaining / product.precio_cents);
      if (qty <= 0) qty = 1;
      if (this.useStockLimit && !this.allowNegativeStock) qty = Math.min(qty, this.getVirtualStock(product.cod));
      if (qty <= 0) continue;

      const diff = Math.abs(remaining - (product.precio_cents * qty));
      if (diff <= toleranceCents) {
        try {
          const line = await this.createLine(tx, product, qty, 'AUTO_MATCH', 'Transferencia');
          line.cuadre_cents = remaining - (product.precio_cents * qty);
          line.importe_linea_cents = remaining;
          lines.push(line);
          logs.push(`TOLERANCE: Matched ${qty}x ${product.descripcion} (Cuadre: ${line.cuadre_cents})`);
          addTrace(rule.prioridad, 'TOLERANCE', 'SUCCESS', `Cuadre de ${line.cuadre_cents} cts aplicado`);
          return;
        } catch {}
      }
    }
  }

  private async applyCashFill(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, cashFillUsedTodayInMemory: number) {
    const dailyLimit = rule.meta?.daily_limit ?? Infinity;
    let usedToday = cashFillUsedTodayInMemory;

    if (cashFillUsedTodayInMemory === 0) {
      usedToday = await db.reconciliation_lines
        .where('fecha_operacion').equals(tx.fecha)
        .and(l => l.origen_dato === 'CASH_FILLER')
        .toArray()
        .then(lines => lines.reduce((sum, l) => sum + l.importe_linea_cents, 0));
    }

    if (usedToday + remaining > dailyLimit) {
      addTrace(rule.prioridad, 'CASH_FILL', 'FAIL', `Límite diario de ${dailyLimit} cts excedido`);
      return;
    }

    const combination = this.findMinimumOverageCombination(remaining);
    if (combination.length > 0) {
      let currentTarget = remaining;
      for (const item of combination) {
        const totalItemValue = item.product.precio_cents * item.qty;
        if (totalItemValue <= currentTarget) {
          try {
            lines.push(await this.createLine(tx, item.product, item.qty, 'CASH_FILLER', 'Transferencia'));
            currentTarget -= totalItemValue;
          } catch {}
        } else {
          const transfPart = Math.max(0, currentTarget);
          const cashPart = totalItemValue - transfPart;
          if (transfPart > 0) {
            try {
              const l = await this.createLine(tx, item.product, item.qty, 'CASH_FILLER', 'Transferencia');
              l.importe_linea_cents = transfPart;
              l.venta_real_calculada_cents = transfPart;
              lines.push(l);
            } catch {}
          }
          if (cashPart > 0) {
            try {
              const lc = await this.createLine(tx, item.product, 0, 'CASH_FILLER', 'Efectivo', `Pago mixto - Ref: ${tx.referencia_origen}`);
              lc.importe_linea_cents = cashPart;
              lc.venta_real_calculada_cents = cashPart;
              lc.product_cod = item.product.cod;
              lc.reconciliation_hash = await generateHash(`${tx.referencia_origen}-CASH-PART-${item.product.cod}-${cashPart}`);
              lines.push(lc);
            } catch {}
          }
          currentTarget = 0;
        }
      }
      addTrace(rule.prioridad, 'CASH_FILL', 'SUCCESS', 'Pago mixto aplicado');
    } else {
        const line: ReconciliationLine = {
            id: uuidv4(),
            transaction_ref: tx.referencia_origen,
            fecha_operacion: tx.fecha,
            ingreso_banco_cents: 0,
            venta_real_calculada_cents: remaining,
            comision_banco_cents: 0,
            product_cod: 'CASH',
            product_um: 'UD',
            cantidad: 1,
            precio_unitario_cents: remaining,
            importe_linea_cents: remaining,
            cuadre_cents: 0,
            clasificacion: 'Efectivo',
            origen_dato: 'CASH_FILLER',
            reconciliation_hash: await generateHash(`${tx.referencia_origen}-CASH-${remaining}`),
            created_at: new Date().toISOString()
        };
        lines.push(line);
        addTrace(rule.prioridad, 'CASH_FILL', 'SUCCESS', 'Completado con efectivo genérico');
    }
  }

  private async createLine(
    transaction: BankTransaction,
    product: Product,
    qty: number,
    origen: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER',
    clasificacion: 'Transferencia' | 'Efectivo',
    observaciones?: string
  ): Promise<ReconciliationLine> {
    if (this.useStockLimit && product.cod !== 'CASH') {
        const currentStock = this.getVirtualStock(product.cod);
        if (!this.allowNegativeStock && currentStock < qty) {
            throw new Error(`ERR_INSUFFICIENT_STOCK: ${product.cod}`);
        }
    }

    const importe = product.precio_cents * qty;
    if (this.useStockLimit && product.cod !== 'CASH') {
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

  private getVirtualStock(productCod: string, currentStocks?: Map<string, number>): number {
    const stockMapToUse = currentStocks || this.stockMap;
    const product = this.products.find(p => p.cod === productCod);
    if (!product || !product.id_grupo) return stockMapToUse.get(productCod) || 0;

    const groupProducts = this.products.filter(p => p.id_grupo === product.id_grupo);
    const memo = new Map<string, number>();

    const calculateRecursiveStock = (targetCod: string): number => {
        if (memo.has(targetCod)) return memo.get(targetCod)!;
        let total = stockMapToUse.get(targetCod) || 0;
        const parents = groupProducts.filter(p => p.cod_hijo === targetCod);
        for (const parent of parents) {
            total += calculateRecursiveStock(parent.cod) * (parent.contenido_paquete || 1);
        }
        memo.set(targetCod, total);
        return total;
    };
    return calculateRecursiveStock(productCod);
  }

  private findExactCombination(target: number): { product: Product, qty: number }[] {
    const sortedProducts = [...this.products].sort((a, b) => {
        const pA = a.prioridad_algoritmo || 3;
        const pB = b.prioridad_algoritmo || 3;
        if (pA !== pB) return pA - pB;
        return b.precio_cents - a.precio_cents;
    });

    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    const MAX_DEPTH = exactSumRule?.meta?.max_depth ?? 12;
    const startTime = Date.now();
    const memo = new Map<string, { product: Product, qty: number }[] | null>();

    const virtualStocks = new Map<string, number>();
    if (this.useStockLimit) {
        for (const p of this.products) {
            virtualStocks.set(p.cod, this.getVirtualStock(p.cod));
        }
    }

    const solve = (remaining: number, index: number, depth: number): { product: Product, qty: number }[] | null => {
      const key = `${remaining}-${index}`;
      if (memo.has(key)) return memo.get(key)!;
      if (Math.abs(remaining) < 0.01) return [];
      if (depth >= MAX_DEPTH || index >= sortedProducts.length || (Date.now() - startTime) > 2000) return null;

      const p = sortedProducts[index];
      if (p.precio_cents <= 0) return solve(remaining, index + 1, depth);

      if (remaining < p.precio_cents && index === sortedProducts.length - 1) return null;

      const maxQty = Math.floor((remaining + 0.01) / p.precio_cents);
      let actualMaxQty = maxQty;
      if (this.useStockLimit && !this.allowNegativeStock) {
          actualMaxQty = Math.min(maxQty, virtualStocks.get(p.cod) || 0);
      }

      for (let qty = actualMaxQty; qty >= 1; qty--) {
        const res = solve(remaining - qty * p.precio_cents, index + 1, depth + 1);
        if (res) {
          const combined = [{ product: p, qty }, ...res];
          memo.set(key, combined);
          return combined;
        }
      }
      const resSkip = solve(remaining, index + 1, depth);
      memo.set(key, resSkip);
      return resSkip;
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

    const solve = (remaining: number, index: number, current: { product: Product, qty: number }[]) => {
      if (Date.now() - startTime > 1000 || minOverage === 0) return;
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
    customStockMap?: Map<string, number>,
    cashFillUsedByDate?: Map<string, number>
  ): Promise<any[]> {
    const results: any[] = [];
    if (customStockMap) this.stockMap = new Map(customStockMap);
    const inMemoryCashFillByDate = cashFillUsedByDate || new Map<string, number>();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      try {
        const currentCashUsedToday = inMemoryCashFillByDate.get(tx.fecha) || 0;
        const res = await this.matchTransaction(tx, tx.current_reconciled_cents || 0, currentCashUsedToday);
        results.push({
          transactionId: tx.referencia_origen,
          ...res
        });
        const cashUsedThisTx = res.lines.filter(l => l.origen_dato === 'CASH_FILLER').reduce((sum, l) => sum + (l.importe_linea_cents || 0), 0);
        inMemoryCashFillByDate.set(tx.fecha, currentCashUsedToday + cashUsedThisTx);
      } catch (error) {
          results.push({ transactionId: tx.referencia_origen, status: 'PENDIENTE', lines: [], movements: [], trace: [], appliedRules: [], matchingConfidence: 0 });
      }
      if (onProgress) onProgress(Math.round(((i + 1) / transactions.length) * 100));
    }
    return results;
  }

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

  async distributeGlobalGoal(
    targetTotal: number,
    currentTotal: number,
    dates: string[],
    options?: { dayVolumes?: Record<string, number>; strategy?: "MIN_STOCK" | "MAX_VALUE" }
  ): Promise<ReconciliationLine[]> {
    let remainingDiff = targetTotal - currentTotal;
    if (remainingDiff <= 0 || dates.length === 0) return [];

    const lines: ReconciliationLine[] = [];
    const sortedDates = [...dates].sort((a, b) => {
      if (options?.dayVolumes) {
        const volA = options.dayVolumes[a] || 0;
        const volB = options.dayVolumes[b] || 0;
        if (volA !== volB) return volA - volB;
      }
      return Math.random() - 0.5;
    });

    for (const date of sortedDates) {
      if (remainingDiff <= 0) break;
      const candidates = [...this.products]
        .filter(p => p.precio_cents > 0 && p.precio_cents <= remainingDiff)
        .filter(p => !this.useStockLimit || (this.stockMap.get(p.cod) || 0) > 0)
        .sort((a, b) => {
          const sA = this.stockMap.get(a.cod) || 0;
          const sB = this.stockMap.get(b.cod) || 0;
          if (options?.strategy === "MAX_VALUE") {
              return b.precio_cents - a.precio_cents;
          }
          if (sA !== sB) return sA - sB;
          return b.precio_cents - a.precio_cents;
        });

      for (const p of candidates) {
        if (remainingDiff <= 0) break;
        let availableStock = this.useStockLimit ? this.getVirtualStock(p.cod) : 999999;
        if (availableStock <= 0) continue;
        const maxQtyPossible = Math.floor(remainingDiff / p.precio_cents);
        if (maxQtyPossible <= 0) continue;
        const idealQtyForThisDay = Math.max(1, Math.floor(maxQtyPossible / (sortedDates.length / 2)));
        const qtyToPick = Math.min(availableStock, maxQtyPossible, idealQtyForThisDay);
        if (qtyToPick > 0) {
          const line = await this.createLine({ fecha: date, referencia_origen: `GOAL-${date}` } as any, p, qtyToPick, 'CASH_FILLER', 'Efectivo', undefined);
          line.id = uuidv4();
          line.cuadre_cents = 0;
          line.importe_linea_cents = p.precio_cents * qtyToPick;
          lines.push(line);
          remainingDiff -= line.importe_linea_cents;
        }
      }
    }
    return lines;
  }
}
