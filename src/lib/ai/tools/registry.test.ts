import { describe, it, expect, vi } from 'vitest';
import { executeTool } from './registry';

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
            gt: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [] })
            }))
        }))
      }))
    }))
  }))
} as any;

const context = {
  supabase: mockSupabase,
  userId: 'user-123',
  userRole: 'admin',
  storeId: 'store-456'
};

describe('Tool Registry Execution', () => {
  it('should sanitize search queries', async () => {
    const ilikeMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn(() => ({
        ilike: ilikeMock
    }));
    const selectMock = vi.fn(() => ({
        eq: eqMock
    }));

    const customSupabase = {
        from: vi.fn(() => ({
            select: selectMock
        }))
    } as any;

    await executeTool('search_entity', { entity: 'product', query: 'Milk% or 1=1' }, { ...context, supabase: customSupabase });

    expect(ilikeMock).toHaveBeenCalled();
    const ilikeCall = ilikeMock.mock.calls[0];
    expect(ilikeCall[1]).toContain('Milk\\%');
  });
});
