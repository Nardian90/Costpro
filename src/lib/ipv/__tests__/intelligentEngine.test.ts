import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Product } from '../../dexie';

// Mock Dexie MUST be at the top level
vi.mock('../../dexie', () => ({
  db: {
    matching_cache: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
    },
    reconciliation_lines: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    matching_logs: {
      add: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      toArray: vi.fn().mockResolvedValue([]),
    },
    period_closures: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    },
    products: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      above: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      clear: vi.fn(),
      bulkPut: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
    },
    bank_statements: {
      clear: vi.fn(),
      add: vi.fn(),
    }
  }
}));

// Import after mock
import { analizarVentas, descomponerUnidades, corregirNegativos, reconstruirRecepciones, generarRecepcionDesdeSaldoInicial } from '../intelligentEngine';
import { db } from '../../dexie';

describe('Intelligent Receipts Engine', () => {
    describe('descomponerUnidades', () => {
        const product: Product = {
            cod: 'PROD1',
            descripcion: 'Product 1',
            um: 'U',
            es_paquete: false,
            contenido_paquete: 1,
            precio_cents: 100,
            prioridad_algoritmo: 1,
            activo: true,
            stock_inicial_manual: 0,
            created_at: '',
            unit_factor: 1,
            unit_level: 'UNIT'
        };

        const hierarchy: Product[] = [
            { ...product, cod: 'BOX', unit_factor: 1000, unit_level: 'BOX' },
            { ...product, cod: 'PACK', unit_factor: 500, unit_level: 'PACK' },
            { ...product, cod: 'UNIT', unit_factor: 1, unit_level: 'UNIT' }
        ];

        it('should decompose 1500 units into 1 BOX and 1 PACK', () => {
            const result = descomponerUnidades(1500, product, hierarchy);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ level: 'BOX', quantity: 1, units: 1000 });
            expect(result[1]).toEqual({ level: 'PACK', quantity: 1, units: 500 });
        });
    });

    describe('generarRecepcionDesdeSaldoInicial', () => {
        it('should generate receipts based on manual initial stock', async () => {
            const products: Product[] = [
                {
                    cod: 'P1',
                    descripcion: 'P1',
                    um: 'U',
                    es_paquete: false,
                    contenido_paquete: 1,
                    precio_cents: 100,
                    prioridad_algoritmo: 1,
                    activo: true,
                    stock_inicial_manual: 10,
                    created_at: '',
                    unit_factor: 1,
                    unit_level: 'UNIT'
                }
            ];

            vi.spyOn(db.products, 'where').mockReturnThis();
            vi.spyOn(db.products, 'above').mockReturnValue({
                toArray: vi.fn().mockResolvedValue(products)
            } as any);

            const result = await generarRecepcionDesdeSaldoInicial();
            expect(result.receipts).toHaveLength(1);
            expect(result.receipts[0].product_id).toBe('P1');
            expect(result.receipts[0].total_units).toBe(10);
            expect(result.correctedProducts).toContain('P1');
        });
    });
});
