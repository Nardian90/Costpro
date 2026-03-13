import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getLLMProviderWithUserKey } from '@/lib/ai/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    const userId = session?.user?.id;
    const token = session?.token;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const { messages, aiProvider, aiApiKey } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages vacío' }, { status: 400 });
    }

    try {
      // Orquestador central con prioridad y paso de token
      const provider = await getLLMProviderWithUserKey(userId, aiProvider, aiApiKey, token);

      const response = await provider.getResponse(messages, {
        temperature: 0.7,
        maxTokens: 1000
      });

      if (!response?.text || typeof response.text !== 'string') {
        throw new Error('La IA devolvió una respuesta vacía');
      }

      return NextResponse.json({
        text: response.text,
        metadata: response.metadata || { provider: aiProvider || 'default' },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('[ChatBot API] Error:', error.message);

      if (error.message.includes('No se ha configurado la API Key')) {
          return NextResponse.json({
            error: 'Configuración requerida',
            details: 'No se encontraron claves de API. Por favor, configura tu propia API Key en los ajustes del chat.'
          }, { status: 401 });
      }

      return NextResponse.json({
        error: 'Error de comunicación con la IA',
        details: error.message
      }, { status: 502 });
    }

  } catch (error: any) {
    console.error('[ChatBot API] ERROR GLOBAL:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}
