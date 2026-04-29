import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usageService } from '../usage-service';

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

describe('usageService', () => {
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };
    mocks.from.mockReturnValue(chain);
  });

  describe('checkQuota', () => {
    it('permite acceso ilimitado a admins o planes pro', async () => {
      const resAdmin = await usageService.checkQuota('u1', 'fc_create', 'free', 'admin');
      expect(resAdmin.allowed).toBe(true);
      expect(resAdmin.limit).toBe(-1);

      const resPro = await usageService.checkQuota('u1', 'fc_create', 'pro', 'usuario');
      expect(resPro.allowed).toBe(true);
    });

    it('retorna allowed: false si se supera el límite de 3', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: { count: 3 }, error: null }));
      const result = await usageService.checkQuota('u1', 'fc_create', 'free', 'usuario');
      expect(result.allowed).toBe(false);
      expect(result.count).toBe(3);
    });

    it('falla abierto en caso de error de base de datos', async () => {
      chain.then.mockImplementationOnce((resolve: any) => resolve({ error: { code: 'OTHER' } }));
      const result = await usageService.checkQuota('u1', 'fc_create', 'free', 'usuario');
      expect(result.allowed).toBe(true);
    });
  });

  describe('trackUsage', () => {
      it('llama a la RPC increment_user_usage para usuarios free', async () => {
          mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
          const result = await usageService.trackUsage('u1', 'fc_create', 'free', 'usuario');
          expect(result).toBe(true);
          expect(mocks.rpc).toHaveBeenCalledWith('increment_user_usage', expect.any(Object));
      });

      it('no llama a la RPC para admins', async () => {
          await usageService.trackUsage('u1', 'fc_create', 'free', 'admin');
          expect(mocks.rpc).not.toHaveBeenCalled();
      });
  });
});
