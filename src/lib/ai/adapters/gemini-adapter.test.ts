import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from './gemini-adapter';
import { Message } from '../types';

const generateContentMock = vi.fn();
const getGenerativeModelMock = vi.fn();

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
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }]
      }
    });
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
  });
});
