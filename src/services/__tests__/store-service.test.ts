import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeService } from '../store-service';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  }
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('storeService', () => {
  const createMockChain = (data: any = null, error: any = null, count: any = null) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) => Promise.resolve({ data, error, count }).then(resolve)),
    };
    return chain;
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('obtiene todas las tiendas activas', async () => {
    const mockData = [{ id: '1', name: 'S1' }];
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockData) as any);
    const result = await storeService.getStores();
    expect(result).toEqual(mockData);
  });

  it('crea una tienda verificando límites', async () => {
    const mockStore = { id: 'new-id' };
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockChain(null, null, 2) as any) // count call
      .mockReturnValueOnce(createMockChain(mockStore) as any);   // insert call

    const result = await storeService.createStore('admin', 'S', 'A', 'u1', 5);
    expect(result).toEqual(mockStore);
  });

  it('lanza error si se alcanza el límite de tiendas', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(createMockChain(null, null, 5) as any);
    await expect(storeService.createStore('admin', 'S', 'A', 'u1', 5)).rejects.toThrow(/límite/);
  });

  it('actualiza una tienda', async () => {
    const mockData = { id: '1' };
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockData) as any);
    const result = await storeService.updateStore('admin', '1', 'N', 'A');
    expect(result).toEqual(mockData);
  });

  it('realiza soft-delete de la tienda con cleanup', async () => {
    // Dependency checks (3), Soft delete (1), Memberships (1), Profiles (1)
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockChain(null, null, 0) as any)
      .mockReturnValueOnce(createMockChain(null, null, 0) as any)
      .mockReturnValueOnce(createMockChain(null, null, 0) as any)
      .mockReturnValueOnce(createMockChain({ id: '1' }) as any)
      .mockReturnValueOnce(createMockChain({ count: 1 }) as any)
      .mockReturnValueOnce(createMockChain({ count: 1 }) as any);

    await storeService.deleteStore('admin', '1');
    expect(supabase.from).toHaveBeenCalled();
  });

  it('reinicio de tienda con RPC', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockChain([]) as any) // active check
      .mockReturnValueOnce(createMockChain() as any)   // audit start
      .mockReturnValueOnce(createMockChain() as any);  // audit end
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any);

    await storeService.resetStore('admin', '1');
    expect(supabase.rpc).toHaveBeenCalled();
  });

  it('actualiza storefront', async () => {
    const mockStore = { id: '1' };
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockStore) as any);
    const result = await storeService.updateStorefront('admin', '1', { slug: 's' });
    expect(result).toEqual(mockStore);
  });
});
