import { db, BankTransaction, ReconciliationLine, Product, MatchingRule, ProductMovement, MatchingTrace } from '../dexie';
import { v4 as uuidv4 } from 'uuid';
import { generateHash } from '../utils';
import { isProductAMedida } from './utils';

export { generateHash };

export type RulesConfig = MatchingRule[];

/**
 * Retorna la configuración de reglas por defecto para el motor IPV.
 */
export function getDefaultIPVRulesConfig(): RulesConfig {
  return [
    { id: "stock-limit", tipo: "STOCK_LIMIT", prioridad: 1, activo: true, meta: { allow_negative: false }, descripcion: "Límites de Stock" },
    { id: "hard-ref", tipo: "HARD_REF", prioridad: 2, activo: true, descripcion: "Referencia Exacta" },
    { id: "exact-sum", tipo: "EXACT_SUM", prioridad: 3, activo: true, meta: { depth: 1200, timeout: 200000, max_depth: 1200, timeout_ms: 200000 }, descripcion: "Suma Exacta (Combinatoria)" },
    { id: "wildcards", tipo: "WILDCARDS", prioridad: 4, activo: true, descripcion: "Comodines" },
    { id: "cash-fill", tipo: "CASH_FILL", prioridad: 5, activo: true, meta: { daily_limit: 10000000 }, descripcion: "Inyección de Efectivo" },
    { id: "tolerance", tipo: "TOLERANCE", prioridad: 6, activo: false, meta: { tolerance_cents: 100 }, descripcion: "Tolerancia de Cuadre" },
    { id: "price-flex", tipo: "PRICE_FLEX", prioridad: 7, activo: false, meta: { range: 0.1, max_variation_percent: 10, max_variation_cents: 100 }, descripcion: "Flexibilidad de Precio" },
  ];
}

export interface MatchingResult {
  transactionId: string;
  status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'OVERPAYMENT';
  lines: ReconciliationLine[];
  movements: ProductMovement[];
  failReason?: string;
  trace: MatchingTrace[];
  appliedRules: string[];
  matchingConfidence: number;
  logs: string[];
}

export const DEFAULT_MATCHING_RULES: MatchingRule[] = getDefaultIPVRulesConfig();

export class MatchingEngine {
  private products: Product[];
  private rules: MatchingRule[];
  private stockMap: Map<string, number> = new Map();
  private useStockLimit: boolean = false;
  private allowNegativeStock: boolean = true;
  private pendingMovements: ProductMovement[] = [];
  private isMatchingPipelineActive: boolean = false;
  private readonly ORIGIN_WHITELIST = /^[A-Z0-9\-_]{5,64}$/;

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);
    this.useStockLimit = this.rules.some(r => r.tipo === 'STOCK_LIMIT');
    const stockLimitRule = this.rules.find(r => r.tipo === 'STOCK_LIMIT');
    this.allowNegativeStock = this.useStockLimit ? (stockLimitRule?.meta?.allow_negative === true) : true;

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
        engine_version: "3.0.0",
        reglas_activas: this.rules.map(r => r.tipo),
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("Error persistiendo log:", e);
    }
  }

  async matchTransaction(
    transaction: BankTransaction,
    currentReconciledCents: number = 0,
    cashFillUsedTodayInMemory: number = 0
  ): Promise<MatchingResult> {
    this.isMatchingPipelineActive = true;
    const startTime = Date.now();
    const targetCents = transaction.importe_cents - currentReconciledCents;
    const lines: ReconciliationLine[] = [];
    const trace: MatchingTrace[] = [];
    const appliedRules: string[] = [];
    const logs: string[] = [];

    const addTrace = (pass: number, rule: string, status: 'SUCCESS' | 'FAIL' | 'SKIPPED', reason?: string, details?: any) => {
      trace.push({ pass, rule, status, reason, details, timestamp: Date.now() });
    };

    if (transaction.tipo === 'Db') {
        this.isMatchingPipelineActive = false;
        return {
            transactionId: transaction.referencia_origen,
            status: 'COMPLETO',
            lines: [], movements: [], trace, appliedRules: ['AUTO_DB'], matchingConfidence: 100,
            logs: ["Débito procesado."]
        };
    }

    if (targetCents <= 0) {
        this.isMatchingPipelineActive = false;
        return {
            transactionId: transaction.referencia_origen,
            status: 'COMPLETO',
            lines: [], movements: [], trace, appliedRules, matchingConfidence: 100,
            logs: ["Ya conciliada."]
        };
    }

    let remainingTransfer = targetCents;
    const matchedProducts: { product: Product, qty: number }[] = [];

    // Pass 1: Apply rules to find products
    for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];
        if (rule.tipo === 'STOCK_LIMIT' || rule.tipo === 'CASH_FILL' || rule.tipo === 'TOLERANCE') continue;

        const results = await this.findProductsByRule(rule, transaction, remainingTransfer);
        if (results.length > 0) {
            matchedProducts.push(...results);
            if (!appliedRules.includes(rule.tipo)) appliedRules.push(rule.tipo);

            // For HARD_REF, we might match multiple products.
            // For others, we might consume remainingTransfer.
            for(const res of results) {
                remainingTransfer -= (res.product.precio_cents * res.qty);
            }
        }
        if (remainingTransfer <= 0) break;
    }

    // Pass 2: Create Composite Lines
    // Current Remaining Transfer is targetCents. We will distribute it among matchedProducts.
    let transferToDistribute = targetCents;
    for (const item of matchedProducts) {
        const productValue = item.product.precio_cents * item.qty;
        const transferCoverage = Math.min(Math.max(0, transferToDistribute), productValue);
        const cashCoverage = productValue - transferCoverage;

        const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH',
            cashCoverage > 0 ? (transferCoverage > 0 ? 'MIXTO' : 'Efectivo') : 'Transferencia');

        line.transfer_amount_cents = transferCoverage;
        line.cash_amount_cents = cashCoverage;
        line.importe_linea_cents = productValue;

        lines.push(line);
        transferToDistribute -= transferCoverage;
        this.updateVirtualStock(item.product.cod, item.qty, transaction.referencia_origen);
    }

    // Pass 3: Handle Overpayment or Final Square
    let status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'OVERPAYMENT' = 'PENDIENTE';
    if (lines.length > 0) {
        if (transferToDistribute === 0) status = 'COMPLETO';
        else if (transferToDistribute > 0) status = 'OVERPAYMENT';
        else status = 'COMPLETO'; // Should not happen with new logic
    }

    // Final Consistency Check
    const totalPayments = lines.reduce((s, l) => s + (l.transfer_amount_cents || 0) + (l.cash_amount_cents || 0), 0);
    const totalValue = lines.reduce((s, l) => s + l.venta_real_calculada_cents, 0);
    if (lines.length > 0 && Math.abs(totalPayments - totalValue) > 1) {
        throw new Error(`Inconsistencia contable: Pagos(${totalPayments}) !== Valor(${totalValue})`);
    }

    const result: MatchingResult = {
      transactionId: transaction.referencia_origen,
      status,
      lines,
      movements: [...this.pendingMovements],
      trace,
      appliedRules,
      matchingConfidence: (status === 'COMPLETO' || status === 'OVERPAYMENT') ? 100 : 50,
      logs
    };

    await this.persistLog(transaction, result, Date.now() - startTime);
    this.isMatchingPipelineActive = false;
    this.pendingMovements = [];
    return result;
  }

  private async findProductsByRule(rule: MatchingRule, tx: BankTransaction, remaining: number): Promise<{product: Product, qty: number}[]> {
      const results: {product: Product, qty: number}[] = [];

      if (rule.tipo === 'HARD_REF') {
          const matched = this.products.filter(p => tx.observaciones?.includes(p.cod) || p.cod === tx.referencia_origen);
          for(const p of matched) results.push({ product: p, qty: 1 });
      } else if (rule.tipo === 'EXACT_SUM') {
          const match = this.products.find(p => p.precio_cents > 0 && remaining % p.precio_cents === 0);
          if (match) results.push({ product: match, qty: remaining / match.precio_cents });
      } else if (rule.tipo === 'WILDCARDS') {
          const wildcards = this.products.filter(p => p.isWildcardCandidate && p.precio_cents > 0);
          if (remaining > 0 && wildcards.length > 0) {
              const best = wildcards[0]; // Simplification for now
              results.push({ product: best, qty: Math.ceil(remaining / best.precio_cents) });
          }
      }
      return results;
  }

  private async createLine(tx: BankTransaction, p: Product, qty: number, origin: any, classif: any): Promise<ReconciliationLine> {
    return {
        id: uuidv4(),
        transaction_ref: tx.referencia_origen,
        parent_transaction_id: tx.referencia_origen,
        source_type: 'BANK_TRANSFER',
        status: 'VALID',
        fecha_operacion: tx.fecha,
        ingreso_banco_cents: tx.importe_cents,
        venta_real_calculada_cents: p.precio_cents * qty,
        comision_banco_cents: 0,
        product_cod: p.cod,
        product_um: p.um || 'UD',
        cantidad: qty,
        precio_unitario_cents: p.precio_cents,
        importe_linea_cents: p.precio_cents * qty,
        transfer_amount_cents: 0,
        cash_amount_cents: 0,
        cuadre_cents: 0,
        clasificacion: classif,
        origen_dato: origin,
        reconciliation_hash: await generateHash(`${tx.referencia_origen}-${p.cod}-${qty}-${Date.now()}`),
        created_at: new Date().toISOString()
    };
  }

  private getVirtualStock(productCod: string): number {
    return this.stockMap.get(productCod) || 0;
  }

  private updateVirtualStock(productCod: string, qty: number, txRef: string) {
    const current = this.getVirtualStock(productCod);
    this.stockMap.set(productCod, current - qty);

    this.pendingMovements.push({
        id: uuidv4(),
        fecha: new Date().toISOString(),
        producto_origen_cod: productCod,
        producto_destino_cod: '',
        cantidad_origen: qty,
        cantidad_destino: 0,
        tipo: 'MANUAL',
        referencia_transaccion: txRef,
        created_at: new Date().toISOString()
    });
  }

  async distributeGlobalGoal(
    targetTotalCents: number,
    currentTotalCents: number,
    dates: string[],
    options: { strategy?: 'UNIFORM' | 'PRIORITIZED' | 'MIN_STOCK' | 'MAX_VALUE', dayVolumes?: Record<string, number> } = {}
  ): Promise<ReconciliationLine[]> {
    const diff = targetTotalCents - currentTotalCents;
    if (diff <= 0) return [];
    let remaining = diff;
    const allExtraLines: ReconciliationLine[] = [];
    const sortedDates = [...dates].sort((a, b) => {
        if (options.dayVolumes) return (options.dayVolumes[a] || 0) - (options.dayVolumes[b] || 0);
        return 0;
    });
    for (const date of sortedDates) {
        if (remaining <= 0) break;
        const toMatch = Math.min(remaining, 100000); // Batching
        const dayLines = await this.matchGoalResiduals(date, toMatch);
        allExtraLines.push(...dayLines);
        remaining -= dayLines.reduce((s, l) => s + l.importe_linea_cents, 0);
    }
    return allExtraLines;
  }

  async matchGoalResiduals(date: string, diffCents: number): Promise<ReconciliationLine[]> {
    const lines: ReconciliationLine[] = [];
    let remainingDiff = diffCents;
    const prioritizedWildcards = this.products.filter(p => p.isWildcardCandidate && p.precio_cents > 0);
    for (const p of prioritizedWildcards) {
      if (remainingDiff <= 0) break;
      const qty = Math.floor(remainingDiff / p.precio_cents);
      if (qty > 0) {
          const line = await this.createLine({ fecha: date, referencia_origen: `GOAL-${date}`, importe_cents: 0 } as any, p, qty, 'CASH_FILLER', 'Efectivo');
          line.cash_amount_cents = line.importe_linea_cents;
          line.source_type = 'REAL_CASH_GOAL';
          lines.push(line);
          remainingDiff -= line.importe_linea_cents;
      }
    }
    return lines;
  }

  async matchSimulation(targetCents: number): Promise<MatchingResult> {
    const dummyTx: BankTransaction = {
        id: 'sim-' + Date.now(),
        referencia_origen: 'SIM-TRX',
        fecha: new Date().toISOString().split('T')[0],
        importe_cents: targetCents,
        tipo: 'Cr',
        referencia_corta: 'SIM',
        observaciones: '',
        estado_conciliacion: 'PENDIENTE',
        ingestion_hash: 'SIM',
        created_at: new Date().toISOString()
    };
    return this.matchTransaction(dummyTx);
  }

  async reconcileAll(
    transactions: (BankTransaction & { current_reconciled_cents?: number })[],
    onProgress?: (percentage: number) => void,
    customStockMap?: Map<string, number>,
    cashFillUsedByDate?: Map<string, number>
  ): Promise<MatchingResult[]> {
    const results: MatchingResult[] = [];
    if (customStockMap) this.stockMap = new Map(customStockMap);
    const inMemoryCashFillByDate = cashFillUsedByDate || new Map<string, number>();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      try {
        const currentCashUsedToday = inMemoryCashFillByDate.get(tx.fecha) || 0;
        const res = await this.matchTransaction(tx, tx.current_reconciled_cents || 0, currentCashUsedToday);
        results.push(res);
        const cashUsedThisTx = res.lines.filter(l => l.origen_dato === 'CASH_FILLER').reduce((sum, l) => sum + l.importe_linea_cents, 0);
        inMemoryCashFillByDate.set(tx.fecha, currentCashUsedToday + cashUsedThisTx);
      } catch (error) {
          console.error(`Error matching transaction ${tx.referencia_origen}:`, error);
          results.push({
              transactionId: tx.referencia_origen, status: 'PENDIENTE', lines: [], movements: [], trace: [], appliedRules: [], matchingConfidence: 0,
              logs: ["Error inesperado en el motor."]
          });
      }

      if (onProgress) {
          const percentage = Math.round(((i + 1) / transactions.length) * 100);
          if (i % 5 === 0 || percentage === 100) onProgress(Math.min(100, Math.max(0, percentage)));
      }
    }
    return results;
  }
}
