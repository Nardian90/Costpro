import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getLLMProviderWithUserKey } from '@/lib/ai/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const { messages, aiProvider, aiApiKey, storeId } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages vacío' }, { status: 400 });
    }

    try {
      // Usar la lógica centralizada de orquestación (maneja fallbacks y claves de usuario)
      const provider = await getLLMProviderWithUserKey(session.user.id, aiProvider, aiApiKey);

      const response = await provider.getResponse(messages, {
        temperature: 0.7,
        maxTokens: 1500
      });

      if (!response?.text) {
        throw new Error('La IA no devolvió ninguna respuesta');
      }

      return NextResponse.json({
        text: response.text,
        metadata: {
          provider: response.metadata?.model || aiProvider || 'gemini',
          actions: response.tool_calls ? [] : undefined // BotContext actions handling is done in botService usually
        },
        timestamp: new Date().toISOString()
      });

    } catch (aiError: any) {
      console.error('[BotChat] AI Error:', aiError.message);

      // Mapear errores específicos para el frontend
      const errorMsg = aiError.message;
      const isQuota = errorMsg.includes('Límite de IA alcanzado') ||
                      errorMsg.includes('cuota') ||
                      errorMsg.includes('quota');

      return NextResponse.json({
        error: isQuota ? 'Límite de IA alcanzado' : 'Error de comunicación con la IA',
        details: errorMsg
      }, { status: 502 });
    }

  } catch (error: any) {
    console.error('[BotChat] Global Error:', error);
    return NextResponse.json({
      error: 'Error interno',
      details: error.message
    }, { status: 500 });
  }
}
