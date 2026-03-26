import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAllCustomerStats } from '../registry';
import { db } from '../../../dexie';

vi.mock('../../../dexie', () => {
  const mockTable = {
    toArray: vi.fn()
  };
  return {
    db: {
    matching_logs: { add: vi.fn().mockResolvedValue({}), where: vi.fn().mockReturnThis(), equals: vi.fn().mockReturnThis(), reverse: vi.fn().mockReturnThis(), sortBy: vi.fn().mockResolvedValue([]), toArray: vi.fn().mockResolvedValue([]) },
      bank_statements: mockTable
    }
  };
});

describe('Customer Stats Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly sum amounts and counts per customer', async () => {
    (db.bank_statements.toArray as any).mockResolvedValue([
      { carnet: '123', importe_cents: 1000 },
      { carnet: '123', importe_cents: 500 },
      { carnet: '456', importe_cents: 2000 },
      { carnet: null, importe_cents: 100 }
    ]);

    const stats = await getAllCustomerStats();

    expect(stats['123']).toEqual({ totalTransactions: 2, totalAmountCents: 1500 });
    expect(stats['456']).toEqual({ totalTransactions: 1, totalAmountCents: 2000 });
    expect(stats['null']).toBeUndefined();
  });
});
