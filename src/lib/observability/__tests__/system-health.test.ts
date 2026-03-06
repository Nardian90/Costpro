import { describe, it, expect, vi } from 'vitest';
import { logSystemHealth, getSystemHealthLogs } from '../system-health';

describe('System Health Logging', () => {
  it('should call supabase insert with correct data', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    const mockSupabase = { from: mockFrom } as any;

    const log = {
      view_name: 'test-view',
      status: 'ok' as const,
      description: 'Test description',
      priority: 'low' as const
    };

    await logSystemHealth(mockSupabase, log);

    expect(mockFrom).toHaveBeenCalledWith('system_health_logs');
    expect(mockInsert).toHaveBeenCalledWith([log]);
  });

  it('should call supabase select with correct params', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const mockSupabase = { from: mockFrom } as any;

    await getSystemHealthLogs(mockSupabase, 10);

    expect(mockFrom).toHaveBeenCalledWith('system_health_logs');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('timestamp', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});
