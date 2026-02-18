import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from './gemini-adapter';
import { Message } from '../types';

const generateContentMock = vi.fn();
const getGenerativeModelMock = vi.fn();

// Mock the SDK
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn(function() {
      return {
        getGenerativeModel: getGenerativeModelMock
      };
    })
  };
});

describe('GeminiAdapter', () => {
  const apiKey = 'test-api-key';
  const adapter = new GeminiAdapter(apiKey);

  beforeEach(() => {
    vi.clearAllMocks();
    getGenerativeModelMock.mockReturnValue({
      generateContent: generateContentMock
    });
    generateContentMock.mockResolvedValue({
      response: {
        text: () => 'Hello'
      }
    });
  });

  it('should correctly format messages and handle alternating roles', async () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are an assistant' },
      { role: 'user', content: 'Hi' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine' }
    ];

    await adapter.getResponse(messages);

    // Check model config
    expect(getGenerativeModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash-lite',
        systemInstruction: 'You are an assistant'
      }),
      { apiVersion: 'v1beta' }
    );

    const callArgs = generateContentMock.mock.calls[0][0];
    const contents = callArgs.contents;

    // Expect merged user messages
    expect(contents).toHaveLength(2);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts).toHaveLength(2);
    expect(contents[0].parts[0].text).toBe('Hi');
    expect(contents[0].parts[1].text).toBe('How are you?');

    // Expect assistant message as 'model'
    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].text).toBe('I am fine');
  });

  it('should ensure first message is user', async () => {
    const messages: Message[] = [
      { role: 'assistant', content: 'I started first' }
    ];

    await adapter.getResponse(messages);

    const contents = generateContentMock.mock.calls[0][0].contents;

    expect(contents).toHaveLength(2);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('[Contexto]');
    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].text).toBe('I started first');
  });

  it('should handle API errors gracefully', async () => {
    generateContentMock.mockRejectedValue(new Error('404 Not Found'));

    await expect(adapter.getResponse([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('Error de Modelo: El modelo gemini-2.5-flash-lite no está disponible');
  });
});
