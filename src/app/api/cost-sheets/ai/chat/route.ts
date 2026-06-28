import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { aiChatSchema, zodError } from '@/validation/api-schemas';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * MIGRATED to Vercel AI SDK (FIX-DEBT: removed dependency on deprecated orchestrator.ts).
 *
 * This route generates cost sheet proposals using AI. It supports user-provided
 * API keys (BYOK) and falls back to server-default GLM/Gemini.
 *
 * The old implementation used `getLLMProviderWithUserKey` from the deprecated
 * orchestrator.ts. Now it uses `generateText` from the `ai` package with
 * provider-specific clients (Google Gemini, OpenAI-compatible for GLM).
 */

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
    const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'claude', 'gpt', 'gemini', 'glm', 'zai'];
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

    const systemPrompt = `Eres Darian, experto en Costpro y regulaciones de Cuba (Res. 148/2023).
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

    CONTEXTO ACTUAL: ${JSON.stringify(sanitizedSheetData)}`;

    try {
      // FIX-DEBT: Resolve model using Vercel AI SDK providers.
      // Priority: user-provided key → server default (GLM internal → Gemini public)
      const providerLower = (aiProvider || '').toLowerCase();
      const isGemini = providerLower.includes('gemini') || providerLower.includes('google');
      const isGLM = providerLower.includes('glm') || providerLower.includes('zai') || providerLower.includes('openai');

      let model;
      let usedProvider = 'glm';

      if (isGemini) {
        // User-provided Gemini key or server default
        const apiKey = aiApiKey || process.env.GOOGLE_API_KEY;
        if (!apiKey) throw new Error('No Gemini API key available');
        const gemini = createGoogleGenerativeAI({ apiKey });
        model = gemini('gemini-2.5-flash');
        usedProvider = 'gemini';
      } else {
        // GLM (default) — uses z.ai internal API via env vars
        const apiKey = aiApiKey || process.env.ZAI_API_KEY;
        const baseURL = process.env.ZAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
        if (!apiKey) throw new Error('No GLM API key available');
        const glm = createOpenAICompatible({
          name: 'glm',
          baseURL,
          apiKey,
        });
        model = glm('glm-4.5-air');
        usedProvider = 'glm';
      }

      // Convert messages to CoreMessage format
      const coreMessages = messages.map(m => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: coreMessages,
        temperature: 0.1,
      });

      if (!result.text) {
        throw new Error('La IA no devolvió ninguna respuesta');
      }

      logger.info('AI', 'COST_SHEET_AI_RESPONSE', {
        userId: session.user.id,
        provider: usedProvider,
        tokens: result.usage?.totalTokens,
      });

      return NextResponse.json({ text: result.text });
    } catch (aiError: unknown) {
      const msg = aiError instanceof Error ? aiError.message : String(aiError);
      logger.error('AI', 'COST_SHEET_AI_ERROR', { message: msg });
      return NextResponse.json({
        error: 'Error de comunicación con la IA'
      }, { status: 502 });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('AI', 'COST_SHEET_AI_GLOBAL_ERROR', { message: msg });
    return NextResponse.json({
      error: 'Error interno en Darian AI'
    }, { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(aiChatHandler as any) as any,
  'POST /api/cost-sheets/ai/chat'
);
