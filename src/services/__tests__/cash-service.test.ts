import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cashService } from '../cash-service';

// Mock de supabase
const mocks = vi.hoisted(() => {
  const m = {
    from: vi.fn(),
    rpc: vi.fn(),
  };
  return m;
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: mocks
}));

describe('cashService', () => {
  let chain: any;
  const VALID_UUID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();

    chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };

    mocks.from.mockReturnValue(chain);
  });

  describe('getSalesSinceLastClosure', () => {
    it('llama a la RPC', async () => {
      const mockData = [{ total_sales: 100 }];
      mocks.rpc.mockResolvedValueOnce({ data: mockData, error: null });

      const result = await cashService.getSalesSinceLastClosure(VALID_UUID);
      expect(result).toEqual(mockData[0]);
    });

    it('lanza error si RPC falla', async () => {
        mocks.rpc.mockResolvedValueOnce({ error: new Error('Err') });
        await expect(cashService.getSalesSinceLastClosure(VALID_UUID)).rejects.toThrow('Err');
    });
  });

  describe('createClosure', () => {
      it('crea un cierre', async () => {
          const mock = { id: '1' };
          chain.then.mockImplementationOnce((resolve: any) => resolve({ data: mock, error: null }));
          const result = await cashService.createClosure({});
          expect(result).toEqual(mock);
      });
  });

  describe('updateClosure', () => {
      it('actualiza un cierre', async () => {
          const mock = { id: '1' };
          chain.then.mockImplementationOnce((resolve: any) => resolve({ data: mock, error: null }));
          const result = await cashService.updateClosure('1', {});
          expect(result).toEqual(mock);
          expect(chain.update).toHaveBeenCalled();
      });
  });

  describe('getClosures', () => {
    it('filtra por store_id si no es admin', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));
      await cashService.getClosures('s1', false);
      expect(chain.eq).toHaveBeenCalledWith('store_id', 's1');
    });

    it('no filtra por store_id si es admin', async () => {
        chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));
        await cashService.getClosures('s1', true);
        expect(chain.eq).not.toHaveBeenCalled();
    });
  });
});
