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
  status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE';
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
  private dailyAdjustedPrices: Map<string, number> = new Map();
  private isMatchingPipelineActive: boolean = false;
  private readonly ORIGIN_WHITELIST = /^[A-Z0-9\-_]{5,64}$/;

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
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
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
          return;
        } catch (e: any) {
          if (i === maxRetries - 1) {
              console.error("Error persistiendo log de matching después de reintentos:", e);
          } else if (e.name === 'DatabaseClosedError' || e.message?.includes('Database is closed')) {
              const delay = Math.pow(2, i) * 100;
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
          } else {
              console.error("Error persistiendo log de matching:", e);
              break;
          }
        }
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
        const result: MatchingResult = {
            transactionId: transaction.referencia_origen,
            status: 'COMPLETO',
            lines: [],
            movements: [],
            trace,
            appliedRules: ['AUTO_DB'],
            matchingConfidence: 100,
            logs: ["Transacción de débito procesada automáticamente."]
        };
        this.isMatchingPipelineActive = false;
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
        matchingConfidence: 100,
        logs: ["La transacción ya está conciliada."]
      };
        this.isMatchingPipelineActive = false;
      return result;
    }

        let remaining = targetCents;
    let lastProductMatched: string | undefined = undefined;

    for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];
        const pass = i + 1;
        const linesBefore = lines.length;

        if (remaining < 0 && rule.tipo !== 'CASH_FILL') continue;

        switch (rule.tipo) {
            case 'STOCK_LIMIT':
                // Handled in other rules internally
                break;
            case 'HARD_REF':
                remaining = await this.applyHardRef(rule, transaction, remaining, lines, logs, addTrace, pass);
                break;
            case 'EXACT_SUM':
                remaining = await this.applyExactSum(rule, transaction, remaining, lines, logs, addTrace, pass);
                break;
            case 'PRICE_FLEX':
                remaining = await this.applyPriceFlex(rule, transaction, remaining, lines, logs, addTrace, pass);
                break;
            case 'WILDCARDS':
                remaining = await this.applyWildcards(rule, transaction, remaining, lines, logs, addTrace, pass);
                break;
            case 'TOLERANCE':
                remaining = await this.applyTolerance(rule, transaction, remaining, lines, logs, addTrace, pass);
                break;
            case 'CASH_FILL':
                remaining = await this.applyCashFill(rule, transaction, remaining, lines, logs, addTrace, pass, cashFillUsedTodayInMemory, lastProductMatched);
                break;
        }

        if (lines.length > linesBefore) {
            lastProductMatched = lines[lines.length - 1].product_cod;
        }

        if ((Math.abs(remaining - targetCents) > 0 || (rule.tipo === "CASH_FILL" && remaining === 0)) && !appliedRules.includes(rule.tipo)) {
            appliedRules.push(rule.tipo);
        }
    }

    const status = remaining === 0 ? 'COMPLETO' : (remaining !== targetCents ? 'PARCIAL' : 'PENDIENTE');
    const result: MatchingResult = {
      transactionId: transaction.referencia_origen,
      status,
      lines,
      movements: [...this.pendingMovements],
      trace,
      appliedRules,
      matchingConfidence: status === 'COMPLETO' ? 100 : (status === 'PARCIAL' ? 50 : 0),
      logs
    };
    this.pendingMovements = [];

    const duration = Date.now() - startTime;
    await this.persistLog(transaction, result, duration);

        this.isMatchingPipelineActive = false;
    return result;
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
        if (availableStock <= 0) {
            const success = await this.attemptDecomposition(p.cod);
            if (success) {
                availableStock = this.getVirtualStock(p.cod);
            }
        }
        if (availableStock <= 0) continue;

        const maxQtyPossible = Math.floor(remainingDiff / p.precio_cents);
        if (maxQtyPossible <= 0) continue;
        const idealQtyForThisDay = Math.max(1, Math.floor(maxQtyPossible / (sortedDates.length / 2)));
        const qtyToPick = Math.min(availableStock, maxQtyPossible, idealQtyForThisDay);
        if (qtyToPick > 0) {
          const line = await this.createLine({ fecha: date, referencia_origen: `GOAL-${date}`, importe_cents: p.precio_cents * qtyToPick } as any, p, qtyToPick, 'CASH_FILLER', 'Efectivo');
          line.id = uuidv4();
          line.cuadre_cents = 0;
          line.importe_linea_cents = p.precio_cents * qtyToPick;
          lines.push(line);
          remainingDiff -= line.importe_linea_cents;
          this.updateVirtualStock(p.cod, qtyToPick, `GOAL-${date}`);
        }
      }
    }
    return lines;
  }

  private async applyHardRef(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const ref = tx.referencia_origen;
    const match = this.products.find(p => tx.observaciones?.includes(p.cod) || p.cod === ref);
    if (match) {
        let available = this.getVirtualStock(match.cod);
        let qty = Math.floor(remaining / match.precio_cents);

        if (this.useStockLimit && available < qty && !this.allowNegativeStock) {
            await this.attemptDecomposition(match.cod);
            available = this.getVirtualStock(match.cod);
            qty = Math.min(qty, Math.max(0, available));
        }

        if (qty > 0 || (qty === 0 && !this.useStockLimit)) {
            // Mixed payment case: If qty is 0 but we have a match, we might need 1 unit anyway
            const finalQty = Math.max(1, qty);
            const line = await this.createLine(tx, match, finalQty, 'AUTO_MATCH', 'Transferencia');

            // If real cost > transfer, we cap the transfer line and let CASH_FILL handle the rest
            if (line.importe_linea_cents > remaining) {
                line.importe_linea_cents = remaining;
            }

            lines.push(line);
            this.updateVirtualStock(match.cod, finalQty, tx.referencia_origen);
            addTrace(pass, 'HARD_REF', 'SUCCESS', `Match por referencia directa con ${match.cod}`);
            logs.push(`PASS ${pass} (HARD_REF): Match directo con ${match.cod} (${finalQty} unidades)`);
            return remaining - (match.precio_cents * finalQty);
        } else if (this.useStockLimit && !this.allowNegativeStock) {
            addTrace(pass, 'HARD_REF', 'FAIL', `Sin stock para ${match.cod}`);
            return remaining;
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
            logs.push(`PASS ${pass} (EXACT_SUM): Match exacto con ${qty}x ${p.cod}`);
            return 0;
        }
    }
    addTrace(pass, 'EXACT_SUM', 'SKIPPED');
    return remaining;
  }

  private async attemptDecomposition(productCod: string): Promise<boolean> {
    const targetProduct = this.products.find(p => p.cod === productCod);
    if (!targetProduct || !targetProduct.id_grupo) return false;

    if (isProductAMedida(targetProduct.um)) return false;
    const ancestors = this.products.filter(p => p.cod_hijo === productCod);

    for (const ancestor of ancestors) {
      let availableAncestorStock = this.stockMap.get(ancestor.cod) || 0;
      if (availableAncestorStock <= 0) {
          const success = await this.attemptDecomposition(ancestor.cod);
          if (success) {
              availableAncestorStock = this.stockMap.get(ancestor.cod) || 0;
          }
      }

      if (availableAncestorStock > 0) {
        const conversionFactor = ancestor.contenido_paquete || 1;

        if (this.useStockLimit && !this.allowNegativeStock) {
          if (availableAncestorStock < 1) continue;
        }

        this.stockMap.set(ancestor.cod, availableAncestorStock - 1);
        const currentTargetStock = this.stockMap.get(targetProduct.cod) || 0;
        this.stockMap.set(targetProduct.cod, currentTargetStock + conversionFactor);

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
        logs.push(`PASS ${pass} (PRICE_FLEX): Match flexible con ${best.cod} (ajustado a ${remaining} cts)`);
        return 0;
    }
    addTrace(pass, 'PRICE_FLEX', 'SKIPPED');
    return remaining;
  }

  private async applyWildcards(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const wildcards = this.products.filter(p => p.isWildcardCandidate && p.precio_cents > 0);

    if (remaining <= 0) return remaining;

    let bestP: Product | null = null;
    let bestQty = 0;
    let bestRemaining = Infinity;

    for (const p of wildcards) {
        let qty = Math.ceil(remaining / p.precio_cents);
        let available = this.getVirtualStock(p.cod);

        if (this.useStockLimit && available < qty && !this.allowNegativeStock) {
            await this.attemptDecomposition(p.cod);
            available = this.getVirtualStock(p.cod);
            qty = Math.min(qty, available);
        }

        if (qty > 0) {
            const currentRealValue = p.precio_cents * qty;
            const currentRemaining = remaining - currentRealValue;

            if (currentRemaining === 0) {
                bestP = p;
                bestQty = qty;
                bestRemaining = 0;
                break;
            }

            if (bestP === null) {
                bestP = p;
                bestQty = qty;
                bestRemaining = currentRemaining;
            } else {
                if (currentRemaining < 0 && bestRemaining < 0) {
                    if (currentRemaining > bestRemaining) {
                        bestP = p;
                        bestQty = qty;
                        bestRemaining = currentRemaining;
                    }
                } else if (currentRemaining < 0 && bestRemaining > 0) {
                    bestP = p;
                    bestQty = qty;
                    bestRemaining = currentRemaining;
                } else if (currentRemaining > 0 && bestRemaining > 0) {
                    if (currentRemaining < bestRemaining) {
                        bestP = p;
                        bestQty = qty;
                        bestRemaining = currentRemaining;
                    }
                }
            }
        }
    }

    if (bestP && bestQty > 0) {
        const realValue = bestP.precio_cents * bestQty;
        // If real value > remaining, we cap the line's transfer component
        const transferCoverage = Math.min(remaining, realValue);

        const line = await this.createLine(tx, bestP, bestQty, 'AUTO_MATCH', 'Transferencia');
        line.importe_linea_cents = transferCoverage;
        lines.push(line);
        this.updateVirtualStock(bestP.cod, bestQty, tx.referencia_origen);
        addTrace(pass, 'WILDCARDS', 'SUCCESS', `Match por wildcard con ${bestQty}x ${bestP.cod}`);
        logs.push(`PASS ${pass} (WILDCARDS): Match wildcard con ${bestQty}x ${bestP.cod}`);

        // Return negative to trigger CASH_FILL overflow logic
        return remaining - realValue;
    }

    addTrace(pass, 'WILDCARDS', 'SKIPPED');
    return remaining;
  }

  private async applyTolerance(rule: MatchingRule, tx: BankTransaction, remaining: number, lines: ReconciliationLine[], logs: string[], addTrace: any, pass: number): Promise<number> {
    const tolerance = rule.meta?.tolerance_cents || 100;
    if (remaining > 0 && remaining <= tolerance) {
        addTrace(pass, 'TOLERANCE', 'SUCCESS', `Saldo de ${remaining} cts cubierto por tolerancia`);
        logs.push(`PASS ${pass} (TOLERANCE): Saldo restante de ${remaining} cts cubierto.`);
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
    cashFillUsedTodayInMemory: number,
    contextProductCod?: string
  ): Promise<number> {
    if (!this.isMatchingPipelineActive) {
        throw new Error('Invalid CASH_FILLER injection source: outside matching pipeline');
    }

    const baseRef = transaction.referencia_origen;

    if (baseRef.startsWith('GOAL-')) {
        throw new Error('GOAL cannot be processed as residual in CASH_FILL');
    }

    if (!this.ORIGIN_WHITELIST.test(baseRef)) {
        throw new Error(`Invalid transfer origin format: ${baseRef}. Must match ${this.ORIGIN_WHITELIST}`);
    }

    if (remaining_cents === 0) {
        addTrace(pass, 'CASH_FILL', 'SKIPPED', 'Ya está cuadrado');
        return 0;
    }

    const absRemaining = Math.abs(Math.round(remaining_cents));
    const dailyLimit = Math.round(rule.meta?.daily_limit ?? Infinity);

    if (cashFillUsedTodayInMemory + absRemaining > dailyLimit) {
        addTrace(pass, 'CASH_FILL', 'FAIL', `Límite diario de ${dailyLimit} cts excedido`);
        throw new Error(`Daily limit exceeded for Cash Filler: ${cashFillUsedTodayInMemory + absRemaining} > ${dailyLimit}`);
    }

    // Deterministic ID and unified reference for filtering
    const amountToLog = absRemaining;
    const classif: 'Efectivo' | 'Transferencia' = remaining_cents < 0 ? 'Efectivo' : 'Transferencia';

    // Use context product if it was a mixed payment overflow
    const productToUse = (remaining_cents < 0 && contextProductCod) ? contextProductCod : 'CASH';

    // Suffix is still needed for uniqueness in DB but we'll use baseRef in transaction_ref for filtering
    const sequence = lines.filter(l => l.parent_transaction_id === baseRef && l.origen_dato === 'CASH_FILLER').length + 1;
    const deterministicId = await generateHash(`${baseRef}-FILLER-${sequence}-${amountToLog}-${classif}`);

    const line: ReconciliationLine = {
        id: deterministicId,
        transaction_ref: baseRef, // Use original ID for filtering!
        parent_transaction_id: baseRef,
        source_type: 'BANK_TRANSFER',
        status: 'VALID',
        fecha_operacion: transaction.fecha,
        ingreso_banco_cents: remaining_cents < 0 ? 0 : amountToLog,
        venta_real_calculada_cents: remaining_cents < 0 ? 0 : amountToLog,
        comision_banco_cents: 0,
        product_cod: productToUse,
        product_um: 'UD',
        cantidad: 1,
        precio_unitario_cents: amountToLog,
        importe_linea_cents: amountToLog,
        cuadre_cents: 0,
        clasificacion: classif,
        origen_dato: 'CASH_FILLER',
        observaciones: remaining_cents < 0
            ? `Pago mixto (Transferencia + Efectivo) - Item: ${productToUse} - Ref: ${baseRef}`
            : `Cuadre automático: Faltante de productos por ${amountToLog} cts`,
        reconciliation_hash: deterministicId,
        created_at: new Date().toISOString()
    };

    lines.push(line);
    const traceMsg = remaining_cents < 0
        ? `Cubierto excedente de ${amountToLog} cts como efectivo (Pago Mixto en ${productToUse})`
        : `Cubierto faltante de ${amountToLog} cts para cuadre total`;

    addTrace(pass, 'CASH_FILL', 'SUCCESS', traceMsg);
    logs.push(`PASS ${pass} (CASH_FILL): ${traceMsg}`);

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
        tipo: 'MANUAL',
        referencia_transaccion: txRef,
        created_at: new Date().toISOString()
    });
  }

  private async createLine(tx: BankTransaction, p: Product, qty: number, origin: any, classif: any, observaciones?: string): Promise<ReconciliationLine> {
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
        observaciones: observaciones,
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
              matchingConfidence: 0,
              logs: ["Error inesperado en el motor."]
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
