import { LLMProvider } from './types';
import { GeminiAdapter } from './adapters/gemini-adapter';
import { GPTAdapter } from './adapters/gpt-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';
import { DeepSeekAdapter } from './adapters/deepseek-adapter';
import { KimiAdapter } from './adapters/kimi-adapter';
import { FallbackAdapter } from './adapters/fallback-adapter';
import { createClient } from '@supabase/supabase-js';

export type ProviderType = 'gemini' | 'gpt' | 'qwen' | 'deepseek' | 'kimi';

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

  const mainProvider = getLLMProvider(providerType, initialKey);
  if (initialKey) {
    providers.push(mainProvider);
  }

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

  // 3. If no user keys, try fallback options
  if (providers.length === 0) {
    // A. System Fallback: Global system key in DB
    const supabase = getSupabaseServer();
    if (supabase) {
      const { data } = await supabase
        .from('ai_api_keys')
        .select('provider, api_key')
        .is('user_id', null)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data) {
        providers.push(getLLMProvider(data.provider, data.api_key));
      }
    }

    // B. Infrastructure Fallback: Environment Variables (Vercel/Hosting)
    if (process.env.GOOGLE_API_KEY) {
      providers.push(getLLMProvider('gemini', process.env.GOOGLE_API_KEY));
    }
    if (process.env.OPENAI_API_KEY) {
      providers.push(getLLMProvider('gpt', process.env.OPENAI_API_KEY));
    }
    if (process.env.DEEPSEEK_API_KEY) {
      providers.push(getLLMProvider('deepseek', process.env.DEEPSEEK_API_KEY));
    }

    // C. Emergency Last Resort: Emergency Environment Variable
    if (process.env.EMERGENCY_GOOGLE_API_KEY) {
      providers.push(getLLMProvider('gemini', process.env.EMERGENCY_GOOGLE_API_KEY));
    }
  }

  // If still no keys, return the main provider (will use env defaults or throw)
  if (providers.length === 0) {
    return mainProvider;
  }

  return new FallbackAdapter(providers);
}

export function getLLMProvider(type?: string, apiKey?: string): LLMProvider {
  const providerType = (type || process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  switch (providerType) {
    case 'gpt':
      return new GPTAdapter(
        apiKey || '',
        process.env.OPENAI_MODEL || 'gpt-4o'
      );
    case 'qwen':
      return new QwenAdapter(
        apiKey || '',
        process.env.QWEN_MODEL || 'qwen-turbo'
      );
    case 'deepseek':
      return new DeepSeekAdapter(
        apiKey || '',
        process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      );
    case 'kimi':
      return new KimiAdapter(
        apiKey || '',
        process.env.KIMI_MODEL || 'moonshot-v1-8k'
      );
    case 'gemini':
    default:
      return new GeminiAdapter(
        apiKey || '',
        process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-09-2025'
      );
  }
}
