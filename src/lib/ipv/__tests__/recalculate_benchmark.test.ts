
import { describe, it, expect, vi } from 'vitest';
import { recalculateIPVReportsChain } from '../utils';
import { db } from '../../dexie';

describe('recalculateIPVReportsChain Benchmark', () => {
  it('should measure execution time with a large dataset', async () => {
    const numReports = 50;
    const productsPerReport = 50;
    const numMovements = 5000;

    const products = Array.from({ length: productsPerReport }).map((_, i) => ({
      cod: `PROD_${i}`,
      descripcion: `Product ${i}`,
      um: 'UD',
      precio_cents: 100,
      activo: true,
      stock_inicial_manual: 10,
    }));

    const reports = Array.from({ length: numReports }).map((_, i) => ({
      id: `REPORT_${i}`,
      fecha_reporte: `2025-01-${String(i + 1).padStart(2, '0')}`,
      filas: products.map(p => ({
        cod: p.cod,
        descripcion: p.descripcion,
        um: p.um,
        venta_cantidad_qty: 1,
        existencia_final_qty: 0,
      })),
    }));

    const movements = Array.from({ length: numMovements }).map((_, i) => ({
      id: `MOV_${i}`,
      fecha: `2025-01-${String((i % numReports) + 1).padStart(2, '0')}`,
      producto_destino_cod: `PROD_${i % productsPerReport}`,
      producto_origen_cod: `PROD_${(i + 1) % productsPerReport}`,
      cantidad_destino: 5,
      cantidad_origen: 2,
      tipo: i % 2 === 0 ? 'INTELLIGENT_RECEIPT' : 'DECOMPOSITION',
    }));

    // Mock Dexie methods
    vi.spyOn(db.products, 'toArray').mockResolvedValue(products as any);
    vi.spyOn(db.ipv_reports, 'orderBy').mockReturnThis();
    // @ts-ignore
    vi.spyOn(db.ipv_reports, 'toArray').mockResolvedValue(reports as any);
    vi.spyOn(db.product_movements, 'toArray').mockResolvedValue(movements as any);
    vi.spyOn(db.ipv_reports, 'update').mockResolvedValue(1 as any);

    const start = performance.now();
    await recalculateIPVReportsChain(db);
    const end = performance.now();

    console.log(`Execution time for ${numReports} reports, ${productsPerReport} products each, and ${numMovements} movements: ${(end - start).toFixed(2)}ms`);

    expect(end - start).toBeGreaterThan(0);
  });
});
