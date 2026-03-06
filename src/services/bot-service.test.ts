import { describe, it, expect, vi, beforeEach } from 'vitest';
import { botService } from './bot-service';
import { LLMProvider, Message } from '@/lib/ai/types';

// Mocking dependencies
vi.mock('@/lib/ai/tools/registry', () => ({
  executeTool: vi.fn(async (name, args, context) => {
    if (name === 'open_view' && args.viewId === 'nonexistent') {
      return { error: "Vista no encontrada" };
    }
    return { success: true, action: { type: 'test_action', payload: args } };
  })
}));

const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn().mockResolvedValue({ error: null })
  }))
} as any;

describe('botService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle simple chat without tools', async () => {
    const mockProvider: LLMProvider = {
      getResponse: vi.fn().mockResolvedValue({ text: 'Hello human' })
    };

    const response = await botService.handleChat(
      mockSupabase,
      'user-123',
      'admin',
      'store-456',
      [{ role: 'user', content: 'hi' }],
      mockProvider
    );

    expect(response.text).toBe('Hello human');
    expect(mockProvider.getResponse).toHaveBeenCalledTimes(1);
  });

  it('should handle tool calls correctly', async () => {
    const mockProvider: LLMProvider = {
      getResponse: vi.fn()
        .mockResolvedValueOnce({
          text: 'Opening view...',
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'open_view', arguments: '{"viewId": "sales"}' }
          }]
        })
        .mockResolvedValueOnce({ text: 'View opened.' })
    };

    const response = await botService.handleChat(
      mockSupabase,
      'user-123',
      'admin',
      'store-456',
      [{ role: 'user', content: 'go to sales' }],
      mockProvider
    );

    expect(response.text).toBe('View opened.');
    expect(response.metadata.actions).toHaveLength(1);
    expect(response.metadata.actions[0].type).toBe('navigation');
    expect(mockProvider.getResponse).toHaveBeenCalledTimes(2);
  });

  it('should limit iterations to MAX_ITERATIONS', async () => {
     const mockProvider: LLMProvider = {
      getResponse: vi.fn().mockResolvedValue({
        text: 'Looping...',
        tool_calls: [{
          id: 'call-loop',
          type: 'function',
          function: { name: 'open_view', arguments: '{"viewId": "sales"}' }
        }]
      })
    };

    const response = await botService.handleChat(
      mockSupabase,
      'user-123',
      'admin',
      'store-456',
      [{ role: 'user', content: 'loop please' }],
      mockProvider
    );

    expect(mockProvider.getResponse).toHaveBeenCalledTimes(5); // MAX_ITERATIONS
  });

  it('should enforce message length limit', async () => {
    const longMessage = 'a'.repeat(11000);
    const mockProvider: LLMProvider = { getResponse: vi.fn() };

    await expect(botService.handleChat(
      mockSupabase,
      'user-123',
      'admin',
      'store-456',
      [{ role: 'user', content: longMessage }],
      mockProvider
    )).rejects.toThrow("El mensaje es demasiado largo");
  });
});
