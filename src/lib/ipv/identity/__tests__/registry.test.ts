import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveIdentity } from '../registry';
import { db } from '../../../dexie';

// Mocking Dexie is hard, so we'll use the real one if possible or mock the table
vi.mock('../../../dexie', () => {
  const mockTable = {
    get: vi.fn(),
    put: vi.fn(),
    add: vi.fn(),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn(), update: vi.fn()
  };
  return {
    db: {
      customers: mockTable,
      identity_audit: mockTable
    }
  };
});

describe('Customer Identity Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve identity from CI and enrich name', async () => {
    (db.customers.get as any).mockResolvedValue({ ci: '12345678901', nombre: 'JUAN PEREZ' });

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
    (db.customers.get as any).mockResolvedValue({ ci: '11111111111', nombre: 'ORIGINAL NAME' });

    const result = await resolveIdentity('ref3', '11111111111', 'CONFLICTING NAME');

    expect(result.nombre).toBe('ORIGINAL NAME');
    expect(result.source).toBe('CONFLICT');
    expect(db.identity_audit.add).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'CONFLICT'
    }));
  });

  it('should enrich CI from Name if deterministic', async () => {
    (db.customers.toArray as any).mockResolvedValue([{ ci: '22222222222', nombre: 'UNIQUE NAME' }]);

    const result = await resolveIdentity('ref4', undefined, 'UNIQUE NAME');

    expect(result.ci).toBe('22222222222');
    expect(result.source).toBe('CATALOG');
  });
});
