import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transferService } from '../transfer-service';

// Mock de supabase
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: mocks
}));

// Mock de validadores
vi.mock('@/lib/rpc-validator', () => ({
  validateRPCResponse: vi.fn((data) => data),
  validateRPCArrayResponse: vi.fn((data) => data || []),
}));

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';
const VALID_UUID_3 = '33333333-3333-3333-3333-333333333333';

describe('transferService', () => {
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();

    chain = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };

    mocks.from.mockReturnValue(chain);
  });

  describe('getIncomingTransfers(storeId)', () => {
    it('filtra por destination_store_id correctamente', async () => {
      const mockTransfers = [{ id: VALID_UUID_1, destination_store_id: 's-1' }];
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: mockTransfers, error: null }));

      const result = await transferService.getIncomingTransfers('s-1');

      expect(mocks.from).toHaveBeenCalledWith('transfers');
      expect(chain.eq).toHaveBeenCalledWith('destination_store_id', 's-1');
      expect(result).toEqual(mockTransfers);
    });
  });

  describe('getOutgoingTransfers', () => {
      it('filtra por origin_store_id', async () => {
          await transferService.getOutgoingTransfers('s-1');
          expect(chain.eq).toHaveBeenCalledWith('origin_store_id', 's-1');
      });
  });

  describe('getTransferDetails', () => {
      it('obtiene una transferencia por id', async () => {
          await transferService.getTransferDetails(VALID_UUID_1);
          expect(chain.eq).toHaveBeenCalledWith('id', VALID_UUID_1);
      });
  });

  describe('getTransferableStores', () => {
      it('llama a la RPC get_transferable_stores', async () => {
          const stores = [{ id: 's2', name: 'S2' }];
          mocks.rpc.mockResolvedValueOnce({ data: stores, error: null });

          const result = await transferService.getTransferableStores(VALID_UUID_1, VALID_UUID_2);
          expect(result).toEqual(stores);
          expect(mocks.rpc).toHaveBeenCalledWith('get_transferable_stores', expect.objectContaining({
              p_user_id: VALID_UUID_1,
              p_current_store_id: VALID_UUID_2
          }));
      });
  });

  describe('createTransfer(params)', () => {
    it('llama a la RPC create_transfer con los parámetros correctos', async () => {
      const params = {
        origin_store_id: VALID_UUID_1,
        destination_store_id: VALID_UUID_2,
        items: [{ product_id: VALID_UUID_3, quantity: 10, unit_cost: 50 }],
        notes: 'Test'
      };
      mocks.rpc.mockResolvedValueOnce({ data: { id: 'new-tx' }, error: null });

      const result = await transferService.createTransfer(params);

      expect(mocks.rpc).toHaveBeenCalledWith('create_transfer', expect.objectContaining({
        p_origin_store_id: params.origin_store_id,
        p_notes: 'Test'
      }));
      expect(result).toEqual({ id: 'new-tx' });
    });
  });

  describe('confirmTransfer(transferId, userId)', () => {
    it('llama a la RPC confirm_transfer', async () => {
      const txId = VALID_UUID_1;
      const userId = VALID_UUID_2;
      mocks.rpc.mockResolvedValueOnce({ data: { status: 'success' }, error: null });

      const result = await transferService.confirmTransfer(txId, userId);

      expect(mocks.rpc).toHaveBeenCalledWith('confirm_transfer', {
        p_transfer_id: txId,
        p_user_id: userId
      });
      expect(result).toEqual({ status: 'success' });
    });

    it('lanza error si la RPC retorna status error', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: { status: 'error', message: 'Failed' }, error: null });
        await expect(transferService.confirmTransfer(VALID_UUID_1, VALID_UUID_2)).rejects.toThrow('Failed');
    });
  });
});
