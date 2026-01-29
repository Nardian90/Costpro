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

  it('should correctly format messages and handle alternating roles', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello' }] }, finishReason: 'STOP' }]
      })
    });

    const messages: Message[] = [
      { role: 'system', content: 'You are an assistant' },
      { role: 'user', content: 'Hi' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine' }
    ];

    await adapter.getResponse(messages);

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    // Expect system instruction
    expect(body.system_instruction.parts[0].text).toBe('You are an assistant');

    // Expect merged user messages
    expect(body.contents).toHaveLength(2);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].text).toBe('Hi');
    expect(body.contents[0].parts[1].text).toBe('How are you?');

    // Expect assistant message as 'model'
    expect(body.contents[1].role).toBe('model');
    expect(body.contents[1].parts[0].text).toBe('I am fine');
  });

  it('should ensure first message is user', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello' }] }, finishReason: 'STOP' }]
      })
    });

    const messages: Message[] = [
      { role: 'assistant', content: 'I started first' }
    ];

    await adapter.getResponse(messages);

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);

    expect(body.contents).toHaveLength(2);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe('[Contexto]');
    expect(body.contents[1].role).toBe('model');
    expect(body.contents[1].parts[0].text).toBe('I started first');
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: { message: 'Model not found' } })
    });

    await expect(adapter.getResponse([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('Gemini API: Model not found');
  });
});
