import { v4 as uuidv4 } from 'uuid';
import { db, BankTransaction, Product, MatchingRule, ReconciliationLine, ProductMovement } from '../dexie';
import { generateHash } from '../utils';
export { generateHash };
import { useAuthStore } from '../../store/index';

export type RulesConfig = MatchingRule[];
export interface MatchingTrace {
  pass: number;
  rule: string;
  status: 'SUCCESS' | 'FAIL' | 'SKIPPED';
  reason?: string;
  details?: any;
  timestamp: number;
}

export function getDefaultIPVRulesConfig(): RulesConfig {
  return [
    { id: "stock-limit", tipo: "STOCK_LIMIT", prioridad: 1, activo: true, meta: { allow_negative: false }, descripcion: "Límites de Stock" },
    { id: "hard-ref", tipo: "HARD_REF", prioridad: 2, activo: true, descripcion: "Referencia Exacta" },
    { id: "exact-sum", tipo: "EXACT_SUM", prioridad: 3, activo: true, meta: { depth: 12, timeout: 2000, max_depth: 12, timeout_ms: 2000 }, descripcion: "Suma Exacta (Combinatoria)" },
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

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);

    this.useStockLimit = this.rules.some(r => r.tipo === 'STOCK_LIMIT');
    const stockLimitRule = this.rules.find(r => r.tipo === 'STOCK_LIMIT');
    if (stockLimitRule) {
        this.allowNegativeStock = stockLimitRule.meta?.allow_negative ?? false;
    } else {
        this.allowNegativeStock = true;
    }

    products.forEach(p => this.stockMap.set(p.cod, p.stock_inicial_manual || 0));
  }

  async matchTransaction(transaction: BankTransaction, currentReconciledCents: number = 0): Promise<MatchingResult> {
    const startTime = Date.now();
    const sale_id = uuidv4();
    let user_id = 'SYSTEM';
    try { user_id = useAuthStore.getState().user?.id || 'SYSTEM'; } catch (e) {}

    const period = transaction.fecha.substring(0, 7);
    try {
        const closure = await db.period_closures.where('period').equals(period).first();
        if (closure && closure.status === 'CLOSED') {
            return { transactionId: transaction.referencia_origen, status: 'PENDIENTE', lines: [], movements: [], trace: [{ pass: 0, rule: 'CUT_OFF', status: 'FAIL', reason: 'Periodo cerrado', timestamp: Date.now() }], appliedRules: [], matchingConfidence: 0, logs: [`Error: El periodo ${period} está cerrado. No se permite conciliación.`] };
        }
    } catch (e) {}

    const targetCents = transaction.importe_cents - currentReconciledCents;
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
      return { transactionId: transaction.referencia_origen, status: 'COMPLETO', lines: [], movements: [], trace, appliedRules: [], matchingConfidence: 100, logs: [] };
    }

    let remainingForIdentification = targetCents;
    let matchedProducts: Map<string, { product: Product; qty: number; adjustment_type?: "REBAJA" | "PROPINA" }> = new Map();

    const mergeProduct = (p: Product, qty: number, adj?: "REBAJA" | "PROPINA") => {
        const existing = matchedProducts.get(p.cod);
        if (existing) { existing.qty += qty; if (adj) existing.adjustment_type = adj; }
        else { matchedProducts.set(p.cod, { product: p, qty, adjustment_type: adj }); }
    };

    for (const rule of this.rules) {
        if (rule.tipo === 'STOCK_LIMIT' || remainingForIdentification <= 10) continue;

        switch (rule.tipo) {
            case 'HARD_REF': {
                const match = this.products.find(p => (transaction.observaciones?.includes(p.cod) || p.cod === transaction.referencia_origen));
                if (match) {
                    if (!this.allowNegativeStock && this.getVirtualStock(match.cod) <= 0) await this.attemptDecomposition(match.cod, 'TEMP');
                    const available = this.getVirtualStock(match.cod);
                    if (this.allowNegativeStock || available > 0) {
                        let qty = Math.floor(remainingForIdentification / match.precio_cents);
                        if (!this.allowNegativeStock) qty = Math.min(qty, available);
                        if (qty > 0) {
                            mergeProduct(match, qty);
                            remainingForIdentification -= match.precio_cents * qty;
                            this.updateVirtualStock(match.cod, qty, 'TEMP');
                            appliedRules.push("HARD_REF");
                        }
                    }
                }
                break;
            }
            case "EXACT_SUM": {
                if (!this.allowNegativeStock) {
                    for (const p of this.products) { if (p.id_grupo && this.getVirtualStock(p.cod) <= 0) await this.attemptDecomposition(p.cod, 'TEMP'); }
                }
                const solverResult = this.solveCombinatorial(remainingForIdentification, rule.meta?.max_depth || 12, rule.meta?.timeout_ms || 2000);
                if (solverResult.total > 0 && (solverResult.total / remainingForIdentification) >= 0.9) {
                    for (const item of solverResult.items) {
                        mergeProduct(item.product, item.qty);
                        this.updateVirtualStock(item.product.cod, item.qty, 'TEMP');
                    }
                    remainingForIdentification -= solverResult.total;
                    appliedRules.push("EXACT_SUM");
                }
                break;
            }
            case 'CASH_FILL': {
                const txThreshold = rule.meta?.max_per_tx_threshold || 5000;
                const candidate = this.products
                    .filter(p => p.precio_cents > remainingForIdentification && (p.precio_cents - remainingForIdentification) <= txThreshold)
                    .filter(p => this.allowNegativeStock || this.getVirtualStock(p.cod) > 0)
                    .sort((a, b) => a.precio_cents - b.precio_cents)[0];
                if (candidate) {
                    mergeProduct(candidate, 1);
                    remainingForIdentification = 0;
                    appliedRules.push('CASH_FILL');
                }
                break;
            }
            case 'TOLERANCE': {
                const tolerance = rule.meta?.tolerance_cents || 100;
                if (Math.abs(remainingForIdentification) <= 10) { remainingForIdentification = 0; appliedRules.push("TOLERANCE"); break; }
                const candidate = this.products
                    .filter(p => Math.abs(p.precio_cents - remainingForIdentification) <= tolerance)
                    .filter(p => this.allowNegativeStock || this.getVirtualStock(p.cod) > 0)
                    .sort((a, b) => Math.abs(a.precio_cents - remainingForIdentification) - Math.abs(b.precio_cents - remainingForIdentification))[0];
                if (candidate) {
                    mergeProduct(candidate, 1, candidate.precio_cents > remainingForIdentification ? "REBAJA" : "PROPINA");
                    remainingForIdentification = 0;
                    appliedRules.push("TOLERANCE");
                }
                break;
            }
            case 'WILDCARDS': {
                let anyWild = false;
                while (remainingForIdentification > 10) {
                    const candidates = this.products.filter(p => p.isWildcardCandidate && p.precio_cents <= remainingForIdentification && (this.allowNegativeStock || this.getVirtualStock(p.cod) > 0))
                        .sort((a, b) => this.getVirtualStock(a.cod) - this.getVirtualStock(b.cod));
                    if (candidates.length === 0) break;
                    const p = candidates[0];
                    let qty = Math.floor(remainingForIdentification / p.precio_cents);
                    if (!this.allowNegativeStock) qty = Math.min(qty, this.getVirtualStock(p.cod));
                    if (qty > 0) {
                        mergeProduct(p, qty);
                        remainingForIdentification -= p.precio_cents * qty;
                        this.updateVirtualStock(p.cod, qty, 'TEMP');
                        anyWild = true;
                    } else break;
                }
                if (anyWild) appliedRules.push("WILDCARDS");
                break;
            }
            case 'AUTO_SUPPLY': {
                let anyAuto = false;
                const candidates = this.products.filter(p => p.precio_cents > 0).sort((a, b) => this.getVirtualStock(a.cod) - this.getVirtualStock(b.cod));
                for (const p of candidates) {
                    if (remainingForIdentification <= 10) break;
                    if (!this.allowNegativeStock && this.getVirtualStock(p.cod) <= 0) continue;
                    mergeProduct(p, 1);
                    remainingForIdentification -= p.precio_cents;
                    this.updateVirtualStock(p.cod, 1, 'TEMP');
                    anyAuto = true;
                }
                if (anyAuto) appliedRules.push("AUTO_SUPPLY");
                break;
            }
        }
    }

    // Rollback temp stock
    this.products.forEach(p => this.stockMap.set(p.cod, p.stock_inicial_manual || 0));
    this.pendingMovements = this.pendingMovements.filter(m => m.referencia_transaccion !== 'TEMP');

    const lines: ReconciliationLine[] = [];
    let remainingTransfer = targetCents;
    const sortedMatched = Array.from(matchedProducts.values()).sort((a, b) => this.getVirtualStock(a.product.cod) - this.getVirtualStock(b.product.cod));

    for (const item of sortedMatched) {
        if (!this.allowNegativeStock && this.getVirtualStock(item.product.cod) < item.qty) await this.attemptDecomposition(item.product.cod);
        if (!this.allowNegativeStock && this.getVirtualStock(item.product.cod) < item.qty) continue;

        const total = item.product.precio_cents * item.qty;
        const covered = Math.max(0, Math.min(remainingTransfer, total));
        const line = await this.createLine(transaction, item.product, item.qty, covered, total - covered);
        line.sale_id = sale_id;
        line.user_id = user_id;
        line.adjustment_type = item.adjustment_type;
        lines.push(line);
        this.updateVirtualStock(item.product.cod, item.qty, transaction.referencia_origen);
        remainingTransfer -= covered;
    }

    let status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'OVERPAYMENT' = 'PENDIENTE';
    if (lines.length > 0) {
        if (remainingForIdentification <= 100 || (remainingForIdentification / targetCents) <= 0.05) {
            status = 'COMPLETO';
        } else {
            status = 'PARCIAL';
        }
        if (remainingTransfer < -100) status = 'OVERPAYMENT';
    }

    const result: MatchingResult = {
      transactionId: transaction.referencia_origen,
      status,
      lines,
      movements: [...this.pendingMovements],
      trace,
      appliedRules,
      matchingConfidence: status === 'COMPLETO' ? 100 : 0,
      logs
    };
    this.pendingMovements = [];
    await this.persistLog(transaction, result, Date.now() - startTime);
    return result;
  }

  private async persistLog(tx: BankTransaction, result: MatchingResult, duration: number) {
    try {
        await db.matching_logs.add({
            id: uuidv4(),
            sale_id: result.lines[0]?.sale_id,
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
    } catch (e) {}
  }

  async distributeGlobalGoal(target: number, current: number, dates: string[], options?: any): Promise<ReconciliationLine[]> {
    let rem = target - current;
    if (rem <= 0 || dates.length === 0) return [];
    const sorted = [...dates];
    if (options?.dayVolumes) sorted.sort((a, b) => (options.dayVolumes[a] || 0) - (options.dayVolumes[b] || 0));

    const lines: ReconciliationLine[] = [];
    let idx = 0;
    while (rem > 0) {
        const p = this.products.filter(p => p.precio_cents > 0 && p.precio_cents <= rem).sort((a, b) => b.prioridad_algoritmo - a.prioridad_algoritmo)[0];
        if (!p) break;
        const line = await this.createLine({ fecha: sorted[idx % sorted.length], referencia_origen: `GOAL-${uuidv4()}` } as any, p, 1, 0, p.precio_cents);
        line.source_type = 'REAL_CASH_GOAL';
        line.user_id = 'SYSTEM';
        line.sale_id = uuidv4();
        lines.push(line);
        rem -= p.precio_cents;
        idx++;
        if (idx > sorted.length * 100) break;
    }
    return lines;
  }

  private solveCombinatorial(target: number, maxDepth: number, timeout: number): { items: any[], total: number } {
    const start = Date.now();
    const candidates = this.products.filter(p => p.precio_cents > 0 && p.precio_cents <= target).sort((a, b) => b.precio_cents - a.precio_cents);
    let best: any[] = [];
    let bestT = 0;

    const solve = (r: number, i: number, d: number, curr: Map<string, any>) => {
        if (Date.now() - start > timeout) return;
        if (target - r > bestT) {
            bestT = target - r;
            best = Array.from(curr.values()).map(x => ({...x}));
        }
        if (r === 0 || d >= maxDepth || i >= candidates.length) return;

        for (let j = i; j < candidates.length; j++) {
            const p = candidates[j];
            if (!this.allowNegativeStock && (curr.get(p.cod)?.qty || 0) >= this.getVirtualStock(p.cod)) continue;
            if (p.precio_cents <= r) {
                const item = curr.get(p.cod);
                if (item) item.qty++;
                else curr.set(p.cod, { product: p, qty: 1 });
                solve(r - p.precio_cents, j, d + 1, curr);
                if (bestT === target) return;
                const it = curr.get(p.cod);
                if (it.qty > 1) it.qty--;
                else curr.delete(p.cod);
            }
        }
    };
    solve(target, 0, 0, new Map());
    return { items: best, total: bestT };
  }

  private async attemptDecomposition(cod: string, tag: string = ''): Promise<boolean> {
    const p = this.products.find(x => x.cod === cod);
    const nonD = ['A Medida', 'Kg', 'G', 'Lb', 'Oz', 'M', 'M2', 'M3', 'L', 'Ml'];
    if (!p || !p.id_grupo || (p.um && nonD.includes(p.um))) return false;

    const ancestors = this.products.filter(a => a.cod_hijo === cod && a.cod !== cod);
    for (const a of ancestors) {
      if ((this.stockMap.get(a.cod) || 0) <= 0) await this.attemptDecomposition(a.cod, tag);
      if ((this.stockMap.get(a.cod) || 0) > 0) {
        const f = a.contenido_paquete || 1;
        this.stockMap.set(a.cod, (this.stockMap.get(a.cod) || 0) - 1);
        this.stockMap.set(cod, (this.stockMap.get(cod) || 0) + f);
        this.pendingMovements.push({ id: uuidv4(), fecha: new Date().toISOString(), producto_origen_cod: a.cod, producto_destino_cod: cod, cantidad_origen: 1, cantidad_destino: f, tipo: 'DECOMPOSITION', created_at: new Date().toISOString(), referencia_transaccion: tag });
        return true;
      }
    }
    return false;
  }

  private getVirtualStock(cod: string): number { return this.stockMap.get(cod) || 0; }
  private updateVirtualStock(cod: string, qty: number, ref: string) {
    this.stockMap.set(cod, (this.stockMap.get(cod) || 0) - qty);
    this.pendingMovements.push({ id: uuidv4(), fecha: new Date().toISOString(), producto_origen_cod: cod, producto_destino_cod: '', cantidad_origen: qty, cantidad_destino: 0, tipo: 'MANUAL', referencia_transaccion: ref, created_at: new Date().toISOString() });
  }

  private async createLine(tx: BankTransaction, p: Product, qty: number, transfer: number, cash: number): Promise<ReconciliationLine> {
    const id = await generateHash(`${tx.referencia_origen}-${p.cod}-${qty}-${Date.now()}`);
    return {
        id, transaction_ref: tx.referencia_origen, parent_transaction_id: tx.referencia_origen, fecha_operacion: tx.fecha,
        transfer_amount_cents: transfer, cash_amount_cents: cash, total_amount_cents: p.precio_cents * qty,
        status: 'VALID', payment_status: 'MATCHED', product_cod: p.cod, product_name: p.descripcion, product_um: p.um || 'UD',
        cantidad: qty, precio_unitario_cents: p.precio_cents, origen_dato: 'AUTO_MATCH', source_type: 'BANK_TRANSFER',
        reconciliation_hash: id, created_at: new Date().toISOString(), control_transfer_date: tx.fecha, performance_obligation_id: `PO-${p.cod}-${id.substring(0,8)}`
    };
  }

  async matchSimulation(targetCents: number): Promise<MatchingResult> {
    const mockTx: BankTransaction = {
      referencia_origen: `SIM-${uuidv4().substring(0, 8)}`,
      fecha: new Date().toISOString().split("T")[0],
      importe_cents: targetCents,
      descripcion: "SIMULACION",
      tipo: "TRANSFERENCIA",
      processed: false,
      created_at: new Date().toISOString()
    } as any;

    return this.matchTransaction(mockTx, 0);
  }

  async reconcileAll(txs: any[], onProgress?: any): Promise<MatchingResult[]> {
    const res: MatchingResult[] = [];
    for (let i = 0; i < txs.length; i++) {
        res.push(await this.matchTransaction(txs[i], txs[i].current_reconciled_cents || 0));
        if (onProgress) onProgress(Math.round(((i + 1) / txs.length) * 100));
    }
    return res;
  }
}
