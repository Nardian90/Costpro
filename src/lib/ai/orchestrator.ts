import { LLMProvider } from './types';
import { GeminiAdapter } from './adapters/gemini-adapter';
import { GPTAdapter } from './adapters/gpt-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';
import { createClient } from '@supabase/supabase-js';

export type ProviderType = 'gemini' | 'gpt' | 'qwen';

// Create a minimal client to fetch keys if needed
// This should only be used on the server side
const getSupabaseServer = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export async function getLLMProviderWithUserKey(userId: string, type?: string, forcedApiKey?: string): Promise<LLMProvider> {
  let apiKey = forcedApiKey;
  const providerType = (type || process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  // If no forced key, try to fetch from DB for this user
  if (!apiKey && userId) {
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
        apiKey = data.api_key;
      }
    }
  }

  return getLLMProvider(providerType, apiKey);
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
    case 'gemini':
    default:
      return new GeminiAdapter(
        apiKey || process.env.GEMINI_API_KEY || 'AIzaSyBV8-Gev1bjoemUuGtjmpGbeSFMvdmTOR4',
        process.env.GEMINI_MODEL || 'gemini-2.0-flash'
      );
  }
}
