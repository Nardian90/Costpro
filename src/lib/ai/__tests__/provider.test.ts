import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callAI } from '../provider';

// Mock dynamic import for z-ai-web-dev-sdk
vi.mock('z-ai-web-dev-sdk', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'GLM Response' } }]
        })
      }
    };
  }
}));

// Mock GoogleGenerativeAI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        startChat: () => ({
          sendMessage: vi.fn().mockResolvedValue({
            response: { text: () => 'Gemini Response' }
          })
        })
      };
    }
  }
}));

describe('AI Provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('usa GLM cuando la clave está disponible', async () => {
    process.env.GLM_API_KEY = 'test-key';
    const result = await callAI([{ role: 'user', content: 'hola' }], 'system');
    expect(result.text).toBe('GLM Response');
    expect(result.provider).toBe('glm');
  });

  it('usa Gemini directamente si GLM_API_KEY falta', async () => {
    delete process.env.GLM_API_KEY;
    delete process.env.ZAI_API_KEY;
    process.env.GOOGLE_API_KEY = 'test-key';

    const result = await callAI([{ role: 'user', content: 'hola' }], 'system');
    expect(result.text).toBe('Gemini Response');
    expect(result.provider).toBe('gemini');
  });
});
