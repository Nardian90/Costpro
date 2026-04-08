import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveIdentity } from '../registry';
import { db } from '../../../dexie';

// Mocking Dexie is hard, so we'll use the real one if possible or mock the table
vi.mock('../../../dexie', () => {
  const mockTable = {
    get: vi.fn(),
    put: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]), update: vi.fn()
  };
  return {
    db: {
    matching_logs: { add: vi.fn().mockResolvedValue({}), where: vi.fn().mockReturnThis(), equals: vi.fn().mockReturnThis(), reverse: vi.fn().mockReturnThis(), sortBy: vi.fn().mockResolvedValue([]), toArray: vi.fn().mockResolvedValue([]) },
      customers: mockTable,
      identity_audit: mockTable,
      bank_statements: mockTable
    }
  };
});

describe('Customer Identity Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve identity from CI and enrich name', async () => {
    (db.customers.get as any).mockResolvedValue({
        ci: '12345678901',
        nombre: 'JUAN PEREZ',
        normalized_name: 'JUAN PEREZ',
        raw_names: ['JUAN PEREZ']
    });

    const result = await resolveIdentity('ref1', '12345678901');

    expect(result.nombre).toBe('JUAN PEREZ');
    expect(result.source).toBe('CATALOG');
  });

  it('should register new customer when CI and Name are provided and not in catalog', async () => {
    (db.customers.get as any).mockResolvedValue(null);

    const result = await resolveIdentity('ref2', '98765432109', 'MARIA LOPEZ');

    expect(db.customers.put).toHaveBeenCalledWith(expect.objectContaining({
      ci: '98765432109',
      nombre: 'MARIA LOPEZ'
    }));
    expect(result.source).toBe('NEW');
  });

  it('should detect conflicts if Name differs for same CI', async () => {
    (db.customers.get as any).mockResolvedValue({
        ci: '11111111111',
        nombre: 'ORIGINAL NAME',
        normalized_name: 'ORIGINAL NAME',
        raw_names: ['ORIGINAL NAME']
    });

    const result = await resolveIdentity('ref3', '11111111111', 'CONFLICTING NAME');

    expect(result.nombre).toBe('ORIGINAL NAME');
    expect(result.source).toBe('CONFLICT');
    expect(db.identity_audit.add).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'CONFLICT'
    }));
  });

  it('should enrich CI from Name if deterministic', async () => {
    (db.customers.where as any)().equals.mockReturnThis();
    (db.customers.toArray as any).mockResolvedValue([{
        ci: '22222222222',
        nombre: 'UNIQUE NAME',
        normalized_name: 'UNIQUE NAME',
        raw_names: ['UNIQUE NAME']
    }]);

    const result = await resolveIdentity('ref4', undefined, 'UNIQUE NAME');

    expect(result.ci).toBe('22222222222');
    expect(result.source).toBe('CATALOG');
  });
});
