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
  it('should validate parameters with Zod', async () => {
    // Missing viewId
    const result = await executeTool('open_view', {}, context);
    expect(result.error).toContain('Argumentos inválidos');
  });

  it('should enforce RBAC', async () => {
    const limitedContext = { ...context, userRole: 'vendedor' };

    // Vendedor cannot submit_form
    const result = await executeTool('submit_form', { formName: 'test', data: {} }, limitedContext);
    expect(result.error).toContain('Acceso denegado');
  });

  it('should allow authorized roles', async () => {
    const result = await executeTool('open_view', { viewId: 'dashboard' }, context);
    expect(result.success).toBe(true);
  });

  it('should sanitize search queries', async () => {
    const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
            ilike: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    }));

    const customSupabase = {
        from: vi.fn(() => ({
            select: selectMock
        }))
    } as any;

    await executeTool('search_entity', { entity: 'product', query: 'Milk% or 1=1' }, { ...context, supabase: customSupabase });

    // Check if % was escaped to \%
    const ilikeCall = selectMock().eq().ilike.mock.calls[0];
    expect(ilikeCall[1]).toContain('Milk\\%');
  });
});
