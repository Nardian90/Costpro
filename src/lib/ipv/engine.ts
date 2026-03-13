import {
  type BankTransaction,
  type Product,
  type MatchingRule,
  type ReconciliationLine,
  db
} from '../dexie';

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
}

export class MatchingEngine {
  private products: Product[];
  private rules: MatchingRule[];
  private stockMap: Map<string, number> = new Map();
  private useStockLimit: boolean = false;
  private pendingMovements: any[] = [];
  private dailyPriceAdjustments: Map<string, Map<string, number>> = new Map();

  constructor(products: Product[], rules: MatchingRule[]) {
    this.products = products.filter(p => p.activo);
    this.rules = rules.filter(r => r.activo).sort((a, b) => a.prioridad - b.prioridad);
    this.useStockLimit = this.rules.some(r => r.tipo === 'STOCK_LIMIT');
    this.pendingMovements = [];

    for (const p of this.products) {
        this.stockMap.set(p.cod, p.stock_inicial_manual || 0);
    }
  }

  private getAdjustedPrice(p: Product, fecha: string): number {
      const dateMap = this.dailyPriceAdjustments.get(fecha);
      if (dateMap && dateMap.has(p.cod)) {
          return dateMap.get(p.cod)!;
      }
      return p.precio_cents;
  }

  async matchTransaction(transaction: BankTransaction, current_reconciled_cents: number = 0): Promise<MatchingResult> {
    const logs: string[] = [];
    const targetAmount = transaction.importe_venta_cents || transaction.importe_cents;
    let remaining_cents = targetAmount - current_reconciled_cents;
    const lines: ReconciliationLine[] = [];
    const fecha = transaction.fecha;

    if (transaction.tipo === 'Db' || transaction.estado_conciliacion === 'NO_PROCESAR') {
      return { lines: [], status: 'COMPLETO', logs, movements: [] };
    }

    // PASS 1: HARD_REF
    const hardRefRule = this.rules.find(r => r.tipo === 'HARD_REF');
    if (hardRefRule && remaining_cents > 0) {
      const matchedProduct = this.products.find(p => {
        if (this.useStockLimit && (this.stockMap.get(p.cod) || 0) <= 0) return false;
        return (transaction.observaciones && (transaction.observaciones.includes(p.cod) || transaction.observaciones.toLowerCase().includes(p.descripcion.toLowerCase())));
      });

      if (matchedProduct) {
        const precio = this.getAdjustedPrice(matchedProduct, fecha);
        let qty = Math.floor(remaining_cents / precio);
        if (this.useStockLimit) qty = Math.min(qty, this.stockMap.get(matchedProduct.cod) || 0);

        if (qty > 0) {
          const line = await this.createLine(transaction, matchedProduct, qty, 'AUTO_MATCH', 'Transferencia', precio);
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
        }
      }
    }

    // PASS 2: EXACT_SUM
    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    if (exactSumRule && remaining_cents > 0) {
      const combination = this.findExactCombination(remaining_cents, { fecha, allowFlex: false });
      if (combination && combination.length > 0) {
        for (const item of combination) {
          const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH', 'Transferencia', item.precio);
          lines.push(line);
          remaining_cents -= line.importe_linea_cents;
        }
      }
    }

    // PASS 3: PRICE_FLEX
    const priceFlexRule = this.rules.find(r => r.tipo === 'PRICE_FLEX');
    if (priceFlexRule && remaining_cents > 0) {
        const combination = this.findExactCombination(remaining_cents, { fecha, allowFlex: true });
        if (combination && combination.length > 0) {
            for (const item of combination) {
                const line = await this.createLine(transaction, item.product, item.qty, 'AUTO_MATCH', 'Transferencia', item.precio);
                lines.push(line);
                remaining_cents -= line.importe_linea_cents;
            }
        }
    }

    const status = Math.abs(remaining_cents) < 0.1 ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE');
    return { lines, status, logs, movements: [...this.pendingMovements] };
  }

  private async attemptDecomposition(targetCod: string): Promise<boolean> {
    const targetProduct = this.products.find(p => p.cod === targetCod);
    if (!targetProduct || !targetProduct.id_grupo) return false;
    const ancestors = this.products.filter(p => p.id_grupo === targetProduct.id_grupo && p.cod_hijo === targetProduct.cod);
    for (const ancestor of ancestors) {
      let stock = this.stockMap.get(ancestor.cod) || 0;
      if (stock <= 0) { if (await this.attemptDecomposition(ancestor.cod)) stock = this.stockMap.get(ancestor.cod) || 0; }
      if (stock > 0) {
        const factor = ancestor.contenido_paquete || 1;
        this.stockMap.set(ancestor.cod, stock - 1);
        this.stockMap.set(targetProduct.cod, (this.stockMap.get(targetProduct.cod) || 0) + factor);
        this.pendingMovements.push({ id: crypto.randomUUID(), fecha: new Date().toISOString(), producto_origen_cod: ancestor.cod, producto_destino_cod: targetProduct.cod, cantidad_origen: 1, cantidad_destino: factor, tipo: 'DECOMPOSITION', provenance: 'MATCHING_ENGINE', created_at: new Date().toISOString() });
        return true;
      }
    }
    return false;
  }

  private async createLine(transaction: BankTransaction, product: Product, qty: number, origen: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER', clasificacion: 'Transferencia' | 'Efectivo' | 'QR', precio_override?: number): Promise<ReconciliationLine> {
    const precio = precio_override !== undefined ? precio_override : product.precio_cents;
    const importe = precio * qty;
    if (this.useStockLimit) {
        let cur = this.stockMap.get(product.cod) || 0;
        while (cur < qty) { if (!(await this.attemptDecomposition(product.cod))) break; cur = this.stockMap.get(product.cod) || 0; }
        this.stockMap.set(product.cod, Math.max(0, cur - qty));
    }
    return { id: crypto.randomUUID(), transaction_ref: transaction.referencia_origen, fecha_operacion: transaction.fecha, ingreso_banco_cents: transaction.importe_cents, venta_real_calculada_cents: importe, comision_banco_cents: 0, product_cod: product.cod, product_um: product.um, cantidad: qty, precio_unitario_cents: precio, importe_linea_cents: importe, cuadre_cents: 0, clasificacion, origen_dato: origen, reconciliation_hash: await generateHash(`${transaction.referencia_origen}-${product.cod}-${qty}-${origen}`), created_at: new Date().toISOString() };
  }

  private findExactCombination(target: number, options: { fecha: string, allowFlex?: boolean }): { product: Product, qty: number, precio: number }[] | null {
    const sorted = [...this.products].sort((a, b) => (a.prioridad_algoritmo || 3) - (b.prioridad_algoritmo || 3));
    const startTime = Date.now();
    const solve = (rem: number, idx: number, depth: number): { product: Product, qty: number, precio: number }[] | null => {
      if (Math.abs(rem) < 0.1) return [];
      if (depth >= 8 || idx >= sorted.length || (Date.now() - startTime) > 3000) return null;
      const p = sorted[idx];
      const base = this.getAdjustedPrice(p, options.fecha);

      const priceOptions = [base];
      if (options.allowFlex && p.variacion_permisible_percent) {
          const v = base * (p.variacion_permisible_percent / 100);
          const dMap = this.dailyPriceAdjustments.get(options.fecha);
          if (!dMap || !dMap.has(p.cod)) {
              for (let i = 1; i <= 10; i++) {
                priceOptions.push(base + (v * i / 10));
                priceOptions.push(base - (v * i / 10));
              }
          }
      }

      for (const pr of priceOptions) {
          if (pr <= 0) continue;

          const maxQ = Math.floor((rem + 0.1) / pr);
          if (maxQ <= 0) continue;

          const amq = this.useStockLimit ? Math.min(maxQ, this.getVirtualStock(p.cod)) : maxQ;

          for (let q = amq; q >= 1; q--) {
            if (this.useStockLimit) this.stockMap.set(p.cod, (this.stockMap.get(p.cod) || 0) - q);
            const s = solve(rem - q * pr, idx + 1, depth + 1);
            if (this.useStockLimit) this.stockMap.set(p.cod, (this.stockMap.get(p.cod) || 0) + q);

            if (s) {
              if (Math.abs(pr - p.precio_cents) > 0.01) {
                  if (!this.dailyPriceAdjustments.has(options.fecha)) this.dailyPriceAdjustments.set(options.fecha, new Map());
                  this.dailyPriceAdjustments.get(options.fecha)!.set(p.cod, pr);
                  this.pendingMovements.push({ id: crypto.randomUUID(), fecha: options.fecha, producto_origen_cod: p.cod, producto_destino_cod: p.cod, cantidad_origen: 0, cantidad_destino: 0, tipo: 'PRICE_ADJUSTMENT', provenance: `MATCHING_FLEX_${pr}`, created_at: new Date().toISOString() });
              }
              return [{ product: p, qty: q, precio: pr }, ...s];
            }
          }
      }
      return solve(rem, idx + 1, depth);
    };
    return solve(target, 0, 0);
  }

  private getVirtualStock(productCod: string): number {
    const product = this.products.find(p => p.cod === productCod);
    if (!product) return 0;
    let total = this.stockMap.get(productCod) || 0;
    if (product.id_grupo) {
        const parents = this.products.filter(p => p.id_grupo === product.id_grupo && p.cod_hijo === productCod);
        for (const parent of parents) { total += this.getVirtualStock(parent.cod) * (parent.contenido_paquete || 1); }
    }
    return total;
  }

  async reconcileAll(transactions: any[], onProgress?: (p: number) => void): Promise<any[]> {
    const res = [];
    for (let i = 0; i < transactions.length; i++) {
        const r = await this.matchTransaction(transactions[i]);
        res.push({ transactionId: transactions[i].referencia_origen, status: r.status, lines: r.lines, movements: r.movements });
        if (onProgress) onProgress(Math.round(((i + 1) / transactions.length) * 100));
    }
    return res;
  }
}
