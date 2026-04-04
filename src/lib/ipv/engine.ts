import { db, BankTransaction, ReconciliationLine, Product, MatchingRule, ProductMovement } from '../dexie';
import { v4 as uuidv4 } from 'uuid';
import { generateHash } from '../utils';

export { generateHash };

export interface MatchingResult {
  transactionId: string;
  status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE';
  lines: ReconciliationLine[];
  movements: ProductMovement[];
  failReason?: string;
  trace: MatchingTrace[];
  appliedRules: string[];
  matchingConfidence: number;
}

export interface MatchingTrace {
  pass: number;
  rule: string;
  status: 'SUCCESS' | 'FAIL' | 'SKIPPED';
  reason?: string;
  details?: any;
}

export const DEFAULT_MATCHING_RULES: MatchingRule[] = [
  { id: "1", tipo: "HARD_REF", prioridad: 1, activo: true },
  { id: "2", tipo: "EXACT_SUM", prioridad: 2, activo: true },
  { id: "3", tipo: "PRICE_FLEX", prioridad: 3, activo: true, meta: { range: 0.1 } },
  { id: "4", tipo: "STOCK_LIMIT", prioridad: 4, activo: true },
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
  private pendingMovements: ProductMovement[] = [];
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
      console.error("Error persistiendo log de matching:", e);
    }
  }

  async matchTransaction(
    transaction: BankTransaction,
    currentReconciledCents: number = 0,
    cashFillUsedTodayInMemory: number = 0
  ): Promise<MatchingResult> {
    const startTime = Date.now();
    const targetCents = transaction.importe_cents - currentReconciledCents;
    const lines: ReconciliationLine[] = [];
    const trace: MatchingTrace[] = [];
    const appliedRules: string[] = [];

    const addTrace = (pass: number, rule: string, status: 'SUCCESS' | 'FAIL' | 'SKIPPED', reason?: string, details?: any) => {
      trace.push({ pass, rule, status, reason, details });
    };

    if (transaction.tipo === 'Db') {
        const result: MatchingResult = {
            transactionId: transaction.referencia_origen,
            status: 'COMPLETO',
            lines: [],
            movements: [],
            trace,
            appliedRules: ['AUTO_DB'],
            matchingConfidence: 100
        };
        return result;
    }

    if (targetCents <= 0) {
      const result: MatchingResult = {
        transactionId: transaction.referencia_origen,
        status: 'COMPLETO',
        lines: [],
        movements: [],
        trace,
        appliedRules,
        matchingConfidence: 100
      };
      return result;
    }

    let remaining = targetCents;

    for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];
        const pass = i + 1;

        if (remaining <= 0) break;

        switch (rule.tipo) {
            case 'HARD_REF':
                remaining = await this.applyHardRef(rule, transaction, remaining, lines, [], addTrace, pass);
                break;
            case 'EXACT_SUM':
                remaining = await this.applyExactSum(rule, transaction, remaining, lines, [], addTrace, pass);
                break;
            case 'STOCK_LIMIT':
                addTrace(pass, 'STOCK_LIMIT', 'SUCCESS', 'Modo de control de stock activado');
                break;
            case 'PRICE_FLEX':
                remaining = await this.applyPriceFlex(rule, transaction, remaining, lines, [], addTrace, pass);
                break;
            case 'WILDCARDS':
                remaining = await this.applyWildcards(rule, transaction, remaining, lines, [], addTrace, pass);
                break;
            case 'TOLERANCE':
                remaining = await this.applyTolerance(rule, transaction, remaining, lines, [], addTrace, pass);
                break;
            case 'CASH_FILL':
                remaining = await this.applyCashFill(rule, transaction, remaining, lines, [], addTrace, pass, cashFillUsedTodayInMemory);
                break;
        }

        if (remaining < targetCents && !appliedRules.includes(rule.tipo)) {
            appliedRules.push(rule.tipo);
        }
    }

    const status = remaining <= 0 ? 'COMPLETO' : (remaining < targetCents ? 'PARCIAL' : 'PENDIENTE');
    const result: MatchingResult = {
      transactionId: transaction.referencia_origen,
      status,
      lines,
      movements: [...this.pendingMovements],
      trace,
      appliedRules,
      matchingConfidence: status === 'COMPLETO' ? 100 : (status === 'PARCIAL' ? 50 : 0)
    };
    this.pendingMovements = [];

    const duration = Date.now() - startTime;
    await this.persistLog(transaction, result, duration);

    return result;
  }

  private async applyHardRef(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const ref = tx.referencia_origen;
    const match = this.products.find(p => tx.observaciones?.includes(p.cod) || p.cod === ref);
    if (match) {
        let available = this.getVirtualStock(match.cod);
        if (this.useStockLimit && available <= 0 && !this.allowNegativeStock) {
            const decomposed = await this.attemptDecomposition(match.cod);
            if (!decomposed) {
                addTrace(pass, 'HARD_REF', 'FAIL', `Sin stock para ${match.cod} y no se pudo descomponer.`);
                return remaining;
            }
            available = this.getVirtualStock(match.cod);
        }

        const qty = Math.floor(remaining / match.precio_cents);
        if (qty > 0) {
            const line = await this.createLine(tx, match, qty, 'AUTO_MATCH', 'Transferencia');
            lines.push(line);
            this.updateVirtualStock(match.cod, qty, tx.referencia_origen);
            addTrace(pass, 'HARD_REF', 'SUCCESS', `Match por referencia directa con ${match.cod}`);
            return remaining - line.importe_linea_cents;
        }
    }
    addTrace(pass, 'HARD_REF', 'SKIPPED');
    return remaining;
  }

  private async applyExactSum(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const candidates = this.products.filter(p => p.precio_cents > 0 && p.precio_cents <= remaining);
    for (const p of candidates) {
        if (remaining % p.precio_cents === 0) {
            const qty = remaining / p.precio_cents;
            let available = this.getVirtualStock(p.cod);

            if (this.useStockLimit && available < qty && !this.allowNegativeStock) {
                const decomposed = await this.attemptDecomposition(p.cod);
                if (!decomposed) continue;
                available = this.getVirtualStock(p.cod);
                if (available < qty) continue;
            }

            const line = await this.createLine(tx, p, qty, 'AUTO_MATCH', 'Transferencia');
            lines.push(line);
            this.updateVirtualStock(p.cod, qty, tx.referencia_origen);
            addTrace(pass, 'EXACT_SUM', 'SUCCESS', `Match exacto por suma: ${qty}x ${p.cod}`);
            return 0;
        }
    }
    addTrace(pass, 'EXACT_SUM', 'SKIPPED');
    return remaining;
  }

  private async attemptDecomposition(productCod: string): Promise<boolean> {
    const p = this.products.find(x => x.cod === productCod);
    if (!p || !p.id_grupo) return false;

    const isAMedida = ['kg', 'lb', 'm', 'm2', 'm3'].includes(p.um?.toLowerCase() || '');
    if (isAMedida) return false;

    const ancestors = this.products
        .filter(x => x.id_grupo === p.id_grupo && x.cod_hijo === p.cod && (this.getVirtualStock(x.cod) > 0));

    if (ancestors.length > 0) {
        const ancestor = ancestors[0];
        const factor = ancestor.contenido_paquete || 1;

        const currentAncestorStock = this.getVirtualStock(ancestor.cod);
        this.stockMap.set(ancestor.cod, currentAncestorStock - 1);

        const currentChildStock = this.getVirtualStock(p.cod);
        this.stockMap.set(p.cod, currentChildStock + factor);

        this.pendingMovements.push({
            id: uuidv4(),
            fecha: new Date().toISOString(),
            producto_origen_cod: ancestor.cod,
            producto_destino_cod: p.cod,
            cantidad_origen: 1,
            cantidad_destino: factor,
            tipo: 'DECOMPOSITION',
            created_at: new Date().toISOString()
        });
        return true;
    }

    return false;
  }

  private async applyPriceFlex(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const range = rule.meta?.range || 0.1;
    const candidates = this.products.filter(p => {
        const diff = Math.abs(p.precio_cents - remaining) / p.precio_cents;
        return diff <= range;
    });

    if (candidates.length > 0) {
        const best = candidates.sort((a,b) => Math.abs(a.precio_cents - remaining) - Math.abs(b.precio_cents - remaining))[0];
        if (this.useStockLimit && this.getVirtualStock(best.cod) < 1 && !this.allowNegativeStock) {
            const decomposed = await this.attemptDecomposition(best.cod);
            if (!decomposed) {
                addTrace(pass, 'PRICE_FLEX', 'FAIL', `Sin stock para ${best.cod}`);
                return remaining;
            }
        }
        const line = await this.createLine(tx, best, 1, 'AUTO_MATCH', 'Transferencia');
        line.precio_unitario_cents = remaining;
        line.importe_linea_cents = remaining;
        lines.push(line);
        this.updateVirtualStock(best.cod, 1, tx.referencia_origen);
        addTrace(pass, 'PRICE_FLEX', 'SUCCESS', `Match por precio flexible con ${best.cod}`);
        return 0;
    }
    addTrace(pass, 'PRICE_FLEX', 'SKIPPED');
    return remaining;
  }

  private async applyWildcards(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const wildcards = this.products.filter(p => p.isWildcardCandidate && p.precio_cents > 0);
    for (const p of wildcards) {
        if (remaining >= p.precio_cents) {
            let qty = Math.floor(remaining / p.precio_cents);
            let available = this.getVirtualStock(p.cod);

            if (this.useStockLimit && available < qty && !this.allowNegativeStock) {
                await this.attemptDecomposition(p.cod);
                available = this.getVirtualStock(p.cod);
                qty = Math.min(qty, available);
            }

            if (qty > 0) {
                const line = await this.createLine(tx, p, qty, 'AUTO_MATCH', 'Transferencia');
                lines.push(line);
                this.updateVirtualStock(p.cod, qty, tx.referencia_origen);
                addTrace(pass, 'WILDCARDS', 'SUCCESS', `Match por wildcard con ${qty}x ${p.cod}`);
                remaining -= line.importe_linea_cents;
                if (remaining <= 0) return 0;
            }
        }
    }
    addTrace(pass, 'WILDCARDS', 'SKIPPED');
    return remaining;
  }

  private async applyTolerance(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const tolerance = rule.meta?.tolerance_cents || 100;
    if (remaining <= tolerance) {
        addTrace(pass, 'TOLERANCE', 'SUCCESS', `Saldo de ${remaining} cts cubierto por tolerancia`);
        return 0;
    }
    addTrace(pass, 'TOLERANCE', 'SKIPPED');
    return remaining;
  }

  private async applyCashFill(
    rule: MatchingRule,
    transaction: BankTransaction,
    remaining_cents: number,
    lines: ReconciliationLine[],
    logs: string[],
    addTrace: any,
    pass: number,
    cashFillUsedTodayInMemory: number
  ): Promise<number> {
    if (remaining_cents <= 0) return remaining_cents;
    const dailyLimit = rule.meta?.daily_limit ?? Infinity;
    if (cashFillUsedTodayInMemory + remaining_cents > dailyLimit) {
        addTrace(pass, 'CASH_FILL', 'FAIL', `Límite diario de ${dailyLimit} cts excedido`);
        return remaining_cents;
    }

    const line: ReconciliationLine = {
        id: uuidv4(),
        transaction_ref: transaction.referencia_origen,
        fecha_operacion: transaction.fecha,
        ingreso_banco_cents: 0,
        venta_real_calculada_cents: remaining_cents,
        comision_banco_cents: 0,
        product_cod: 'CASH',
        product_um: 'UD',
        cantidad: 1,
        precio_unitario_cents: remaining_cents,
        importe_linea_cents: remaining_cents,
        cuadre_cents: 0,
        clasificacion: 'Efectivo',
        origen_dato: 'CASH_FILLER',
        reconciliation_hash: await generateHash(`${transaction.referencia_origen}-CASH-${remaining_cents}`),
        created_at: new Date().toISOString()
    };
    lines.push(line);
    addTrace(pass, 'CASH_FILL', 'SUCCESS', `Cubiertos ${remaining_cents} cts como efectivo`);
    return 0;
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
        tipo: 'AUTO_MATCH',
        referencia_transaccion: txRef,
        created_at: new Date().toISOString()
    });
  }

  private async createLine(tx: BankTransaction, p: Product, qty: number, origin: any, classif: any): Promise<ReconciliationLine> {
    return {
        id: uuidv4(),
        transaction_ref: tx.referencia_origen,
        fecha_operacion: tx.fecha,
        ingreso_banco_cents: tx.importe_cents,
        venta_real_calculada_cents: p.precio_cents * qty,
        comision_banco_cents: 0,
        product_cod: p.cod,
        product_um: p.um || 'UD',
        cantidad: qty,
        precio_unitario_cents: p.precio_cents,
        importe_linea_cents: p.precio_cents * qty,
        cuadre_cents: 0,
        clasificacion: classif,
        origen_dato: origin,
        reconciliation_hash: await generateHash(`${tx.referencia_origen}-${p.cod}-${qty}`),
        created_at: new Date().toISOString()
    };
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

        const res = await this.matchTransaction(
          tx,
          tx.current_reconciled_cents || 0,
          currentCashUsedToday
        );

        results.push(res);

        const cashUsedThisTx = res.lines
          .filter(l => l.origen_dato === 'CASH_FILLER')
          .reduce((sum, l) => sum + l.importe_linea_cents, 0);

        inMemoryCashFillByDate.set(
          tx.fecha,
          currentCashUsedToday + cashUsedThisTx
        );
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
}
