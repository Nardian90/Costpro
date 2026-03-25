import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHybridCustomers } from '../registry';
import { db } from '@/lib/dexie';

vi.mock('@/lib/dexie', () => ({
  db: {
    customers: {
      toArray: vi.fn(),
    },
    bank_statements: {
      filter: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
    },
  },
}));

describe('getHybridCustomers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should merge customers from catalog and bank statements', async () => {
    (db.customers.toArray as any).mockResolvedValue([
      { ci: '123', nombre: 'JUAN PEREZ', status: 'COMPLETO' }
    ]);

    (db.bank_statements.toArray as any).mockResolvedValue([
      { carnet: '456', nombre_cliente: 'MARIA LOPEZ', created_at: '2024-01-01' }
    ]);

    const result = await getHybridCustomers();

    expect(result).toHaveLength(2);
    expect(result.map(c => c.ci)).toContain('123');
    expect(result.map(c => c.ci)).toContain('456');
    expect(result.find(c => c.ci === '456')?.nombre).toBe('MARIA LOPEZ');
  });

  it('should deduplicate by CI', async () => {
    (db.customers.toArray as any).mockResolvedValue([
      { ci: '123', nombre: 'JUAN PEREZ' }
    ]);

    (db.bank_statements.toArray as any).mockResolvedValue([
      { carnet: '123', nombre_cliente: 'JUAN PEREZ DUPLICADO' }
    ]);

    const result = await getHybridCustomers();

    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('JUAN PEREZ'); // Catalog takes priority
  });
});
