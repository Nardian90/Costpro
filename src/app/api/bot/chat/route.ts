/**
 * /api/bot/chat — Vercel AI SDK implementation.
 */
import { botChatSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { createServerClient } from '@/lib/supabaseClient';
import { buildSystemPrompt } from '@/lib/ai/prompts/system-prompt-builder';
import { logger } from '@/lib/logger';
import { getModel, resolvePreferredProvider, type AIProviderName } from '@/lib/ai/vercel-provider';
import { buildTools } from '@/lib/ai/tools';
import { streamText, type CoreMessage } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createApiError } from '@/lib/api-errors';

async function botChatHandler(req: NextRequest) {
  try {
    if (!validateOrigin(req)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    const session = await getServerSession(req);
    if (!session?.user) return NextResponse.json(createApiError('UNAUTHORIZED'), { status: 401 });

    const clientId = session.user.id || req.headers.get('x-forwarded-for') || 'anon';
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json(createApiError('INVALID_JSON'), { status: 400 });
    }

    const parsed = botChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }

    const { messages, storeId, context: botContext, model: modelOverride, temperature } = parsed.data;

    let userRole = 'user';
    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (adminUrl && adminKey) {
      const adminClient = createClient(adminUrl, adminKey);
      const { data: profile } = await adminClient.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile) userRole = (profile as any).role || 'user';
    }

    const currentView = (botContext?.currentView as string) || undefined;
    const uiMode = (botContext?.uiMode as string) || undefined;
    const userName = session.user ? ((session.user as any).name || session.user.email || 'Usuario') : 'Usuario';
    const effectiveStoreId = storeId || '';

    const supabaseClient = createServerClient();
    const systemPrompt = await buildSystemPrompt({
      userName,
      userRole,
      currentView,
      storeId: effectiveStoreId,
      uiMode,
      supabase: supabaseClient,
    });

    const coreMessages: CoreMessage[] = (messages || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
      .map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content || '',
      })) as any;

    const tools = buildTools({
      supabase: supabaseClient,
      userId: session.user.id,
      userRole,
      storeId: effectiveStoreId,
    });

    const preferred = resolvePreferredProvider(modelOverride);
    const model = getModel(modelOverride, preferred);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: coreMessages,
      tools: tools as any,
      maxSteps: 5,
      temperature: temperature ?? 0.4,
    });

    const encoder = new TextEncoder();
    const allActions: any[] = [];

    const transformedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'text-delta': {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: part.textDelta })}\n\n`));
                break;
              }
              case 'tool-call': {
                allActions.push({ type: 'tool_call', name: part.toolName, args: part.args });
                break;
              }
              case 'tool-result': {
                const lastAction = allActions[allActions.length - 1];
                if (lastAction && lastAction.name === part.toolName) {
                  lastAction.result = part.result;
                }
                break;
              }
              case 'error': {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(part.error) })}\n\n`));
                break;
              }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ metadata: { provider: preferred, actions: allActions }, done: true })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.close();
        }
      },
    });

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
}

export const POST = withTracing(botChatHandler, 'POST /api/bot/chat');
