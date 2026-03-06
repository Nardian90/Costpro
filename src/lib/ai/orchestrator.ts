import { LLMProvider } from './types';
import { GeminiAdapter } from './adapters/gemini-adapter';
import { GPTAdapter } from './adapters/gpt-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';
import { DeepSeekAdapter } from './adapters/deepseek-adapter';
import { KimiAdapter } from './adapters/kimi-adapter';
import { FallbackAdapter } from './adapters/fallback-adapter';
import { createClient } from '@supabase/supabase-js';

export type ProviderType = 'gemini' | 'gpt' | 'qwen' | 'deepseek' | 'kimi';

const DEEPSEEK_DEFAULT_KEY = '';

// Create a minimal client to fetch keys if needed
// This should only be used on the server side
const getSupabaseServer = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export async function getLLMProviderWithUserKey(userId: string, type?: string, forcedApiKey?: string): Promise<LLMProvider> {
  const providerType = (type || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const providers: LLMProvider[] = [];

  // 1. Add requested provider (forced key or DB key)
  let initialKey = forcedApiKey;
  if (!initialKey && userId) {
    const supabase = getSupabaseServer();
    if (supabase) {
      const { data } = await supabase
        .from('ai_api_keys')
        .select('api_key')
        .eq('user_id', userId)
        .eq('provider', providerType)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data?.api_key) {
        initialKey = data.api_key;
      }
    }
  }
  providers.push(getLLMProvider(providerType, initialKey));

  // 2. Add fallbacks from active user keys
  if (userId) {
    const supabase = getSupabaseServer();
    if (supabase) {
      const { data } = await supabase
        .from('ai_api_keys')
        .select('provider, api_key')
        .eq('user_id', userId)
        .eq('is_active', true)
        .neq('provider', providerType); // Avoid duplicates

      if (data) {
        data.forEach(k => {
          providers.push(getLLMProvider(k.provider, k.api_key));
        });
      }
    }
  }

  // 3. Always add DeepSeek as final fallback if not already present
  if (!providers.some(p => p instanceof DeepSeekAdapter)) {
     providers.push(new DeepSeekAdapter(process.env.DEEPSEEK_API_KEY || DEEPSEEK_DEFAULT_KEY));
  }

  return new FallbackAdapter(providers);
}

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
    case 'deepseek':
      return new DeepSeekAdapter(
        apiKey || process.env.DEEPSEEK_API_KEY || DEEPSEEK_DEFAULT_KEY,
        process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      );
    case 'kimi':
      return new KimiAdapter(
        apiKey || process.env.KIMI_API_KEY || '',
        process.env.KIMI_MODEL || 'moonshot-v1-8k'
      );
    case 'gemini':
    default:
      return new GeminiAdapter(
        apiKey || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_MODEL || 'gemini-2.0-flash'
      );
  }
}
