import { describe, it, expect, vi, beforeEach } from 'vitest';
import { botService } from './bot-service';

vi.mock('@/lib/ai/orchestrator', () => ({
  getLLMProvider: vi.fn(),
}));

import { getLLMProvider } from '@/lib/ai/orchestrator';

describe('botService', () => {
  let mockProvider: any;
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      getResponse: vi.fn(),
    };
    (getLLMProvider as any).mockReturnValue(mockProvider);

    mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }))
    };
  });

  it('should handle simple chat without tools', async () => {
    mockProvider.getResponse.mockResolvedValue({
      text: 'Hello world',
    });

    const response = await botService.handleChat(
      mockSupabase, 'user-1', 'admin', 'store-1',
      [{ role: 'user', content: 'Hi' }]
    );
    expect(response.text).toBe('Hello world');
    expect(mockProvider.getResponse).toHaveBeenCalledTimes(1);
  });

  it('should handle tool calls correctly', async () => {
    mockProvider.getResponse
      .mockResolvedValueOnce({
        text: 'Let me open that for you.',
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: {
              name: 'open_view',
              arguments: JSON.stringify({ viewId: 'inventory' }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'View opened.',
      });

    const response = await botService.handleChat(
      mockSupabase, 'user-1', 'admin', 'store-1',
      [{ role: 'user', content: 'Open inventory' }]
    );

    expect(response.text).toBe('View opened.');
    expect(response.metadata.actions).toHaveLength(1);
    expect(response.metadata.actions[0].type).toBe('navigation');
  });
});
