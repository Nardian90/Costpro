/**
 * Vercel AI SDK — Provider factory for z.ai (GLM) internal API.
 *
 * MIGRATION FIX: The public API at open.bigmodel.cn returns "余额不足"
 * (insufficient balance) for the API key in .env. The SDK was previously
 * using z-ai-web-dev-sdk which reads /etc/.z-ai-config and uses the
 * INTERNAL API at https://internal-api.z.ai/v1 with special headers.
 *
 * This provider replicates that behavior using createOpenAICompatible
 * with a custom fetch wrapper that injects the required headers:
 *   - Authorization: Bearer Z.ai
 *   - X-Z-AI-from: Z
 *   - X-Chat-Id: <from config>
 *   - X-User-Id: <from config>
 *   - X-Token: <JWT from config>
 *
 * Gemini is NOT used as fallback — the server runs in a region blocked
 * by Google ("User location is not supported for the API use").
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { LanguageModel } from 'ai';

export type AIProviderName = 'glm' | 'gemini';

const DEFAULT_GLM_MODEL = 'glm-4.5-flash';

interface ZaiConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

let cachedConfig: ZaiConfig | null = null;

/**
 * Load z.ai config from /etc/.z-ai-config (or other paths the SDK checks).
 * Cached after first read.
 */
function loadZaiConfig(): ZaiConfig | null {
  if (cachedConfig) return cachedConfig;

  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
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
      // Continue to next path
    }
  }
  return null;
}

function resolveGLMModel(override?: string): string {
  if (override && /^(glm|chatglm)/i.test(override)) return override;
  return process.env.GLM_MODEL ?? DEFAULT_GLM_MODEL;
}

/**
 * Create a fetch function that injects z.ai internal headers.
 * The internal API requires these custom headers — without them it returns 403.
 */
function makeZaiFetch(config: ZaiConfig): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    // Override Authorization with the internal apiKey (literal "Z.ai")
    headers.set('Authorization', `Bearer ${config.apiKey}`);
    headers.set('X-Z-AI-from', 'Z');
    if (config.chatId) headers.set('X-Chat-Id', config.chatId);
    if (config.userId) headers.set('X-User-Id', config.userId);
    if (config.token) headers.set('X-Token', config.token);

    return fetch(input, { ...init, headers });
  };
}

/**
 * Returns the GLM language model using the z.ai INTERNAL API.
 *
 * Resolution order:
 *   1. /etc/.z-ai-config (preferred — has token + chatId for internal API)
 *   2. Fall back to ZAI_API_KEY + ZAI_BASE_URL env vars (public API)
 *
 * Note: env-var path may fail with "余额不足" if the account has no balance.
 */
export function getGLMModel(modelOverride?: string): LanguageModel {
  const config = loadZaiConfig();

  if (config) {
    // Use internal API with custom headers
    const glm = createOpenAICompatible({
      name: 'zai-internal',
      baseURL: config.baseUrl,
      apiKey: config.apiKey, // literal "Z.ai" — actual auth via X-Token header
      fetch: makeZaiFetch(config),
    });
    return glm(resolveGLMModel(modelOverride));
  }

  // Fallback: public API with env vars (may fail with insufficient balance)
  const apiKey = process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
  const baseURL = process.env.ZAI_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4';

  if (!apiKey) {
    throw new Error(
      'Neither /etc/.z-ai-config nor ZAI_API_KEY is available. ' +
      'The chatbot cannot function without a valid z.ai configuration.'
    );
  }

  const glm = createOpenAICompatible({
    name: 'glm-public',
    baseURL,
    apiKey,
  });
  return glm(resolveGLMModel(modelOverride));
}

/**
 * Gemini is NOT available in this deployment — the server runs in a region
 * blocked by Google. We throw to make this explicit; callers should not
 * fall back to Gemini.
 */
export function getGeminiModel(_modelOverride?: string): LanguageModel {
  throw new Error(
    'Gemini is not available in this region (User location is not supported). ' +
    'GLM is the only supported AI provider in this deployment.'
  );
}

/**
 * Resolve the preferred provider. Always returns 'glm' in this deployment
 * because Gemini is region-blocked.
 */
export function resolvePreferredProvider(_modelOverride?: string): AIProviderName {
  // Ignore gemini model overrides — only GLM works in this region
  return 'glm';
}

/**
 * Get the active model. Always GLM.
 */
export function getModel(modelOverride?: string, _preferred?: AIProviderName): LanguageModel {
  return getGLMModel(modelOverride);
}
