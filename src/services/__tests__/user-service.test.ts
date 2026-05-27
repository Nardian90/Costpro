import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from '../user-service';
import { supabase } from '@/lib/supabaseClient';

const createMockQueryBuilder = () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation(function(this: any, callback: any) {
      return Promise.resolve({ data: this._data, error: this._error }).then(callback);
    }),
    _data: null as any,
    _error: null as any,
    mockResolvedValue(value: any) {
      this._data = value.data;
      this._error = value.error;
      return this;
    }
  };
  return builder;
};

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null })
    }
  }
}));

vi.mock('@/lib/rpc-validator', () => ({
  validateResponse: vi.fn().mockImplementation((data) => Promise.resolve(data)),
}));

describe('userService', () => {
  const mockFrom = vi.mocked(supabase.from);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setActiveStore', async () => {
    const mockMembership = [{ id: 'm1', status: 'active', store: { is_active: true } }];
    const builder = createMockQueryBuilder();
    builder.mockResolvedValue({ data: mockMembership, error: null });
    mockFrom.mockReturnValue(builder as any);

    await userService.setActiveStore('u1', 's1');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });

  it('logout', async () => {
    await userService.logout();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('getUserProfile', async () => {
    const mockProfile = { id: 'u1', role: 'clerk', is_active: true };
    const mockMemberships = [{ store_id: 's1', role: 'admin', status: 'active', store: { is_active: true } }];

    mockFrom.mockImplementation((table: string) => {
        const b = createMockQueryBuilder();
        if (table === 'profiles') b.mockResolvedValue({ data: mockProfile, error: null });
        if (table === 'user_store_memberships') b.mockResolvedValue({ data: mockMemberships, error: null });
        return b as any;
    });

    const result = await userService.getUserProfile('u1');
    expect(result?.id).toBe('u1');
  });

  it('updateAISettings', async () => {
      const builder = createMockQueryBuilder();
      builder.mockResolvedValue({ error: null });
      mockFrom.mockReturnValue(builder as any);
      await userService.updateAISettings('u1', 'u1', 'gemini', 'key');
      expect(supabase.from).toHaveBeenCalledWith('profiles');
  });
});
