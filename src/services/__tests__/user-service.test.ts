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
    it('actualiza active_store_id en el perfil', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: { success: true }, error: null }));

      await userService.setActiveStore('user-1', 'store-1');

      expect(mocks.from).toHaveBeenCalledWith('profiles');
      expect(chain.update).toHaveBeenCalledWith({ active_store_id: 'store-1' });
      expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
    });
  });

  describe('logout', () => {
    it('llama a supabase.auth.signOut', async () => {
      await userService.logout();
      expect(mocks.auth.signOut).toHaveBeenCalled();
    });

    it('lanza error si signOut falla', async () => {
      mocks.auth.signOut.mockResolvedValueOnce({ error: new Error('Logout failed') });
      await expect(userService.logout()).rejects.toThrow('Logout failed');
    });
  });

  describe('updateAISettings', () => {
    it('actualiza el proveedor y la clave de IA', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ error: null }));
      await userService.updateAISettings('user-1', 'openai', 'key-123');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        ai_provider: 'openai',
        ai_api_key: 'key-123'
      }));
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

    it('usa el fallback si faltan columnas en el perfil', async () => {
        // First call fails with 42703 (missing column)
        chain.single.mockReturnThis();
        chain.then.mockImplementationOnce((resolve: any) => resolve({ error: { code: '42703' } }));
        // Second call (fallback) succeeds
        chain.then.mockImplementationOnce((resolve: any) => resolve({ data: { id: 'u1', is_active: true, full_name: 'F' }, error: null }));
        // Memberships call
        chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null }));

        const result = await userService.getUserProfile('user-1');
        expect(result).not.toBeNull();
        expect(result?.full_name).toBe('F');
    });

    it('devuelve null si el perfil no existe', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: null, error: { code: 'PGRST116', message: 'Not found' } }));
      const result = await userService.getUserProfile('user-1');
      expect(result).toBeNull();
    });
  });
});
