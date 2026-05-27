import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeService } from '../store-service';
import { supabase } from '@/lib/supabaseClient';

const createMockQueryBuilder = () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation(function(this: any, callback: any) {
      return Promise.resolve({
        data: this._data,
        error: this._error,
        count: this._count
      }).then(callback);
    }),
    _data: null as any,
    _error: null as any,
    _count: 0 as number | null,
    mockResolvedValue(value: any) {
      this._data = value.data;
      this._error = value.error;
      this._count = value.count !== undefined ? value.count : (value.data ? value.data.length : 0);
      return this;
    }
  };
  return builder;
};

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('obtiene todas las tiendas activas', async () => {
    const mockData = [{ id: '1', name: 'Store 1', is_active: true }];
    const builder = createMockQueryBuilder();
    builder.mockResolvedValue({ data: mockData, error: null });
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    const result = await storeService.getStores();
    expect(result).toEqual(mockData);
  });

  it('crea una tienda', async () => {
    const mockData = { id: '1', name: 'New Store' };
    const builder = createMockQueryBuilder();
    builder.mockResolvedValue({ data: mockData, error: null });
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    const result = await storeService.createStore('admin', 'New Store', 'Address 1');
    expect(result).toEqual(mockData);
  });

  it('actualiza una tienda y aplica whitelist', async () => {
    const mockData = { id: '1', name: 'Updated Store' };
    const builder = createMockQueryBuilder();
    builder.mockResolvedValue({ data: mockData, error: null });
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    const result = await storeService.updateStore('admin', '1', 'Updated Store', 'New Address', {
        is_active: false,
        tenant_id: 'malicious-tenant' as any // Esto debería ser filtrado
    });

    expect(result).toEqual(mockData);
    expect(builder.update).toHaveBeenCalledWith({
        name: 'Updated Store',
        address: 'New Address',
        is_active: false
    });
  });

  it('realiza soft-delete de la tienda', async () => {
    const builder = createMockQueryBuilder();
    builder.mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    await storeService.deleteStore('admin', '1');
    expect(supabase.from).toHaveBeenCalledWith('stores');
  });

  it('reinicio de tienda con notificaciones', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
        const b = createMockQueryBuilder();
        if (table === 'user_store_memberships') {
            b.mockResolvedValue({ data: [{ user_id: 'u2', profiles: { full_name: 'U2' } }], error: null });
        } else {
            b.mockResolvedValue({ data: [], error: null });
        }
        return b as any;
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any);

    await storeService.resetStore('admin', '1');
    expect(supabase.rpc).toHaveBeenCalled();
  });
});
