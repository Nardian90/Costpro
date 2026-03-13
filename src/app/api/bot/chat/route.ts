import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { DeepSeekAdapter } from '@/lib/ai/adapters/deepseek-adapter';
import { GeminiAdapter } from '@/lib/ai/adapters/gemini-adapter';
import { GPTAdapter } from '@/lib/ai/adapters/gpt-adapter';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      console.error('[Chat API] No session found');
      return NextResponse.json({ error: 'No autorizado - Sesión no encontrada' }, { status: 401 });
    }
    console.log('[Chat API] User authenticated:', session.user.id, session.user.email);

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const { messages, history, aiProvider, aiApiKey } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages vacío' }, { status: 400 });
    }

    const providers: Array<{ name: string; instance: any; source: string }> = [];

    // PRIMERO: Usuario
    if (aiProvider && aiApiKey) {
      const userProvider = getProviderInstance(aiProvider, aiApiKey);
      if (userProvider) {
        providers.push({ name: aiProvider, instance: userProvider, source: 'Configuración de Usuario' });
      }
    }

    // SEGUNDO: DeepSeek
    if (process.env.DEEPSEEK_API_KEY) {
      providers.push({
        name: 'deepseek',
        instance: new DeepSeekAdapter(process.env.DEEPSEEK_API_KEY, 'deepseek-chat'),
        source: 'Sistema (Env)'
      });
    }

    // TERCERO: Gemini
    if (process.env.GOOGLE_API_KEY) {
      providers.push({
        name: 'gemini',
        instance: new GeminiAdapter(process.env.GOOGLE_API_KEY, 'gemini-1.5-flash'),
        source: 'Sistema (Env)'
      });
    }

    // CUARTO: GPT
    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'gpt',
        instance: new GPTAdapter(process.env.OPENAI_API_KEY, 'gpt-4o'),
        source: 'Sistema (Env)'
      });
    }

    if (providers.length === 0) {
      return NextResponse.json({
        error: 'No hay proveedores configurados'
      }, { status: 502 });
    }

    let lastError: Error | null = null;

    for (let i = 0; i < providers.length; i++) {
      const { name, instance, source } = providers[i];

      try {
        console.log(`[Chat] Intento ${i + 1}/${providers.length}: ${name} (${source})`);

        const response = await instance.getResponse(messages, {
          history,
          temperature: 0.7,
          maxTokens: 1000
        });

        if (!response?.text || typeof response.text !== 'string') {
          throw new Error('Respuesta vacía');
        }

        console.log(`[Chat] ✅ Éxito con ${name}`);
        return NextResponse.json({
          text: response.text,
          metadata: {
            ...response.metadata,
            provider: name,
            keySource: source
          },
          timestamp: new Date().toISOString()
        });

      } catch (error: any) {
        lastError = error;
        console.log(`[Chat] ❌ ${name} falló: ${error.message.substring(0, 80)}`);
        continue;
      }
    }

    console.error('[Chat] ❌ Todos fallaron:', lastError?.message);
    return NextResponse.json({
      error: 'Todos los proveedores fallaron',
      details: lastError?.message
    }, { status: 502 });

  } catch (error: any) {
    console.error('[Chat] ERROR:', error);
    return NextResponse.json({
      error: 'Error interno',
      details: error.message
    }, { status: 500 });
  }
}

function getProviderInstance(type: string, apiKey: string): any | null {
  if (!apiKey) return null;
  const providerType = (type || '').toLowerCase();
  switch (providerType) {
    case 'deepseek':
      return new DeepSeekAdapter(apiKey, 'deepseek-chat');
    case 'gemini':
      return new GeminiAdapter(apiKey, 'gemini-2.5-flash-preview-09-2025');
    case 'gpt':
      return new GPTAdapter(apiKey, 'gpt-4o');
    default:
      return null;
  }
}
