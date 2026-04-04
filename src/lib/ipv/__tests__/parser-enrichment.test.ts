import { describe, it, expect, vi } from 'vitest';
import { enrichTransactions } from '../parser';
import { db } from '../../dexie';

// Mock resolveIdentity to avoid DB/Network calls
vi.mock('../identity/registry', () => ({
  resolveIdentity: vi.fn().mockResolvedValue({ nombre: 'Mock Payer' })
}));

describe('parser enrichment', () => {
  it('should enrich transactions with metadata and log inconsistencies', async () => {
    // Add a spy to audit_logs
    const auditSpy = vi.spyOn(db.audit_logs, 'add');

    const txs = [{
      referencia_origen: 'REF001',
      observaciones: 'NIT:5000;MalformedPart;RF:TaxVal;',
      id: '1',
      fecha: '2025-01-01',
      importe_cents: 1000
    }];

    const result = await enrichTransactions(txs);

    expect(result[0].nit).toBe('5000');
    expect(result[0].impuesto).toBe('TaxVal');

    // Check if audit log was called for MalformedPart
    expect(auditSpy).toHaveBeenCalled();
    const callArgs = auditSpy.mock.calls[0][0];
    expect(callArgs.action).toBe('METADATA_INCONSISTENCY');
    expect(callArgs.metadata.inconsistencies).toContain('Part without colon: "MalformedPart"');
  });
});
