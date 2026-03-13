import { LLMProvider } from './types';
import { GeminiAdapter } from './adapters/gemini-adapter';
import { GPTAdapter } from './adapters/gpt-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';
import { DeepSeekAdapter } from './adapters/deepseek-adapter';
import { KimiAdapter } from './adapters/kimi-adapter';
import { FallbackAdapter } from './adapters/fallback-adapter';
import { createClient } from '@supabase/supabase-js';

export type ProviderType = 'gemini' | 'gpt' | 'qwen' | 'deepseek' | 'kimi';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wthkddeleylijmonclxg.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0aGtkZGVsZXlsaWptb25jbHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NzUxMzIsImV4cCI6MjA4MzA1MTEzMn0.ooFYAgZtOh4PXRAKsEWDrXaNpWy3aikmX_Grl4kQavU';

const getSupabaseClient = (token?: string) => {
  if (supabaseServiceKey) {
    return createClient(supabaseUrl, supabaseServiceKey);
  }
  if (token) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  }
  return null;
};

export async function getLLMProviderWithUserKey(
  userId?: string,
  type?: string,
  forcedApiKey?: string,
  token?: string
): Promise<LLMProvider> {
  const providerType = (type || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const providers: LLMProvider[] = [];

  // 1. HIGH PRIORITY: User-defined forced key
  if (forcedApiKey) {
    providers.push(getLLMProvider(providerType, forcedApiKey));
  }

  // 2. USER PROFILE PRIORITY: Key stored in user's profile
  if (userId) {
    const supabase = getSupabaseClient(token);
    if (supabase) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('ai_provider, ai_api_key')
          .eq('id', userId)
          .single();

        if (profile?.ai_api_key) {
           providers.push(getLLMProvider(profile.ai_provider || 'gemini', profile.ai_api_key));
        }
      } catch (err) {
        console.error('[Orchestrator] Profile key fetch error:', err);
      }
    }
  }

  // 3. INFRASTRUCTURE PRIORITY: Environment Variables
  if (process.env.GOOGLE_API_KEY) providers.push(getLLMProvider('gemini', process.env.GOOGLE_API_KEY));
  if (process.env.OPENAI_API_KEY) providers.push(getLLMProvider('gpt', process.env.OPENAI_API_KEY));
  if (process.env.DEEPSEEK_API_KEY) providers.push(getLLMProvider('deepseek', process.env.DEEPSEEK_API_KEY));
  if (process.env.EMERGENCY_GOOGLE_API_KEY) providers.push(getLLMProvider('gemini', process.env.EMERGENCY_GOOGLE_API_KEY));

  // 4. SYSTEM FALLBACK: ai_api_keys table
  const supabase = getSupabaseClient(token);
  if (supabase) {
    try {
      const { data } = await supabase
        .from('ai_api_keys')
        .select('provider, api_key')
        .is('user_id', null)
        .eq('is_active', true);

      if (data && data.length > 0) {
        data.forEach(k => providers.push(getLLMProvider(k.provider, k.api_key)));
      }
    } catch (err) {
      // Ignore if table doesn't exist or RLS prevents access
    }
  }

  if (providers.length === 0) {
    return getLLMProvider(providerType);
  }

  return new FallbackAdapter(providers);
}

export function getLLMProvider(type?: string, apiKey?: string): LLMProvider {
  const providerType = (type || process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  switch (providerType) {
    case 'gpt':
      return new GPTAdapter(apiKey || '', process.env.OPENAI_MODEL || 'gpt-4o');
    case 'qwen':
      return new QwenAdapter(apiKey || '', process.env.QWEN_MODEL || 'qwen-turbo');
    case 'deepseek':
      return new DeepSeekAdapter(apiKey || '', process.env.DEEPSEEK_MODEL || 'deepseek-chat');
    case 'kimi':
      return new KimiAdapter(apiKey || '', process.env.KIMI_MODEL || 'moonshot-v1-8k');
    case 'gemini':
    default:
      return new GeminiAdapter(apiKey || '', process.env.GEMINI_MODEL || 'gemini-2.0-flash');
  }
}
