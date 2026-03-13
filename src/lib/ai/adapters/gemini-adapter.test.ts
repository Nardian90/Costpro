import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from './gemini-adapter';
import { Message } from '../types';

describe('GeminiAdapter', () => {
  const apiKey = 'test-api-key';
  const adapter = new GeminiAdapter(apiKey);

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should use gemini-2.0-flash by default', async () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ];

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Hi there!' }] } }]
      })
    });

    const response = await adapter.getResponse(messages);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.0-flash'),
      expect.any(Object)
    );
    expect(response.text).toBe('Hi there!');
    expect(response.metadata?.model).toBe('gemini-2.0-flash');
  });

  it('should handle API errors correctly', async () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ];

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: { message: 'Invalid API Key' } })
    });

    await expect(adapter.getResponse(messages)).rejects.toThrow('Clave de API de Gemini inválida.');
  });
});
