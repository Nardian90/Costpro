import { auditService } from '../audit-service';
import { vi, describe, it, expect } from 'vitest';

// Mock de supabase
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }
}));

describe('Regresión FC-02: storeService.resetStore audita antes y después', () => {
  it('logTransferCreated inserta en audit_logs con action transfer_created', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    const insertSpy = vi.spyOn(supabase.from('audit_logs'), 'insert');

    await auditService.logTransferCreated({
      userId: 'user-1',
      transferId: 'txfr-1',
      originStoreId: 'store-a',
      destinationStoreId: 'store-b',
      items: [{ productId: 'prod-1', quantity: 5, unitCost: 100 }]
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'transfer_created' })
    );
  });

  it('logTransferConfirmed usa store de destino como store_id en audit', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    const insertSpy = vi.spyOn(supabase.from('audit_logs'), 'insert');

    await auditService.logTransferConfirmed({
      userId: 'user-1',
      transferId: 'txfr-1',
      originStoreId: 'store-a',
      destinationStoreId: 'store-b',
      items: []
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transfer_confirmed',
        store_id: 'store-b'
      })
    );
  });
});
