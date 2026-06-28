/**
 * Vercel AI SDK — Provider factory for z.ai (GLM) internal API.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { LanguageModel } from 'ai';

export type AIProviderName = 'glm' | 'gemini';

const DEFAULT_GLM_MODEL = 'glm-4.5-air';

interface ZaiConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

let cachedConfig: ZaiConfig | null = null;

function loadZaiConfig(): ZaiConfig | null {
  if (cachedConfig) return cachedConfig;

  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];

  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        cachedConfig = JSON.parse(raw);
        return cachedConfig;
      }
    } catch {
      // Continue
    }
  }
  return null;
}

function resolveGLMModel(override?: string): string {
  if (override && /^(glm|chatglm)/i.test(override)) return override;
  return process.env.GLM_MODEL ?? DEFAULT_GLM_MODEL;
}

function makeZaiFetch(config: ZaiConfig): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${config.apiKey}`);
    headers.set('X-Z-AI-from', 'Z');
    if (config.chatId) headers.set('X-Chat-Id', config.chatId);
    if (config.userId) headers.set('X-User-Id', config.userId);
    if (config.token) headers.set('X-Token', config.token);

    return fetch(input, { ...init, headers });
  };
}

export function getGLMModel(modelOverride?: string): LanguageModel {
  const config = loadZaiConfig();

  if (config) {
    const glm = createOpenAICompatible({
      name: 'zai-internal',
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      fetch: makeZaiFetch(config),
    });
    return glm(resolveGLMModel(modelOverride));
  }

  const apiKey = process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
  const baseURL = process.env.ZAI_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4';

  if (!apiKey) {
    throw new Error('No ZAI configuration');
  }

  const glm = createOpenAICompatible({
    name: 'glm-public',
    baseURL,
    apiKey,
  });
  return glm(resolveGLMModel(modelOverride));
}

export function getGeminiModel(_modelOverride?: string): LanguageModel {
  throw new Error('Gemini not available');
}

export function resolvePreferredProvider(_modelOverride?: string): AIProviderName {
  return 'glm';
}

export function getModel(modelOverride?: string, _preferred?: AIProviderName): LanguageModel {
  return getGLMModel(modelOverride);
}
