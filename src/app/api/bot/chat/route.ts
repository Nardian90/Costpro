import { NextRequest, NextResponse } from 'next/server';
import { botService } from '@/services/bot-service';
import { getServerSession } from '@/lib/auth';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate and verify session
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado. Debes iniciar sesión.' }, { status: 401 });
    }

    const body = await req.json();
    const { messages, storeId, aiProvider, aiApiKey } = body;

    if (!messages || !Array.isArray(messages) || !storeId) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (messages, storeId)' }, { status: 400 });
    }

    // 2. Use authenticated client to enforce RLS
    const authSupabase = getSupabaseAuthClient(session.token);

    // 3. Process chat with restricted context
    const response = await botService.handleChat(
      authSupabase,
      session.user.id,
      storeId,
      messages,
      aiProvider,
      aiApiKey
    );
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[BotAPI] Critical Error:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    return NextResponse.json({
      error: 'Error interno del Bot',
      details: error.message
    }, { status: 500 });
  }
}
