import { NextRequest, NextResponse } from 'next/server';
import { getLLMProviderWithUserKey } from '@/lib/ai/orchestrator';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { aiChatSchema, zodError } from '@/validation/api-schemas';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';

export const runtime = "nodejs";
export const maxDuration = 60;

// FIX-SEC-AICHAT: Use withAuth for membership-enriched session + rate limit by user ID
async function aiChatHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // FIX-AUDIT-12: CSRF validation on cost sheet AI mutation
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    // Rate limit by authenticated user ID (not IP — prevents bypass via header rotation)
    const clientId = session.user.id;
    const { allowed, remaining, resetAt } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 10 });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        },
      });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: 'JSON inválido en la solicitud' }, { status: 400 });
    }

    const parsed = aiChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { messages, sheetData, aiProvider, aiApiKey } = parsed.data;

    // Security: Validate AI provider against whitelist
    const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'claude', 'gpt', 'gemini'];
    if (aiProvider && !VALID_PROVIDERS.some(p => aiProvider.toLowerCase().includes(p))) {
      return NextResponse.json({ error: 'Proveedor de IA no soportado' }, { status: 400 });
    }

    // Security: Validate API key format (alphanumeric + special chars, min 20 chars)
    if (aiApiKey && !/^[a-zA-Z0-9_\-]{20,}$/.test(aiApiKey)) {
      return NextResponse.json({ error: 'Clave de API inválida' }, { status: 400 });
    }

    // Sanitize sheetData to avoid sending too much data to the LLM
    const sanitizedSheetData = sheetData ? {
      header: (sheetData as any).header,
      sectionsCount: (sheetData as any).sections?.length || 0,
      annexesCount: (sheetData as any).annexes?.length || 0,
      summary: (sheetData as any).summary
    } : null;

    const systemPrompt = {
      role: 'system' as const,
      content: `Eres Darian, experto en Costpro y regulaciones de Cuba (Res. 148/2023).
      Tu misión es generar propuestas de fichas de costo profesionales.

      CRÍTICO (FORMATO):
      1. SÉ BREVE en la parte de texto.
      2. MÁXIMO 5 ITEMS por anexo para evitar saturación.
      3. FORMATO: Usa exclusivamente el bloque \`\`\`json_annex_update.
      4. IDs DE ANEXO: Usa estrictamente "I", "II", "III", "IV", "V".
      5. CLASIFICACIONES POR ANEXO:
         - Anexo I: "1.1.1" (Materiales)
         - Anexo II: "2.1.1" (Salarios)
         - Anexo III: "3.1.1" (Depreciación)
         - Anexo IV: "3.2" (Otros gastos directos)
         - Anexo V: "3.7" (Dietas)
      6. CLAVES DE ITEMS:
         - Anexo I: { "description", "um", "consumption_norm", "price", "total", "classification": "1.1.1" }
         - Anexo II: { "description", "time_norm", "hourly_rate", "worker_count", "total", "classification": "2.1.1" }
         - Anexo IV: { "description", "amount", "classification": "3.2" }

      Regla: Siempre incluye "He preparado una propuesta técnica detallada. Puedes revisarla y aplicarla abajo." al final.

      CONTEXTO ACTUAL: ${JSON.stringify(sanitizedSheetData)}`
    };

    try {
      // Use user-specific key if available
      const provider = await getLLMProviderWithUserKey(session.user.id, aiProvider, aiApiKey);
      const response = await provider.getResponse([systemPrompt, ...messages], { temperature: 0.1 });

      if (!response || !response.text) {
        throw new Error('La IA no devolvió ninguna respuesta');
      }

      return NextResponse.json({ text: response.text });
    } catch (aiError: unknown) {
      console.error('[AIChat] LLM Error:', aiError);
      return NextResponse.json({
        error: 'Error de comunicación con la IA'
      }, { status: 502 });
    }

  } catch (error: unknown) {
    console.error('[AIChat] Global Error:', error);
    return NextResponse.json({
      error: 'Error interno en Darian AI'
    }, { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(aiChatHandler as any) as any,
  'POST /api/cost-sheets/ai/chat'
);
