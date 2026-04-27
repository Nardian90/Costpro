import { db, BankTransaction, ReconciliationLine, Product, MatchingRule, ProductMovement, MatchingTrace } from '../dexie';
import { useAuthStore } from '@/store';
import { v4 as uuidv4 } from "uuid";
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
    { id: "price-flex", tipo: "PRICE_FLEX", prioridad: 5, activo: false, meta: { range: 0.1, max_variation_percent: 10, max_variation_cents: 100 }, descripcion: "Flexibilidad de Precio (Auditada 5 días)" },
    { id: "tolerance", tipo: "TOLERANCE", prioridad: 6, activo: false, meta: { tolerance_cents: 100, mode: 'FIXED' }, descripcion: "Tolerancia de Cuadre (Rebaja/Propina)" },
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
    if (stockLimitRule) {
        this.allowNegativeStock = stockLimitRule.meta?.allow_negative ?? false;
    }
    products.forEach(p => this.stockMap.set(p.cod, p.stock_inicial_manual || 0));
  }

  async matchTransaction(transaction: BankTransaction, currentReconciledCents: number = 0): Promise<MatchingResult> {
    const startTime = Date.now();
    const sale_id = uuidv4();
    let user_id = 'SYSTEM';
    try {
        user_id = useAuthStore.getState().user?.id || 'SYSTEM';
    } catch (e) {
        // useAuthStore might fail in workers or SSR
    }

    // Period Cut-off Control
    const period = transaction.fecha.substring(0, 7); // YYYY-MM
    const closure = await db.period_closures.where('period').equals(period).first();
    if (closure && closure.status === 'CLOSED') {
        return {
            transactionId: transaction.referencia_origen,
            status: 'PENDIENTE',
            lines: [],
            movements: [],
            trace: [{ pass: 0, rule: 'CUT_OFF', status: 'FAIL', reason: 'Periodo cerrado', timestamp: Date.now() }],
            appliedRules: [],
            matchingConfidence: 0,
            logs: [`Error: El periodo ${period} está cerrado. No se permite conciliación.`]
        };
    }
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
    let matchedProducts: Map<string, { product: Product; qty: number; adjustment_type?: "REBAJA" | "PROPINA"; is_price_change?: boolean }> = new Map();

    for (const rule of this.rules) {
        if (rule.tipo === 'STOCK_LIMIT') continue;
        if (remainingForIdentification <= 0) break;

        switch (rule.tipo) {
            case 'HARD_REF': {
                const match = this.products.find(p => transaction.observaciones?.includes(p.cod) || p.cod === transaction.referencia_origen);
                if (match) {
                    const qty = Math.floor(remainingForIdentification / match.precio_cents);
                    if (qty > 0) {
                        matchedProducts.set(match.cod, { product: match, qty });
                        remainingForIdentification -= match.precio_cents * qty;
                        addTrace(rule.prioridad, "HARD_REF", "SUCCESS", `Match ${match.cod} (qty: ${qty})`);
                        appliedRules.push("HARD_REF");
                    }
                }
                break;
            }
            case "EXACT_SUM": {
                if (remainingForIdentification <= 0) break;
                const minMatchPercent = rule.meta?.min_match_percent ?? 90;
                const timeoutMs = rule.meta?.timeout_ms ?? 2000;
                const maxDepth = rule.meta?.max_depth ?? 12;
                const solverResult = this.solveCombinatorial(remainingForIdentification, maxDepth, timeoutMs);
                const matchedAmount = solverResult.total;
                const matchPercent = (matchedAmount / remainingForIdentification) * 100;
                if (matchedAmount > 0 && matchPercent >= minMatchPercent) {
                    for (const item of solverResult.items) {
                        const existing = matchedProducts.get(item.product.cod);
                        if (existing) {
                            existing.qty += item.qty;
                        } else {
                            matchedProducts.set(item.product.cod, { product: item.product, qty: item.qty });
                        }
                    }
                    remainingForIdentification -= matchedAmount;
                    addTrace(rule.prioridad, "EXACT_SUM", "SUCCESS", `Combinación: ${matchedAmount} (${matchPercent.toFixed(1)}%)`);
                    appliedRules.push("EXACT_SUM");
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
                    const diffA = a.precio_cents - remainingForIdentification;
                    const diffB = b.precio_cents - remainingForIdentification;
                    if (diffA !== diffB) return diffA - diffB;
                    const stockA = this.getVirtualStock(a.cod);
                    const stockB = this.getVirtualStock(b.cod);
                    return stockA - stockB;
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

                        addTrace(rule.prioridad, 'CASH_FILL', 'SUCCESS', `Ajuste óptimo: Inyección de ${cashNeeded} en ${candidate.cod}`, {
                            metrics: { expected_value: candidate.precio_cents, actual_value: targetCents, delta: cashNeeded },
                            flags
                        });
                        appliedRules.push('CASH_FILL');
                    } else {
                        addTrace(rule.prioridad, 'CASH_FILL', 'SKIPPED', `Excede umbral (${cashNeeded} > ${txThreshold})`);
                    }
                }
                break;
            }
            case 'PRICE_FLEX': {
                if (remainingForIdentification <= 0) break;
                const mentioned = this.products.find(p => transaction.observaciones?.includes(p.cod));
                if (mentioned) {
                    if (remainingForIdentification > 0 && remainingForIdentification % 1000 === 0) {
                        const fiveDaysAgo = new Date();
                        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                        const recentChanges = await db.product_price_changes
                            .where('product_cod').equals(mentioned.cod)
                            .and(pc => new Date(pc.fecha) > fiveDaysAgo)
                            .count();

                        if (recentChanges === 0) {
                             matchedProducts.set(mentioned.cod, { product: mentioned, qty: 1, is_price_change: true });
                             const oldPrice = mentioned.precio_cents;
                             const newPrice = remainingForIdentification;

                             await db.product_price_changes.add({
                                 id: uuidv4(),
                                 product_cod: mentioned.cod,
                                 old_price_cents: oldPrice,
                                 new_price_cents: newPrice,
                                 fecha: transaction.fecha,
                                 transaction_ref: transaction.referencia_origen,
                                 created_at: new Date().toISOString()
                             });

                             remainingForIdentification = 0;
                             addTrace(rule.prioridad, "PRICE_FLEX", "SUCCESS", `Flexibilidad de precio aplicada para ${mentioned.cod}`, { oldPrice, newPrice });
                             appliedRules.push("PRICE_FLEX");
                        } else {
                            addTrace(rule.prioridad, "PRICE_FLEX", "FAIL", `Cambio de precio bloqueado: ya cambió en los últimos 5 días`);
                        }
                    } else {
                        addTrace(rule.prioridad, "PRICE_FLEX", "FAIL", "Precio no comercial (debe ser múltiplo de 10)");
                    }
                }
                break;
            }
            case 'TOLERANCE': {
                if (remainingForIdentification <= 0) break;
                const toleranceCents = rule.meta?.tolerance_cents ?? 10000;

                const candidates = this.products
                    .filter(p => p.activo && p.precio_cents > 0)
                    .sort((a, b) => Math.abs(a.precio_cents - remainingForIdentification) - Math.abs(b.precio_cents - remainingForIdentification));

                const candidate = candidates[0];
                if (candidate) {
                    const diff = candidate.precio_cents - remainingForIdentification;
                    if (Math.abs(diff) <= toleranceCents) {
                        const adjType = diff > 0 ? "REBAJA" : "PROPINA";
                        matchedProducts.set(candidate.cod, { product: candidate, qty: 1, adjustment_type: adjType });
                        remainingForIdentification = 0;
                        addTrace(rule.prioridad, "TOLERANCE", "SUCCESS", `Tolerancia aplicada con ${candidate.cod} (${adjType})`, { delta: diff });
                        appliedRules.push("TOLERANCE");
                    }
                }
                break;
            }
            case 'WILDCARDS': {
                if (remainingForIdentification <= 0) break;
                const candidates = this.products
                    .filter(p => p.isWildcardCandidate && p.activo && p.precio_cents > 0 && p.precio_cents <= remainingForIdentification)
                    .filter(p => this.allowNegativeStock || this.getVirtualStock(p.cod) > 0)
                    .sort((a, b) => this.getVirtualStock(a.cod) - this.getVirtualStock(b.cod));

                if (candidates.length > 0) {
                    const p = candidates[0];
                    const qty = Math.floor(remainingForIdentification / p.precio_cents);
                    if (qty > 0) {
                        matchedProducts.set(p.cod, { product: p, qty });
                        remainingForIdentification -= p.precio_cents * qty;
                        addTrace(rule.prioridad, "WILDCARDS", "SUCCESS", `Match ${p.cod} (qty: ${qty})`);
                        appliedRules.push("WILDCARDS");
                    }
                }
                break;
            }
            case 'AUTO_SUPPLY': {
                if (remainingForIdentification <= 0) break;
                // Simplified auto supply for tests
                const candidates = this.products
                    .filter(p => p.activo && p.precio_cents > 0)
                    .sort((a, b) => this.getVirtualStock(a.cod) - this.getVirtualStock(b.cod));
                if (candidates.length > 0) {
                    const p = candidates[0];
                    matchedProducts.set(p.cod, { product: p, qty: 1 });
                    remainingForIdentification = 0;
                    addTrace(rule.prioridad, "AUTO_SUPPLY", "SUCCESS", `Auto-supply ${p.cod}`);
                    appliedRules.push("AUTO_SUPPLY");
                }
                break;
            }
        }
    }

    let remainingTransfer = targetCents;
    let purchaseOrderId = Math.floor(Math.random() * 1000000);

    for (const item of matchedProducts.values()) {
        const price = item.is_price_change ? (targetCents / item.qty) : item.product.precio_cents;
        const productTotal = price * item.qty;
        const coveredByTransfer = Math.max(0, Math.min(remainingTransfer, productTotal));
        const residual = productTotal - coveredByTransfer;

        let available = this.getVirtualStock(item.product.cod);
        if (this.useStockLimit && !this.allowNegativeStock && available < item.qty) {
            const success = await this.attemptDecomposition(item.product.cod, addTrace as any);
            if (!success) {
                const stillAvailable = this.getVirtualStock(item.product.cod);
                if (stillAvailable < item.qty) {
                    addTrace(1, 'STOCK_LIMIT', 'FAIL', `Stock insuficiente para ${item.product.cod} (${stillAvailable} < ${item.qty})`);
                    continue;
                }
            }
        }

        const line = await this.createLine(transaction, item.product, item.qty, coveredByTransfer, residual);
        line.sale_id = sale_id;
        line.user_id = user_id;
        line.purchase_order_id = purchaseOrderId;
        line.adjustment_type = item.adjustment_type;
        line.is_price_change = item.is_price_change;
        if (item.is_price_change) {
            line.precio_unitario_cents = price;
            line.total_amount_cents = productTotal;
        }

        lines.push(line);
        this.updateVirtualStock(item.product.cod, item.qty, transaction.referencia_origen);
        remainingTransfer -= coveredByTransfer;
    }

    let status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'OVERPAYMENT' = 'PENDIENTE';
    const tolerance = 50; // cents
    if (lines.length > 0) {
        if (remainingTransfer > tolerance) status = 'PARCIAL';
        else if (remainingTransfer < -tolerance) status = 'OVERPAYMENT';
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

  private async persistLog(tx: BankTransaction, result: MatchingResult, duration: number) {
    try {
        await db.matching_logs.add({
            id: uuidv4(),
            sale_id: (result as any).sale_id || (result as any).lines?.[0]?.sale_id,
            transaction_ref: tx.referencia_origen,
            fecha_ejecucion: new Date().toISOString(),
            resultado_estado: result.status,
            matching_confidence: result.matchingConfidence,
            applied_rules: result.appliedRules,
            trace: result.trace,
            logs: result.logs,
            created_at: new Date().toISOString(),
            duration_ms: duration
        });
    } catch (e) {
        console.error('Error persisting matching log', e);
    }
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
    options?: { strategy?: "MIN_STOCK" | "MAX_VALUE"; dayVolumes?: Record<string, number> }
  ): Promise<ReconciliationLine[]> {
    let remainingDiff = targetTotal - currentTotal;
    if (remainingDiff <= 0 || dates.length === 0) return [];

    const sortedDates = [...dates];
    if (options?.dayVolumes) {
        sortedDates.sort((a, b) => (options.dayVolumes![a] || 0) - (options.dayVolumes![b] || 0));
    }

    const lines: ReconciliationLine[] = [];
    for (const date of sortedDates) {
      if (remainingDiff <= 0) break;
      // Allow multiple products per date to reach the goal
      let itemsOnThisDate = 0;
      while (remainingDiff > 0 && itemsOnThisDate < 20) {
          const p = this.products.find(p => p.precio_cents > 0 && p.precio_cents <= remainingDiff);
          if (!p) break;

          const line = await this.createLine({ fecha: date, referencia_origen: `GOAL-${date}-${uuidv4()}`, importe_cents: 0 } as any, p, 1, 0, p.precio_cents);
          line.source_type = 'REAL_CASH_GOAL';
          line.user_id = 'SYSTEM';
          line.sale_id = uuidv4();
          lines.push(line);
          remainingDiff -= line.total_amount_cents;
          this.updateVirtualStock(p.cod, 1, line.transaction_ref);
          itemsOnThisDate++;
      }
    }
    return lines;
  }


  private solveCombinatorial(target: number, maxDepth: number, timeoutMs: number): { items: { product: Product, qty: number }[], total: number } {
    const startTime = Date.now();
    const eligibleProducts = this.products
        .filter(p => p.precio_cents > 0 && p.precio_cents <= target)
        .sort((a, b) => b.precio_cents - a.precio_cents);

    let bestCombination: { product: Product, qty: number }[] = [];
    let bestTotal = 0;

    const backtrack = (remaining: number, startIndex: number, currentCount: number, currentItems: Map<string, { product: Product, qty: number }>) => {
        if (Date.now() - startTime > timeoutMs) return;
        const currentTotal = target - remaining;
        if (currentTotal > bestTotal) {
            bestTotal = currentTotal;
            bestCombination = Array.from(currentItems.values()).map(item => ({...item}));
        }
        if (remaining === 0 || currentCount >= maxDepth || startIndex >= eligibleProducts.length) return;

        for (let i = startIndex; i < eligibleProducts.length; i++) {
            const p = eligibleProducts[i];
            if (this.useStockLimit && !this.allowNegativeStock) {
                const usedSoFar = currentItems.get(p.cod)?.qty || 0;
                const available = this.getVirtualStock(p.cod);
                if (usedSoFar >= available) continue;
            }
            if (p.precio_cents <= remaining) {
                const existing = currentItems.get(p.cod);
                if (existing) existing.qty++;
                else currentItems.set(p.cod, { product: p, qty: 1 });
                backtrack(remaining - p.precio_cents, i, currentCount + 1, currentItems);
                if (bestTotal === target) return;
                const item = currentItems.get(p.cod)!;
                if (item.qty > 1) item.qty--;
                else currentItems.delete(p.cod);
            }
        }
    };

    backtrack(target, 0, 0, new Map());
    return { items: bestCombination, total: bestTotal };
  }

  private async attemptDecomposition(productCod: string, addTrace?: any): Promise<boolean> {
    const targetProduct = this.products.find(p => p.cod === productCod);
    if (!targetProduct || !targetProduct.id_grupo) return false;

    const ancestors = this.products.filter(p => p.cod_hijo === productCod && p.cod !== productCod);
    if (ancestors.length === 0) return false;

    for (const ancestor of ancestors) {
      let availableAncestorStock = this.stockMap.get(ancestor.cod) || 0;

      if (availableAncestorStock <= 0) {
          const success = await this.attemptDecomposition(ancestor.cod, addTrace);
          if (success) availableAncestorStock = this.stockMap.get(ancestor.cod) || 0;
      }

      if (availableAncestorStock > 0) {
        const factor = ancestor.contenido_paquete || 1;
        this.stockMap.set(ancestor.cod, availableAncestorStock - 1);
        const currentTargetStock = this.stockMap.get(targetProduct.cod) || 0;
        this.stockMap.set(targetProduct.cod, currentTargetStock + factor);

        this.pendingMovements.push({
            id: uuidv4(),
            fecha: new Date().toISOString(),
            producto_origen_cod: ancestor.cod,
            producto_destino_cod: targetProduct.cod,
            cantidad_origen: 1,
            cantidad_destino: factor,
            tipo: 'DECOMPOSITION',
            created_at: new Date().toISOString()
        });

        if (addTrace) addTrace(1, 'DECOMPOSITION', 'SUCCESS', `Descompuesto ${ancestor.cod} -> ${targetProduct.cod} (Factor: ${factor})`);
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
    const hashInput = `${tx.referencia_origen}-${p.cod}-${qty}-${transfer}-${cash}-${Date.now()}`;
    const id = await generateHash(hashInput);

    // NIIF 15: Transfer of Control validation
    // In this model, control transfer is assumed at the moment of matching for bank transfers
    // as it signifies the fulfillment of the performance obligation (delivery/payment).
    const control_transfer_date = tx.fecha;
    const performance_obligation_id = `PO-${p.cod}-${id.substring(0,8)}`;

    return {
        id, transaction_ref: tx.referencia_origen, parent_transaction_id: tx.referencia_origen, fecha_operacion: tx.fecha,
        transfer_amount_cents: transfer, cash_amount_cents: cash, total_amount_cents: total,
        status: 'VALID', payment_status: 'MATCHED', product_cod: p.cod, product_name: p.descripcion, product_um: p.um || 'UD',
        cantidad: qty, precio_unitario_cents: p.precio_cents, origen_dato: 'AUTO_MATCH', source_type: 'BANK_TRANSFER',
        reconciliation_hash: id, created_at: new Date().toISOString(),
        control_transfer_date,
        performance_obligation_id
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
