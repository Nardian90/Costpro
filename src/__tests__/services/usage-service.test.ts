import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usageService } from '@/services/usage-service';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn(),
  },
}));

describe('usageService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checkQuota works', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { count: 1 }, error: null }),
    } as any);
    const res = await usageService.checkQuota('u1', 'fc_create');
    expect(res.allowed).toBe(true);
  });

  it('trackUsage works', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
      await usageService.trackUsage('u1', 'fc_create');
      expect(supabase.rpc).toHaveBeenCalled();
  });
});
