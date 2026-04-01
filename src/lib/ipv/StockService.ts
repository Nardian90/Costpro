import { db, Product, ReconciliationLine, ProductMovement } from '../dexie';

/**
 * Service to centralize all stock calculation logic.
 * Ensures consistency between IPV reports, Catalog views, and Matching engine.
 */
export class StockService {
  /**
   * Calculates current availability for a single product.
   * Includes initial stock, movements, and sales.
   */
  static async calculateProductStock(productCod: string): Promise<number> {
    const product = await db.products.where('cod').equals(productCod).first();
    if (!product) return 0;

    const initialStock = product.stock_inicial_manual || 0;

    // Real Sales (Output)
    const sales = await db.reconciliation_lines
      .where('product_cod')
      .equals(productCod)
      .toArray()
      .then(lines => lines.reduce((sum, l) => sum + (l.cantidad || 0), 0));

    // Inventory Movements (Input & Output)
    const movementsDest = await db.product_movements
      .where('producto_destino_cod')
      .equals(productCod)
      .toArray()
      .then(movs => movs.reduce((sum, m) => sum + (m.cantidad_destino || 0), 0));

    const movementsOrig = await db.product_movements
      .where('producto_origen_cod')
      .equals(productCod)
      .toArray()
      .then(movs => movs.reduce((sum, m) => sum + (m.cantidad_origen || 0), 0));

    return initialStock + movementsDest - movementsOrig - sales;
  }

  /**
   * Generates a complete stock map for all active products.
   * Optimized to minimize database queries.
   */
  static async getCompleteStockMap(): Promise<Map<string, number>> {
    const products = await db.products.toArray();
    const lines = await db.reconciliation_lines.toArray();
    const allMovements = await db.product_movements.toArray();
    const map = new Map<string, number>();

    for (const p of products) {
        const sales = lines
            .filter(l => l.product_cod === p.cod)
            .reduce((sum, l) => sum + (l.cantidad || 0), 0);

        const entries = allMovements
            .filter(m => m.producto_destino_cod === p.cod)
            .reduce((sum, m) => sum + (m.cantidad_destino || 0), 0);

        const exits = allMovements
            .filter(m => m.producto_origen_cod === p.cod)
            .reduce((sum, m) => sum + (m.cantidad_origen || 0), 0);

        map.set(p.cod, (p.stock_inicial_manual || 0) + entries - exits - sales);
    }

    return map;
  }

  /**
   * Calculates virtual stock considering hierarchy (decomposition).
   */
  static async getVirtualStock(productCod: string, precalculatedMap?: Map<string, number>): Promise<number> {
    const stockMap = precalculatedMap || await this.getCompleteStockMap();
    const products = await db.products.toArray();
    const product = products.find(p => p.cod === productCod);

    if (!product || !product.id_grupo) return stockMap.get(productCod) || 0;

    const groupProducts = products.filter(p => p.id_grupo === product.id_grupo);
    const memo = new Map<string, number>();

    const calculateRecursive = (targetCod: string): number => {
      if (memo.has(targetCod)) return memo.get(targetCod)!;
      let total = stockMap.get(targetCod) || 0;
      const parents = groupProducts.filter(p => p.cod_hijo === targetCod);
      for (const parent of parents) {
        total += calculateRecursive(parent.cod) * (parent.contenido_paquete || 1);
      }
      memo.set(targetCod, total);
      return total;
    };

    return calculateRecursive(productCod);
  }
}
