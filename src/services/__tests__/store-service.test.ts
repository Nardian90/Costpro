import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeService } from '../store-service';

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

// Mock de logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('storeService', () => {
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();

    chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };

    mocks.from.mockReturnValue(chain);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe('getStores', () => {
    it('obtiene tiendas activas', async () => {
      const mockStores = [{ id: 's1', name: 'S1' }];
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: mockStores, error: null }));

      const result = await storeService.getStores();
      expect(result).toEqual(mockStores);
    });
  });

  describe('resetStore', () => {
    it('realiza snapshot antes del reset', async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: null });
      chain.then.mockImplementation((resolve: any) => resolve({ data: null, error: null }));

      await storeService.resetStore('admin', 's1');

      expect(chain.insert).toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalled();
    });

    it('maneja error en RPC', async () => {
        mocks.rpc.mockResolvedValueOnce({ error: new Error('RPC Failed') });
        await expect(storeService.resetStore('admin', 's1')).rejects.toThrow('RPC Failed');
    });
  });
});
