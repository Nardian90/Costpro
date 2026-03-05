import { NextRequest, NextResponse } from 'next/server';
import { botService } from '@/services/bot-service';
import { getServerSession } from '@/lib/auth';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { getLLMProviderWithUserKey } from '@/lib/ai/orchestrator';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado. Debes iniciar sesión.' }, { status: 401 });
    }

    const body = await req.json();
    const { messages, storeId, aiProvider, aiApiKey } = body;

    if (!messages || !Array.isArray(messages) || !storeId) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (messages, storeId)' }, { status: 400 });
    }

    const authSupabase = getSupabaseAuthClient(session.token);

    try {
      // Fetch provider with user key if available
      const provider = await getLLMProviderWithUserKey(session.user.id, aiProvider, aiApiKey);

      const response = await botService.handleChat(
        authSupabase,
        session.user.id,
        storeId,
        messages,
        provider
      );
      return NextResponse.json(response);
    } catch (botError: any) {
      console.error('[BotAPI] Logic Error:', botError);
      return NextResponse.json({
        error: botError.message || 'Error al procesar la respuesta de Darian',
        details: botError.message
      }, { status: 502 });
    }
  } catch (error: any) {
    console.error('[BotAPI] Route Error:', error);
    return NextResponse.json({
      error: 'Error de conexión con el bot',
      details: error.message
    }, { status: 500 });
  }
}
