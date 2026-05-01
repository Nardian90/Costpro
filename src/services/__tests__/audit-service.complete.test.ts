import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditService } from '../audit-service';

// Mock completo de supabase
const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mockInsert })),
  },
}));

describe('auditService — Cobertura completa', () => {
  beforeEach(() => {
    mockInsert.mockClear();
  });

  describe('logInvoiceWithoutPrice', () => {
    it('inserta en audit_logs con action invoice_without_price', async () => {
      await auditService.logInvoiceWithoutPrice('user-1', 'prod-1', 'store-1');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'invoice_without_price',
        })
      );
    });

    it('incluye user_id, record_id y store_id correctos', async () => {
      await auditService.logInvoiceWithoutPrice('user-abc', 'prod-xyz', 'store-123');
      const call = mockInsert.mock.calls[0][0];
      expect(call.user_id).toBe('user-abc');
      expect(call.record_id).toBe('prod-xyz');
      expect(call.store_id).toBe('store-123');
      expect(call.table_name).toBe('transactions');
    });

    it('incluye metadata con product_id, timestamp y warning', async () => {
      await auditService.logInvoiceWithoutPrice('u', 'p', 's');
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.product_id).toBe('p');
      expect(call.metadata.warning).toContain('0 or NULL');
      expect(call.metadata.timestamp).toBeDefined();
    });

    it('no lanza excepción si supabase devuelve error', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('DB error') });
      await expect(
        auditService.logInvoiceWithoutPrice('u', 'p', 's')
      ).resolves.not.toThrow();
    });
  });

  describe('logSaleBelowCost', () => {
    it('registra precio y costo en metadata', async () => {
      await auditService.logSaleBelowCost('user-1', 'prod-1', 'store-1', 50, 80);
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.price).toBe(50);
      expect(call.metadata.cost).toBe(80);
      expect(call.action).toBe('sale_below_cost');
    });

    it('calcula margin correctamente (price - cost)', async () => {
      await auditService.logSaleBelowCost('u', 'p', 's', 50, 80);
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.margin).toBe(-30);
    });

    it('incluye warning sobre margen negativo', async () => {
      await auditService.logSaleBelowCost('u', 'p', 's', 10, 100);
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.warning).toContain('negative margin');
    });

    it('no lanza excepción si supabase devuelve error', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('DB error') });
      await expect(
        auditService.logSaleBelowCost('u', 'p', 's', 50, 80)
      ).resolves.not.toThrow();
    });
  });

  describe('logTransferCreated', () => {
    it('registra creación de transferencia con todos los campos', async () => {
      const items = [
        { productId: 'p1', quantity: 3, unitCost: 100 },
        { productId: 'p2', quantity: 5, unitCost: 200 },
      ];
      await auditService.logTransferCreated({
        userId: 'u-1',
        transferId: 'txfr-1',
        originStoreId: 'store-a',
        destinationStoreId: 'store-b',
        items,
      });

      const call = mockInsert.mock.calls[0][0];
      expect(call.action).toBe('transfer_created');
      expect(call.metadata.origin_store_id).toBe('store-a');
      expect(call.metadata.destination_store_id).toBe('store-b');
      expect(call.metadata.items_count).toBe(2);
      expect(call.metadata.total_units).toBe(8);
      expect(call.metadata.items).toEqual(items);
    });

    it('usa origin_store_id como store_id en el registro', async () => {
      await auditService.logTransferCreated({
        userId: 'u', transferId: 't',
        originStoreId: 'store-origin', destinationStoreId: 'store-dest',
        items: [],
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.store_id).toBe('store-origin');
    });

    it('maneja error silenciosamente', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
      await expect(
        auditService.logTransferCreated({ items: [] } as any)
      ).resolves.not.toThrow();
    });
  });

  describe('logTransferConfirmed', () => {
    it('registra confirmación con total_units_moved', async () => {
      await auditService.logTransferConfirmed({
        userId: 'u-1', transferId: 'txfr-1',
        originStoreId: 'store-a', destinationStoreId: 'store-b',
        items: [{ productId: 'p1', quantity: 10, unitCost: 50 }],
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.total_units_moved).toBe(10);
    });

    it('usa destination_store_id como store_id', async () => {
      await auditService.logTransferConfirmed({
        userId: 'u', transferId: 't',
        originStoreId: 'store-a', destinationStoreId: 'store-b', items: [],
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.store_id).toBe('store-b');
    });

    it('incluye confirmed_at timestamp', async () => {
      await auditService.logTransferConfirmed({
        userId: 'u', transferId: 't',
        originStoreId: 'a', destinationStoreId: 'b', items: [],
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.confirmed_at).toBeDefined();
    });

    it('maneja error silenciosamente', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
      await expect(
        auditService.logTransferConfirmed({ items: [] } as any)
      ).resolves.not.toThrow();
    });
  });

  describe('logTransferCancelled', () => {
    it('registra cancelación con reason', async () => {
      await auditService.logTransferCancelled({
        userId: 'u-1', transferId: 'txfr-1', storeId: 'store-a', reason: 'Stock insuficiente',
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.reason).toBe('Stock insuficiente');
    });

    it('usa reason por defecto si no se proporciona', async () => {
      await auditService.logTransferCancelled({
        userId: 'u', transferId: 't', storeId: 's',
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.reason).toBe('Cancelled by user');
    });

    it('incluye cancelled_at timestamp', async () => {
      await auditService.logTransferCancelled({
        userId: 'u', transferId: 't', storeId: 's',
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.cancelled_at).toBeDefined();
    });

    it('maneja error silenciosamente', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
      await expect(
        auditService.logTransferCancelled({} as any)
      ).resolves.not.toThrow();
    });
  });

  describe('logReceptionVoided', () => {
    it('registra recepción anulada con receipt_id y reason', async () => {
      await auditService.logReceptionVoided({
        userId: 'u-1', receiptId: 'rcpt-1', storeId: 'store-1', reason: 'Error de proveedor',
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.action).toBe('reception_voided');
      expect(call.metadata.receipt_id).toBe('rcpt-1');
      expect(call.metadata.reason).toBe('Error de proveedor');
      expect(call.table_name).toBe('receipts');
    });

    it('usa reason por defecto "Anulada manualmente"', async () => {
      await auditService.logReceptionVoided({
        userId: 'u', receiptId: 'r', storeId: 's',
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.reason).toBe('Anulada manualmente');
    });

    it('incluye voided_at timestamp', async () => {
      await auditService.logReceptionVoided({
        userId: 'u', receiptId: 'r', storeId: 's',
      });
      const call = mockInsert.mock.calls[0][0];
      expect(call.metadata.voided_at).toBeDefined();
    });

    it('maneja error silenciosamente', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('Err') });
      await expect(
        auditService.logReceptionVoided({} as any)
      ).resolves.not.toThrow();
    });
  });

  describe('contrato general del servicio de auditoría', () => {
    it('todos los métodos escriben en la tabla audit_logs', async () => {
      await auditService.logInvoiceWithoutPrice('u', 'p', 's');
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        table_name: 'transactions',
      }));
      mockInsert.mockClear();

      await auditService.logTransferCancelled({ userId: 'u', transferId: 't', storeId: 's' });
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        table_name: 'transfers',
      }));
      mockInsert.mockClear();

      await auditService.logReceptionVoided({ userId: 'u', receiptId: 'r', storeId: 's' });
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        table_name: 'receipts',
      }));
    });

    it('ningún método lanza excepción ante error de Supabase', async () => {
      mockInsert.mockResolvedValue({ error: new Error('Connection lost') });

      const methods = [
        () => auditService.logInvoiceWithoutPrice('u', 'p', 's'),
        () => auditService.logSaleBelowCost('u', 'p', 's', 50, 80),
        () => auditService.logTransferCreated({ items: [] } as any),
        () => auditService.logTransferConfirmed({ items: [] } as any),
        () => auditService.logTransferCancelled({} as any),
        () => auditService.logReceptionVoided({} as any),
      ];

      for (const method of methods) {
        await expect(method()).resolves.not.toThrow();
      }
    });
  });
});
