import { LLMProvider } from './types';
import { GeminiAdapter } from './adapters/gemini-adapter';
import { GPTAdapter } from './adapters/gpt-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';

export type ProviderType = 'gemini' | 'gpt' | 'qwen';

export function getLLMProvider(type?: string, apiKey?: string): LLMProvider {
  const providerType = (type || process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  switch (providerType) {
    case 'gpt':
      return new GPTAdapter(
        apiKey || process.env.OPENAI_API_KEY || '',
        process.env.OPENAI_MODEL || 'gpt-4o'
      );
    case 'qwen':
      return new QwenAdapter(
        apiKey || process.env.QWEN_API_KEY || '',
        process.env.QWEN_MODEL || 'qwen-turbo'
      );
    case 'gemini':
    default:
      return new GeminiAdapter(
        apiKey || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-09-2025'
      );
  }
}
