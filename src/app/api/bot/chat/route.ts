import { botChatSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getLLMProviderWithUserKey } from '@/lib/ai/orchestrator';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function botChatHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const clientId = req.headers.get('x-forwarded-for') || session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const parsed = botChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { messages, aiProvider, aiApiKey, storeId } = parsed.data;

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
          // FIX-BUG-LOG-009: Use nullish coalescing so actions is always an array (undefined gets stripped by JSON.stringify)
          actions: response.tool_calls ?? []
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
        // FIX-SEC-021: Hide AI error details in production
        details: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? errorMsg : undefined
      }, { status: 502 });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[BotChat] Global Error:', error);
    return NextResponse.json({
      error: 'Error interno',
      details: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? msg : 'Error interno del servidor'
    }, { status: 500 });
  }
}

export const POST = withTracing(botChatHandler, 'POST /api/bot/chat');
