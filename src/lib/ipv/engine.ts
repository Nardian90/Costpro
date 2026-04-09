import { db, BankTransaction, ReconciliationLine, Product, MatchingRule, ProductMovement, MatchingTrace } from '../dexie';
import { v4 as uuidv4 } from 'uuid';
import { generateHash } from '../utils';
import { isProductAMedida } from './utils';

export { generateHash };

export type RulesConfig = MatchingRule[];

export function getDefaultIPVRulesConfig(): RulesConfig {
  return [
    { id: "stock-limit", tipo: "STOCK_LIMIT", prioridad: 1, activo: true, meta: { allow_negative: false }, descripcion: "Límites de Stock" },
    { id: "hard-ref", tipo: "HARD_REF", prioridad: 2, activo: true, descripcion: "Referencia Exacta" },
    { id: "exact-sum", tipo: "EXACT_SUM", prioridad: 3, activo: true, meta: { depth: 1200, timeout: 200000, max_depth: 1200, timeout_ms: 200000 }, descripcion: "Suma Exacta (Combinatoria)" },
    { id: "cash-fill", tipo: "CASH_FILL", prioridad: 4, activo: true, meta: { daily_cash_limit: 20000, max_per_tx_threshold: 5000, mode: "SOFT" }, descripcion: "Inyección de Efectivo (Enterprise)" },
    { id: "wildcards", tipo: "WILDCARDS", prioridad: 5, activo: true, descripcion: "Comodines" },
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
  private dailyCashUsedByDate: Map<string, number> = new Map();

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

  private async persistLog(transaction: BankTransaction, result: MatchingResult, durationMs: number) {
    try {
      await db.matching_logs.put({
        id: transaction.referencia_origen + '-log',
        transaction_ref: transaction.referencia_origen,
        fecha_ejecucion: new Date().toISOString(),
        resultado_estado: result.status === 'OVERPAYMENT' ? 'COMPLETO' : result.status as any,
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
    } catch (e) {}
  }

  async matchTransaction(transaction: BankTransaction, currentReconciledCents: number = 0): Promise<MatchingResult> {
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
        return { transactionId: transaction.referencia_origen, status: 'COMPLETO', lines: [], movements: [], trace, appliedRules: ['AUTO_DB'], matchingConfidence: 100, logs: [] };
    }

    if (targetCents <= 0) {
      return { transactionId: transaction.referencia_origen, status: 'COMPLETO', lines: [], movements: [], trace, appliedRules, matchingConfidence: 100, logs: [] };
    }

    let remainingForIdentification = targetCents;
    let matchedProducts: Map<string, { product: Product; qty: number }> = new Map();

    for (const rule of this.rules) {
        if (rule.tipo === 'STOCK_LIMIT') continue;

                switch (rule.tipo) {
            case 'HARD_REF': {
                const match = this.products.find(p => transaction.observaciones?.includes(p.cod) || p.cod === transaction.referencia_origen);
                if (match) {
                    const qty = Math.max(1, Math.floor(remainingForIdentification / match.precio_cents));
                    matchedProducts.set(match.cod, { product: match, qty });
                    remainingForIdentification -= match.precio_cents * qty;
                    addTrace(rule.prioridad, 'HARD_REF', 'SUCCESS', `Match ${match.cod}`);
                    appliedRules.push('HARD_REF');
                }
                break;
            }
            case 'EXACT_SUM': {
                if (remainingForIdentification <= 0) break;
                const match = this.products.find(p => p.precio_cents > 0 && remainingForIdentification % p.precio_cents === 0);
                if (match) {
                    const qty = remainingForIdentification / match.precio_cents;
                    matchedProducts.set(match.cod, { product: match, qty });
                    remainingForIdentification = 0;
                    addTrace(rule.prioridad, 'EXACT_SUM', 'SUCCESS', `Match Sum ${match.cod}`);
                    appliedRules.push('EXACT_SUM');
                }
                break;
            }
            case 'CASH_FILL': {
                if (remainingForIdentification <= 0) break;
                const txDate = transaction.fecha;
                const currentDailyUsed = this.dailyCashUsedByDate.get(txDate) || 0;
                const dailyLimit = rule.meta?.daily_cash_limit ?? 20000;
                const txThreshold = rule.meta?.max_per_tx_threshold ?? 5000;
                let mode = rule.meta?.mode ?? 'SOFT';
                if (typeof mode === 'boolean') mode = mode ? 'STRICT' : 'SOFT';

                if (mode === 'STRICT' && currentDailyUsed >= dailyLimit) {
                    addTrace(rule.prioridad, 'CASH_FILL', 'SKIPPED', 'Límite diario alcanzado (STRICT)');
                    break;
                }

                const eligibleProducts = this.products.filter(p =>
                    p.activo &&
                    p.precio_cents > 0 &&
                    p.isEligibleForCashFill !== false &&
                    p.precio_cents > remainingForIdentification
                ).sort((a, b) => {
                    // R1: Priorizar productos con menor stock positivo para llevarlos a cero
                    const stockA = this.getVirtualStock(a.cod);
                    const stockB = this.getVirtualStock(b.cod);
                    if (stockA > 0 && stockB > 0) return stockA - stockB;
                    if (stockA > 0) return -1;
                    if (stockB > 0) return 1;
                    return (a.precio_cents - remainingForIdentification) - (b.precio_cents - remainingForIdentification);
                });

                const candidate = eligibleProducts[0];
                if (candidate) {
                    const cashNeeded = candidate.precio_cents - remainingForIdentification;
                    if (cashNeeded <= txThreshold) {
                        const flags = [];
                        if (currentDailyUsed + cashNeeded > dailyLimit) {
                            flags.push('CASH_LIMIT_EXCEEDED');
                            if (mode === 'STRICT') {
                                addTrace(rule.prioridad, 'CASH_FILL', 'FAIL', 'Límite diario superado');
                                break;
                            }
                        }

                        matchedProducts.set(candidate.cod, { product: candidate, qty: 1 });
                        this.dailyCashUsedByDate.set(txDate, currentDailyUsed + cashNeeded);
                        remainingForIdentification = 0;

                        addTrace(rule.prioridad, 'CASH_FILL', 'SUCCESS', `Inyección: ${cashNeeded} en ${candidate.cod}`, {
                            metrics: { expected_value: candidate.precio_cents, actual_value: remainingForIdentification, delta: cashNeeded },
                            flags
                        });
                        appliedRules.push('CASH_FILL');
                    } else {
                        addTrace(rule.prioridad, 'CASH_FILL', 'SKIPPED', `Excede umbral por transacción (${cashNeeded} > ${txThreshold})`);
                    }
                }
                break;
            }
            case 'WILDCARDS': {
                const wildcards = this.products
                    .filter(p => p.isWildcardCandidate || (p as any).is_wildcard)
                    .sort((a, b) => {
                        const stockA = this.getVirtualStock(a.cod);
                        const stockB = this.getVirtualStock(b.cod);
                        if (stockA > 0 && stockB > 0) return stockA - stockB;
                        if (stockA > 0) return -1;
                        if (stockB > 0) return 1;
                        return 0;
                    });

                for (const wildcard of wildcards) {
                    if (matchedProducts.has(wildcard.cod)) continue;
                    const qty = remainingForIdentification > 0 ? Math.max(1, Math.floor(remainingForIdentification / wildcard.precio_cents)) : 1;
                    matchedProducts.set(wildcard.cod, { product: wildcard, qty });
                    remainingForIdentification -= wildcard.precio_cents * qty;
                    addTrace(rule.prioridad, 'WILDCARDS', 'SUCCESS', `Match Wildcard ${wildcard.cod} (Stock: ${this.getVirtualStock(wildcard.cod)})`);
                    if (!appliedRules.includes('WILDCARDS')) appliedRules.push('WILDCARDS');
                    if (remainingForIdentification <= 0 && matchedProducts.size >= 2) break;
                }
                break;
            }
        }
        if (remainingForIdentification <= 0 && rule.tipo !== 'WILDCARDS') break;
    }

    let remainingTransfer = targetCents;
    for (const item of matchedProducts.values()) {
        const productTotal = item.product.precio_cents * item.qty;
        const coveredByTransfer = Math.max(0, Math.min(remainingTransfer, productTotal));
        const residual = productTotal - coveredByTransfer;

        let available = this.getVirtualStock(item.product.cod);
        if (this.useStockLimit && !this.allowNegativeStock && available < item.qty) {
            const success = await this.attemptDecomposition(item.product.cod);
            if (!success && available < item.qty) continue;
        }

        lines.push(await this.createLine(transaction, item.product, item.qty, coveredByTransfer, residual));
        this.updateVirtualStock(item.product.cod, item.qty, transaction.referencia_origen);
        remainingTransfer -= coveredByTransfer;
    }

    // R4: Manejo de Sobrepagos (Auto-Suplencia)
    // Si sobra transferencia, buscamos productos para agotar el saldo.
    if (remainingTransfer > 1) {
        const candidates = this.products
            .filter(p => p.activo && p.precio_cents > 0 && !matchedProducts.has(p.cod))
            .sort((a, b) => {
                const stockA = this.getVirtualStock(a.cod);
                const stockB = this.getVirtualStock(b.cod);
                if (stockA > 0 && stockB > 0) return stockA - stockB;
                return a.precio_cents - b.precio_cents;
            });

        for (const candidate of candidates) {
            if (remainingTransfer <= 1) break;

            const qty = 1;
            const productTotal = candidate.precio_cents * qty;
            const coveredByTransfer = Math.min(remainingTransfer, productTotal);
            const residual = Math.max(0, productTotal - coveredByTransfer);

            let available = this.getVirtualStock(candidate.cod);
            if (this.useStockLimit && !this.allowNegativeStock && available < qty) {
                const success = await this.attemptDecomposition(candidate.cod);
                if (!success && available < qty) continue;
            }

            lines.push(await this.createLine(transaction, candidate, qty, coveredByTransfer, residual));
            this.updateVirtualStock(candidate.cod, qty, transaction.referencia_origen);
            remainingTransfer -= coveredByTransfer;

            addTrace(99, 'AUTO_SUPPLY', 'SUCCESS', `Auto-suplencia con ${candidate.cod} para agotar sobrepago`, {
                excess_exhausted: coveredByTransfer,
                residual_cash: residual
            });
            if (!appliedRules.includes('AUTO_SUPPLY')) appliedRules.push('AUTO_SUPPLY');
        }
    }

    let status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'OVERPAYMENT' = 'PENDIENTE';
    if (lines.length > 0) {
        if (remainingTransfer > 1) status = 'OVERPAYMENT';
        else status = 'COMPLETO';
    }

    lines.forEach(l => l.payment_status = (status === 'OVERPAYMENT' ? 'OVERPAYMENT' : 'MATCHED'));

    const result: MatchingResult = {
      transactionId: transaction.referencia_origen, status, lines, movements: [...this.pendingMovements],
      trace, appliedRules, matchingConfidence: (status === 'COMPLETO' || status === 'OVERPAYMENT') ? 100 : 0, logs
    };

    this.pendingMovements = [];
    await this.persistLog(transaction, result, Date.now() - startTime);
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
    options?: { strategy?: "MIN_STOCK" | "MAX_VALUE" }
  ): Promise<ReconciliationLine[]> {
    let remainingDiff = targetTotal - currentTotal;
    if (remainingDiff <= 0 || dates.length === 0) return [];
    const lines: ReconciliationLine[] = [];
    for (const date of dates) {
      if (remainingDiff <= 0) break;
      const p = this.products.find(p => p.precio_cents > 0 && p.precio_cents <= remainingDiff);
      if (p) {
        const line = await this.createLine({ fecha: date, referencia_origen: `GOAL-\text{date}-${uuidv4()}`, importe_cents: 0 } as any, p, 1, 0, p.precio_cents);
        line.source_type = 'REAL_CASH_GOAL';
        lines.push(line);
        remainingDiff -= line.total_amount_cents;
        this.updateVirtualStock(p.cod, 1, line.transaction_ref);
      }
    }
    return lines;
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
          if (success) availableAncestorStock = this.stockMap.get(ancestor.cod) || 0;
      }
      if (availableAncestorStock > 0) {
        const factor = ancestor.contenido_paquete || 1;
        this.stockMap.set(ancestor.cod, availableAncestorStock - 1);
        this.stockMap.set(targetProduct.cod, (this.stockMap.get(targetProduct.cod) || 0) + factor);
        this.pendingMovements.push({
            id: uuidv4(), fecha: new Date().toISOString(), producto_origen_cod: ancestor.cod, producto_destino_cod: targetProduct.cod,
            cantidad_origen: 1, cantidad_destino: factor, tipo: 'DECOMPOSITION', created_at: new Date().toISOString()
        });
        return true;
      }
    }
    return false;
  }

  private getVirtualStock(productCod: string): number {
    return this.stockMap.get(productCod) || 0;
  }

  private updateVirtualStock(productCod: string, qty: number, txRef: string) {
    const current = this.stockMap.get(productCod) || 0;
    this.stockMap.set(productCod, current - qty);
    this.pendingMovements.push({
        id: uuidv4(), fecha: new Date().toISOString(), producto_origen_cod: productCod, producto_destino_cod: '',
        cantidad_origen: qty, cantidad_destino: 0, tipo: 'MANUAL', referencia_transaccion: txRef, created_at: new Date().toISOString()
    });
  }

  private async createLine(tx: BankTransaction, p: Product, qty: number, transfer: number, cash: number): Promise<ReconciliationLine> {
    const total = p.precio_cents * qty;
    const hashInput = `${tx.referencia_origen}-${p.cod}-${qty}-${transfer}-${cash}`;
    const id = await generateHash(hashInput);
    return {
        id, transaction_ref: tx.referencia_origen, parent_transaction_id: tx.referencia_origen, fecha_operacion: tx.fecha,
        transfer_amount_cents: transfer, cash_amount_cents: cash, total_amount_cents: total,
        status: 'VALID', payment_status: 'MATCHED', product_cod: p.cod, product_name: p.descripcion, product_um: p.um || 'UD',
        cantidad: qty, precio_unitario_cents: p.precio_cents, origen_dato: 'AUTO_MATCH', source_type: 'BANK_TRANSFER',
        reconciliation_hash: id, created_at: new Date().toISOString()
    };
  }

  async reconcileAll(transactions: (BankTransaction & { current_reconciled_cents?: number })[], onProgress?: (p: number) => void): Promise<MatchingResult[]> {
    const results: MatchingResult[] = [];
    for (let i = 0; i < transactions.length; i++) {
      results.push(await this.matchTransaction(transactions[i], transactions[i].current_reconciled_cents || 0));
      if (onProgress) onProgress(Math.round(((i + 1) / transactions.length) * 100));
    }
    return results;
  }
}
