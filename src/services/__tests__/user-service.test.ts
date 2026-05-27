import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from '../user-service';

// Mock de supabase
const mocks = vi.hoisted(() => {
  const m = {
    from: vi.fn(),
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    }
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
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock de validadores
vi.mock('@/lib/rpc-validator', () => ({
  validateResponse: vi.fn((data) => data),
}));

describe('userService', () => {
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();

    chain = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };

    mocks.from.mockReturnValue(chain);
  });

  describe('setActiveStore(userId, storeId)', () => {
    it('actualiza active_store_id en el perfil si la membresía existe', async () => {
      // Mock membership check success
      chain.then.mockImplementationOnce((resolve: any) => resolve({
        data: [{ id: 'm1', status: 'active', store: { id: 'store-1', is_active: true } }],
        error: null
      }));
      // Mock profile update success
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: { success: true }, error: null }));

      await userService.setActiveStore('user-1', 'store-1');

      expect(mocks.from).toHaveBeenCalledWith('user_store_memberships');
      expect(mocks.from).toHaveBeenCalledWith('profiles');
      expect(chain.update).toHaveBeenCalledWith({ active_store_id: 'store-1' });
    });

    it('lanza error si no hay membresía', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));
      await expect(userService.setActiveStore('user-1', 'store-1')).rejects.toThrow(/Membresía no encontrada/);
    });
  });

  describe('getUserProfile(userId)', () => {
    it('obtiene el perfil y las membresías', async () => {
      const mockProfile = {
        id: 'user-1',
        full_name: 'Test',
        is_active: true,
        role: 'admin',
        active_store_id: 'store-1'
      };

      chain.single.mockReturnThis();
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: mockProfile, error: null }));
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));
      chain.limit.mockReturnThis();
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [{ role: 'admin' }], error: null }));

      const result = await userService.getUserProfile('user-1');

      expect(result).toMatchObject({
        id: 'user-1',
        active_store_id: 'store-1',
        roles: ['admin']
      });
    });
  });
});
