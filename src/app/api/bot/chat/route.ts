import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getLLMProviderWithUserKey } from '@/lib/ai/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

    const { messages, aiProvider, aiApiKey } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages vacío' }, { status: 400 });
    }

    try {
      // Usar el orquestador central que maneja:
      // 1. Clave proporcionada por el usuario (aiApiKey)
      // 2. Claves del usuario en Supabase (ai_api_keys)
      // 3. Claves del sistema globales en DB
      // 4. Claves de variables de entorno (GOOGLE_API_KEY, etc)
      // Tambien maneja el fallback automático entre ellas.
      const provider = await getLLMProviderWithUserKey(session.user.id, aiProvider, aiApiKey);

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
      console.error('[ChatBot API] Error del proveedor:', error.message);
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
