import {
  type BankTransaction,
  type Product,
  type MatchingRule,
  type ReconciliationLine,
  type MatchingTrace,
  db
} from '../dexie';

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

export class MatchingEngine {
  private products: Product[];
  private rules: MatchingRule[];
  private stockMap: Map<string, number> = new Map();
  private useStockLimit: boolean = false;
  private pendingMovements: any[] = [];
  private dailyAdjustedPrices: Map<string, number> = new Map();

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);
    this.useStockLimit = this.rules.some(r => r.tipo === 'STOCK_LIMIT');
    this.pendingMovements = [];
    this.dailyAdjustedPrices = new Map();

    for (const p of this.products) {
        this.stockMap.set(p.cod, p.stock_inicial_manual || 0);
    }
  }

  async matchTransaction(transaction: BankTransaction, current_reconciled_cents: number = 0): Promise<MatchingResult> {
    const logs: string[] = [];
    const trace: MatchingTrace[] = [];
    const appliedRules: string[] = [];
    let matchingConfidence = 1.0;

    const targetAmount = transaction.importe_venta_cents || transaction.importe_cents;
    let remaining_cents = targetAmount - current_reconciled_cents;
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
            appliedRules.push(rule);
            matchingConfidence = Math.min(matchingConfidence, RULE_CONFIDENCE[rule] || 1.0);
        }
    };

    logs.push(`Iniciando matching para transacción ${transaction.referencia_origen} (Importe: ${targetAmount} cts, Restante: ${remaining_cents} cts)`);

    if (transaction.tipo === 'Db' || transaction.estado_conciliacion === 'NO_PROCESAR') {
      const reason = transaction.tipo === 'Db' ? 'Débito auto-finalizado' : 'Excluida del matching';
      logs.push(`PASS 0: ${reason}`);
      addTrace(0, 'AUTO_COMPLETE', 'SUCCESS', reason);
      return {
          lines: [],
          status: 'COMPLETO',
          logs,
          movements: [],
          trace,
          appliedRules,
          matchingConfidence
      };
    } else {
        addTrace(0, 'AUTO_COMPLETE', 'SKIPPED', 'No aplica a créditos activos');
    }

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
        addTrace(2, 'EXACT_SUM', 'SUCCESS', 'Recuperado de caché');
        return {
            lines,
            status: 'COMPLETO',
            logs,
            movements: [],
            trace,
            appliedRules,
            matchingConfidence
        };
      }
    }

    const hardRefRule = this.rules.find(r => r.tipo === 'HARD_REF');
    if (hardRefRule && remaining_cents > 0) {
      const matchedProduct = this.products.find(p => {
        if (this.useStockLimit && this.getVirtualStock(p.cod) <= 0) return false;
        return transaction.observaciones.includes(p.cod) ||
               transaction.observaciones.toLowerCase().includes(p.descripcion.toLowerCase());
      });

      if (matchedProduct) {
        let qty = Math.floor(remaining_cents / matchedProduct.precio_cents);
        if (this.useStockLimit) {
            const available = this.getVirtualStock(matchedProduct.cod);
            qty = Math.min(qty, available);
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
        addTrace(2, 'EXACT_SUM', 'SUCCESS', 'Combinación exacta encontrada', { items: combination.length });
      } else {
          addTrace(2, 'EXACT_SUM', 'FAIL', 'No se encontró combinación exacta con stock disponible');
      }
    } else if (!exactSumRule) {
        addTrace(2, 'EXACT_SUM', 'SKIPPED', 'Regla inactiva');
    }

    const priceFlexRule = this.rules.find(r => r.tipo === 'PRICE_FLEX');
    if (priceFlexRule && remaining_cents > 0) {
        const maxAbs = priceFlexRule.meta?.max_variation_cents || 10;
        const maxPercent = priceFlexRule.meta?.max_variation_percent || 20;

        const flexProduct = this.products.find(p => {
            if (this.useStockLimit && this.getVirtualStock(p.cod) <= 0) return false;
            const lockedPrice = this.dailyAdjustedPrices.get(p.cod);
            if (lockedPrice !== undefined) {
                return lockedPrice === remaining_cents;
            }
            const canVary = (p.variacion_permisible_percent || 0) > 0 || p.isWildcardCandidate;
            return canVary;
        });

        if (flexProduct) {
            const basePrice = flexProduct.precio_cents;
            const lockedPrice = this.dailyAdjustedPrices.get(flexProduct.cod);
            const targetPrice = lockedPrice !== undefined ? lockedPrice : remaining_cents;

            const adjustment = Math.abs(targetPrice - basePrice);
            const allowedPercent = flexProduct.variacion_permisible_percent || maxPercent;
            const maxPercentAbs = basePrice * (allowedPercent / 100);

            if (adjustment <= maxAbs || adjustment <= maxPercentAbs) {
                if (lockedPrice === undefined) {
                    this.dailyAdjustedPrices.set(flexProduct.cod, targetPrice);
                    this.pendingMovements.push({
                        id: crypto.randomUUID(),
                        fecha: new Date().toISOString(),
                        producto_origen_cod: flexProduct.cod,
                        producto_destino_cod: flexProduct.cod,
                        cantidad_origen: 1,
                        cantidad_destino: 1,
                        tipo: 'PRICE_ADJUSTMENT',
                        valor_anterior: basePrice.toString(),
                        valor_nuevo: targetPrice.toString(),
                        motivo: 'Coherencia diaria en matching',
                        created_at: new Date().toISOString()
                    });
                }

                const line = await this.createLine(transaction, flexProduct, 1, 'AUTO_MATCH', 'Transferencia');
                line.precio_unitario_cents = targetPrice;
                line.importe_linea_cents = targetPrice;
                lines.push(line);
                remaining_cents -= targetPrice;
                logs.push(`PASS 3 (PRICE_FLEX): ${lockedPrice !== undefined ? 'Reutilizado' : 'Bloqueado'} precio de ${flexProduct.descripcion} a ${targetPrice}`);
                addTrace(3, 'PRICE_FLEX', 'SUCCESS', `Ajuste de precio en ${flexProduct.descripcion}`, { adjustment: targetPrice - basePrice });
            } else {
                addTrace(3, 'PRICE_FLEX', 'FAIL', `Ajuste de ${adjustment} cts excede límites`);
            }
        } else {
            addTrace(3, 'PRICE_FLEX', 'FAIL', 'No hay productos aptos para ajuste de precio');
        }
    } else if (!priceFlexRule) {
        addTrace(3, 'PRICE_FLEX', 'SKIPPED', 'Regla inactiva');
    }

    const wildcardsRule = this.rules.find(r => r.tipo === 'WILDCARDS');
    if (wildcardsRule && remaining_cents > 0) {
        const wildcards = this.products
            .filter(p => p.isWildcardCandidate)
            .filter(p => !this.useStockLimit || this.getVirtualStock(p.cod) > 0)
            .sort((a,b) => b.precio_cents - a.precio_cents);

        let addedCount = 0;
        for (const p of wildcards) {
            if (p.precio_cents <= remaining_cents && p.precio_cents > 0) {
                let qty = Math.floor(remaining_cents / p.precio_cents);
                if (this.useStockLimit) {
                    const available = this.getVirtualStock(p.cod);
                    qty = Math.min(qty, available);
                }

                if (qty > 0) {
                    const line = await this.createLine(transaction, p, qty, 'AUTO_MATCH', 'Transferencia');
                    lines.push(line);
                    remaining_cents -= line.importe_linea_cents;
                    logs.push(`PASS 4 (WILDCARDS): Añadido ${qty}x ${p.descripcion} como comodín`);
                    addedCount += qty;
                }
            }
        }
        if (addedCount > 0) {
            addTrace(4, 'WILDCARDS', 'SUCCESS', `Añadidos ${addedCount} productos comodín`);
        } else {
            addTrace(4, 'WILDCARDS', 'FAIL', 'No se pudieron asignar productos comodín');
        }
    } else if (!wildcardsRule) {
        addTrace(4, 'WILDCARDS', 'SKIPPED', 'Regla inactiva');
    }

    const toleranceRule = this.rules.find(r => r.tipo === 'TOLERANCE');
    if (toleranceRule && remaining_cents > 0) {
      const toleranceCents = toleranceRule.meta?.tolerance_cents || toleranceRule.tolerancia_cents || 0;

      if (toleranceCents > 0) {
          const candidateProducts = this.products
            .filter(p => !this.useStockLimit || this.getVirtualStock(p.cod) > 0)
            .sort((a,b) => b.precio_cents - a.precio_cents);

          let found = false;
          for (const product of candidateProducts) {
            if (product.precio_cents <= 0) continue;
            let qty = Math.round(remaining_cents / product.precio_cents);
            if (qty <= 0) qty = 1;
            if (this.useStockLimit) {
                const available = this.getVirtualStock(product.cod);
                qty = Math.min(qty, available);
            }
            if (qty <= 0) continue;

            const diff = Math.abs(remaining_cents - (product.precio_cents * qty));
            if (diff <= toleranceCents) {
              const line = await this.createLine(transaction, product, qty, 'AUTO_MATCH', 'Transferencia');
              line.cuadre_cents = remaining_cents - (product.precio_cents * qty);
              line.importe_linea_cents = remaining_cents;
              lines.push(line);
              remaining_cents = 0;
              logs.push(`PASS 5 (TOLERANCE): Matched ${qty}x ${product.descripcion} con cuadre de ${line.cuadre_cents}`);
              addTrace(5, 'TOLERANCE', 'SUCCESS', `Cuadre de ${line.cuadre_cents} cts aplicado`, { product: product.cod, diff: line.cuadre_cents });
              found = true;
              break;
            }
          }
          if (!found) {
              addTrace(5, 'TOLERANCE', 'FAIL', `No hay productos que cuadren dentro de ${toleranceCents} cts`);
          }
      } else {
          addTrace(5, 'TOLERANCE', 'SKIPPED', 'Tolerancia no configurada');
      }
    } else if (!toleranceRule) {
        addTrace(5, 'TOLERANCE', 'SKIPPED', 'Regla inactiva');
    }

    const cashFillRule = this.rules.find(r => r.tipo === 'CASH_FILL');
    if (cashFillRule && remaining_cents > 0) {
      const dailyLimit = cashFillRule.meta?.daily_limit || Infinity;
      const usedToday = await db.reconciliation_lines
        .where('fecha_operacion').equals(transaction.fecha)
        .and(l => l.origen_dato === 'CASH_FILLER')
        .toArray()
        .then(lines => lines.reduce((sum, l) => sum + l.importe_linea_cents, 0));

      if (usedToday + remaining_cents > dailyLimit) {
        logs.push(`PASS 6 (CASH_FILL): Límite diario excedido. Saldo restante: ${remaining_cents} cts`);
        addTrace(6, 'CASH_FILL', 'FAIL', `Límite diario de ${dailyLimit} cts excedido`);
      } else {
        const wildcards = this.products
            .filter(p => p.isWildcardCandidate)
            .filter(p => !this.useStockLimit || this.getVirtualStock(p.cod) > 0)
            .sort((a,b) => b.precio_cents - a.precio_cents);

        let cashMatched = 0;
        for (const p of wildcards) {
          if (p.precio_cents <= remaining_cents && p.precio_cents > 0) {
            let qty = Math.floor(remaining_cents / p.precio_cents);
            if (this.useStockLimit) {
                const available = this.getVirtualStock(p.cod);
                qty = Math.min(qty, available);
            }
            if (qty > 0) {
                const line = await this.createLine(transaction, p, qty, 'CASH_FILLER', 'Efectivo');
                lines.push(line);
                remaining_cents -= line.importe_linea_cents;
                logs.push(`PASS 6 (CASH_FILL): Justificado con ${qty}x ${p.descripcion}`);
                cashMatched += line.importe_linea_cents;
                if (remaining_cents > 0 && remaining_cents < p.precio_cents * 0.5) {
                    const adj = remaining_cents;
                    line.precio_unitario_cents += Math.floor(adj / qty);
                    line.importe_linea_cents += adj;
                    remaining_cents = 0;
                    logs.push(`PASS 6 (CASH_FILL): Micro-ajuste final de ${adj} cts aplicado`);
                }
            }
          }
        }

        if (remaining_cents > 0) {
            const line: ReconciliationLine = {
                id: crypto.randomUUID(),
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
            cashMatched += remaining_cents;
            remaining_cents = 0;
            logs.push(`PASS 6 (CASH_FILL): Saldo final cubierto con ajuste de efectivo directo`);
        }
        addTrace(6, 'CASH_FILL', 'SUCCESS', `Cubiertos ${cashMatched} cts como efectivo`);
      }
    } else if (!cashFillRule) {
        addTrace(6, 'CASH_FILL', 'SKIPPED', 'Regla inactiva');
    }

    const isComplete = Math.abs(remaining_cents) < 0.001;
    let failReason = undefined;
    if (!isComplete) {
        if (this.useStockLimit) {
            const topProducts = this.products.slice(0, 3);
            const stockInfo = topProducts.map(p => `${p.descripcion} (Stock: ${this.getVirtualStock(p.cod)})`).join(', ');
            failReason = `FALTA STOCK VIRTUAL. Disponibilidad cercana: ${stockInfo}`;
        } else {
            failReason = 'No se encontró una combinación de productos válida para el importe restante.';
        }
    }

    const resultMovements = [...this.pendingMovements];
    this.pendingMovements = [];

    return {
      lines,
      status: isComplete ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE'),
      logs,
      failReason,
      movements: resultMovements,
      trace,
      appliedRules,
      matchingConfidence: isComplete ? matchingConfidence : 0
    };
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
    options?: { dayVolumes?: Record<string, number> }
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
          if (sA !== sB) return sA - sB;
          return b.precio_cents - a.precio_cents;
        });

      for (const p of candidates) {
        if (remainingDiff <= 0) break;
        let availableStock = this.stockMap.get(p.cod) || 0;
        if (!this.useStockLimit) availableStock = 999999;
        if (availableStock <= 0) continue;
        const maxQtyPossible = Math.floor(remainingDiff / p.precio_cents);
        if (maxQtyPossible <= 0) continue;
        const idealQtyForThisDay = Math.max(1, Math.floor(maxQtyPossible / (sortedDates.length / 2)));
        const qtyToPick = Math.min(availableStock, maxQtyPossible, idealQtyForThisDay);
        if (qtyToPick > 0) {
          const line = await this.createLine({ fecha: date, referencia_origen: `GOAL-${date}` } as any, p, qtyToPick, 'CASH_FILLER', 'Efectivo');
          line.id = crypto.randomUUID();
          line.cuadre_cents = 0;
          line.importe_linea_cents = p.precio_cents * qtyToPick;
          lines.push(line);
          remainingDiff -= line.importe_linea_cents;
        }
      }
    }
    return lines;
  }

  private async attemptDecomposition(productCod: string): Promise<boolean> {
    const targetProduct = this.products.find(p => p.cod === productCod);
    if (!targetProduct || !targetProduct.id_grupo) return false;
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
        this.stockMap.set(ancestor.cod, availableAncestorStock - 1);
        const currentTargetStock = this.stockMap.get(targetProduct.cod) || 0;
        this.stockMap.set(targetProduct.cod, currentTargetStock + conversionFactor);
        this.pendingMovements.push({
          id: crypto.randomUUID(),
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
    clasificacion: 'Transferencia' | 'Efectivo' | 'QR'
  ): Promise<ReconciliationLine> {
    if (this.useStockLimit && this.getVirtualStock(product.cod) < qty) {
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
        this.stockMap.set(product.cod, Math.max(0, current - qty));
    }

    return {
      id: crypto.randomUUID(),
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

    const MAX_DEPTH = 12;
    const TIMEOUT_MS = 2000;
    const startTime = Date.now();

    const solve = (remaining: number, index: number, depth: number): { product: Product, qty: number }[] | null => {
      if (Math.abs(remaining) < 0.001) return [];
      if (depth >= MAX_DEPTH || index >= sortedProducts.length || (Date.now() - startTime) > TIMEOUT_MS) return null;
      const p = sortedProducts[index];
      if (p.precio_cents <= 0) return solve(remaining, index + 1, depth);
      const maxQty = Math.floor((remaining + 0.001) / p.precio_cents);
      let actualMaxQty = maxQty;
      if (this.useStockLimit) actualMaxQty = Math.min(maxQty, this.getVirtualStock(p.cod));

      for (let qty = actualMaxQty; qty >= 1; qty--) {
        if (this.useStockLimit) {
            const current = this.stockMap.get(p.cod) || 0;
            this.stockMap.set(p.cod, current - qty);
        }
        const sub = solve(remaining - qty * p.precio_cents, index + 1, depth + 1);
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
            if (i % 20 === 0 || percentage % 5 === 0 || i === transactions.length - 1) onProgress(percentage);
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
