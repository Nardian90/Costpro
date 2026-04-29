import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditService } from '../audit-service';

// Mock completo de supabase
const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mockInsert }))
  }
}));

describe('auditService', () => {
  beforeEach(() => {
    mockInsert.mockClear();
  });

  describe('logInvoiceWithoutPrice', () => {
    it('inserta en audit_logs con action invoice_without_price', async () => {
      await auditService.logInvoiceWithoutPrice('user-1', 'prod-1', 'store-1');
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        action: 'invoice_without_price',
      }));
    });

    it('no lanza excepción si supabase devuelve error', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('DB error') });
      await expect(
        auditService.logInvoiceWithoutPrice('user-1', 'prod-1', 'store-1')
      ).resolves.not.toThrow();
    });
  });

  describe('logSaleBelowCost', () => {
    it('registra precio y costo en metadata', async () => {
      await auditService.logSaleBelowCost('user-1', 'prod-1', 'store-1', 50, 80);
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.price).toBe(50);
      expect(call.action).toBe('sale_below_cost');
    });

    it('no lanza excepción si supabase devuelve error', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('DB error') });
      await expect(
        auditService.logSaleBelowCost('user-1', 'prod-1', 'store-1', 50, 80)
      ).resolves.not.toThrow();
    });
  });

  describe('logTransferCreated', () => {
    it('registra creación de transferencia', async () => {
      await auditService.logTransferCreated({
        userId: 'u-1', transferId: 'txfr-1',
        originStoreId: 'store-a', destinationStoreId: 'store-b',
        items: [{ productId: 'p-1', quantity: 3, unitCost: 100 }]
      });
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'transfer_created' }));
    });

    it('maneja error silenciosamente', async () => {
        mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
        await expect(auditService.logTransferCreated({ items: [] } as any)).resolves.not.toThrow();
    });
  });

  describe('logTransferConfirmed', () => {
    it('registra confirmación de transferencia', async () => {
      await auditService.logTransferConfirmed({
        userId: 'u-1', transferId: 'txfr-1',
        originStoreId: 'store-a', destinationStoreId: 'store-b', items: []
      });
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'transfer_confirmed' }));
    });

    it('maneja error silenciosamente', async () => {
        mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
        await expect(auditService.logTransferConfirmed({ items: [] } as any)).resolves.not.toThrow();
    });
  });

  describe('logTransferCancelled', () => {
    it('registra cancelación', async () => {
      await auditService.logTransferCancelled({
        userId: 'u-1', transferId: 'txfr-1', storeId: 'store-a', reason: 'Stock'
      });
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'transfer_cancelled' }));
    });

    it('maneja error silenciosamente', async () => {
        mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
        await expect(auditService.logTransferCancelled({} as any)).resolves.not.toThrow();
    });
  });

  describe('logReceptionVoided', () => {
    it('registra recepción anulada', async () => {
      await auditService.logReceptionVoided({
        userId: 'u-1', receiptId: 'rcpt-1', storeId: 'store-1'
      });
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'reception_voided' }));
    });

    it('maneja error silenciosamente', async () => {
        mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
        await expect(auditService.logReceptionVoided({} as any)).resolves.not.toThrow();
    });
  });
});
