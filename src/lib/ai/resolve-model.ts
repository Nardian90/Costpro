/**
 * AI Model resolver — extracted from academy/generate route for testability.
 *
 * FIX-AUDIT: resolveModel was inline in the route handler, making it impossible
 * to unit test. Now it's a pure function that can be imported and tested.
 */

import type { LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export interface ResolvedModel {
  model: LanguageModel;
  name: 'gemini' | 'glm';
}

/**
 * Resolve a Vercel AI SDK model from provider name + optional user API key.
 *
 * Priority:
 *   1. If aiProvider contains "gemini" or "google" → use Gemini
 *   2. Otherwise (including "glm", "zai", "openai", or empty) → use GLM (z.ai)
 *
 * API key resolution:
 *   - User-provided key (aiApiKey) takes priority
 *   - Falls back to server env vars (GOOGLE_API_KEY, ZAI_API_KEY)
 *
 * @throws Error if no API key is available for the resolved provider
 */
export function resolveModel(aiProvider?: string, aiApiKey?: string): ResolvedModel {
  const providerLower = (aiProvider || '').toLowerCase();
  const isGemini = providerLower.includes('gemini') || providerLower.includes('google');

  if (isGemini) {
    const apiKey = aiApiKey || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('No Gemini API key available');
    const gemini = createGoogleGenerativeAI({ apiKey });
    return { model: gemini('gemini-2.5-flash'), name: 'gemini' };
  }

  // Default: GLM via z.ai (internal API or public)
  const apiKey = aiApiKey || process.env.ZAI_API_KEY;
  const baseURL = process.env.ZAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  if (!apiKey) throw new Error('No GLM API key available');
  const glm = createOpenAICompatible({ name: 'glm', baseURL, apiKey });
  return { model: glm('glm-4.5-flash'), name: 'glm' };
}
