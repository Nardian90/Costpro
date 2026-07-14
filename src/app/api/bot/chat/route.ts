/**
 * /api/bot/chat — Vercel AI SDK implementation.
 *
 * Migrated from the hand-rolled agent loop to streamText() + tool().
 * Benefits:
 *   - Native function-calling via the LLM's tool API (no more text parsing)
 *   - Built-in multi-step reasoning via maxSteps
 *   - Strongly-typed tool schemas via Zod
 *   - Automatic streaming via toDataStreamResponse() / custom SSE transform
 *
 * Output format (preserved for ChatBot.tsx backwards compatibility):
 *   data: {"text":"..."}\n\n          ← streaming text chunks
 *   data: {"metadata":{"actions":[...]}}\n\n  ← tool calls executed
 *   data: {"done":true}\n\n            ← final marker
 *   data: [DONE]\n\n                   ← terminal marker
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
import { streamText, type ModelMessage, stepCountIs } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createApiError } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function botChatHandler(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const session = await getServerSession(req);
    if (!session?.user) {
      return NextResponse.json(createApiError('UNAUTHORIZED'), { status: 401 });
    }

    // ── CSRF ──────────────────────────────────────────────────────────────
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    // ── Rate limit ────────────────────────────────────────────────────────
    const clientId = session.user?.id || req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    // ── Body + Zod ──────────────────────────────────────────────────────────
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json(createApiError('INVALID_JSON'), { status: 400 });
    }

    const parsed = botChatSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn('VALIDATION', 'BOTCHAT_ZOD_FAILED', {
        errors: parsed.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
        receivedFields: Object.keys(body ?? {}),
      });
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }

    const { messages, storeId, context: botContext, model: modelOverride, temperature } = parsed.data;

    // ── Fetch user profile + memberships (RBAC for store access) ────────────
    let userMemberships: any[] = [];
    let userRole = 'user';
    try {
      const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (adminUrl && adminKey) {
        const adminClient = createClient(adminUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
        // FIX-BOTCHAT-FK: specify FK explicitly (2 FKs exist between profiles and user_store_memberships)
        const { data: profile, error: profileErr } = await adminClient
          .from('profiles')
          .select('role, memberships:user_store_memberships!profiles_memberships_fkey(store_id,role,status)')
          .eq('id', session.user.id)
          .single();
        if (profileErr) {
          logger.warn('DATABASE', 'BOTCHAT_PROFILE_QUERY_ERROR', { error: profileErr.message, userId: session.user.id });
        }
        if (profile) {
          userRole = (profile as any).role || 'user';
          userMemberships = ((profile as any).memberships || []).filter((m: any) => m.status === 'active');
        }
      }
    } catch (profileErr: any) {
      logger.warn('DATABASE', 'BOTCHAT_MEMBERSHIPS_FETCH_FAILED', { error: profileErr?.message || String(profileErr) });
    }

    // ── Store access validation ─────────────────────────────────────────────
    if (storeId) {
      const isAdmin = userRole === 'admin';
      const hasStoreAccess = isAdmin || userMemberships.some(
        (m: any) => m.store_id === storeId && m.status === 'active'
      );
      if (!hasStoreAccess) {
        return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
      }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(createApiError('EMPTY_MESSAGES'), { status: 400 });
    }

    // ── Build context for tools + prompt ─────────────────────────────────────
    const currentView = (botContext?.currentView as string) || undefined;
    const uiMode = (botContext?.uiMode as string) || undefined;
    const userName = session.user ? ((session.user as any).name || session.user.email || 'Usuario') : 'Usuario';
    const effectiveStoreId = storeId || '';

    const supabaseClient = createServerClient();
    // FIX-RAG (2026-07-14): pasar messages para que buildRagContext recupere docs relevantes
    const systemPrompt = await buildSystemPrompt({
      userName,
      userRole,
      currentView,
      storeId: effectiveStoreId,
      uiMode,
      supabase: supabaseClient,
      messages: messages.map(m => ({ role: m.role, content: m.content || '' })),
    });

    // ── Convert messages to ModelMessage[] for Vercel AI SDK ──────────────────
    // Filter to user/assistant/model only (system/tool handled separately)
    const coreMessages: ModelMessage[] = messages
      .filter((m: any) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
      .slice(-30) // Context window: last 30 messages max
      .map((m: any) => {
        const role: 'user' | 'assistant' = (m.role === 'user') ? 'user' : 'assistant';
        // Handle vision messages with imageData
        if (m.imageData?.data && role === 'user') {
          return {
            role,
            content: [
              { type: 'text' as const, text: m.content || '' },
              {
                type: 'image' as const,
                image: m.imageData.data,
                mediaType: m.imageData.mimeType,
              },
            ],
          } satisfies ModelMessage;
        }
        return { role, content: m.content || '' } satisfies ModelMessage;
      });

    // ── Build tools (only those allowed for this role) ───────────────────────
    const tools = buildTools({
      supabase: supabaseClient,
      userId: session.user.id,
      userRole,
      storeId: effectiveStoreId,
    });

    // ── Resolve model with fallback ──────────────────────────────────────────
    const preferred: AIProviderName = resolvePreferredProvider(modelOverride);
    let model;
    try {
      model = getModel(modelOverride, preferred);
    } catch (modelErr: any) {
      logger.error('AI', 'BOTCHAT_MODEL_UNAVAILABLE', { error: modelErr.message, preferred });
      return NextResponse.json(createApiError('AI_UNAVAILABLE'), { status: 503 });
    }

    // ── Call streamText ──────────────────────────────────────────────────────
    logger.info('AI', 'BOTCHAT_REQUEST', {
      userId: session.user.id,
      provider: preferred,
      model: modelOverride || (preferred === 'gemini' ? 'gemini-default' : 'glm-default'),
      messageCount: coreMessages.length,
      storeId: effectiveStoreId,
      userRole,
    });

    const result = streamText({
      model,
      system: systemPrompt,
      messages: coreMessages,
      tools,
      stopWhen: stepCountIs(3), // Equivalent to MAX_TOOL_ITERATIONS = 3
      temperature: temperature ?? 0.4,
      onFinish: ({ usage, finishReason }) => {
        logger.info('AI', 'BOTCHAT_RESPONSE_DONE', {
          userId: session.user.id,
          finishReason,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        });
      },
      onError: ({ error }) => {
        logger.error('AI', 'BOTCHAT_STREAM_ERROR', {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    });

    // ── Transform to custom SSE format (ChatBot.tsx compatibility) ───────────
    // We use result.fullStream which emits typed parts (text-delta, tool-call,
    // tool-result, etc.) and reshape them into the { text } / { metadata } /
    // { done } format the frontend expects.
    const encoder = new TextEncoder();
    const allActions: any[] = [];

    const transformedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'text-delta': {
                const chunk = JSON.stringify({ text: part.text });
                controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                break;
              }
              case 'tool-call': {
                // Tool is being invoked — record it for metadata
                allActions.push({
                  type: 'tool_call',
                  name: part.toolName,
                  args: part.input,
                });
                logger.info('AI', 'BOTCHAT_TOOL_CALL', { tool: part.toolName });
                break;
              }
              case 'tool-result': {
                // Tool finished — append result to actions list
                const lastAction = allActions[allActions.length - 1];
                if (lastAction && lastAction.name === part.toolName) {
                  lastAction.result = part.output;
                  // FIX-RAG (2026-07-14): si el tool result contiene un action
                  // (ej: navigation), extraerlo y pusharlo plano para que
                  // ChatBot.tsx handlewitch(action.type) lo procese
                  const out = part.output as any;
                  if (out?.action) {
                    allActions.push(out.action);
                  }
                }
                break;
              }
              case 'error': {
                const chunk = JSON.stringify({
                  error: part.error instanceof Error ? part.error.message : String(part.error),
                });
                controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                logger.error('AI', 'BOTCHAT_PART_ERROR', {
                  error: part.error instanceof Error ? part.error.message : String(part.error),
                });
                break;
              }
              case 'finish-step':
              case 'finish':
                // Continue — final metadata emitted below
                break;
              default:
                // Ignore other part types (reasoning, source, etc.)
                break;
            }
          }

          // Emit final metadata with actions
          const metaChunk = JSON.stringify({
            metadata: {
              provider: preferred,
              actions: allActions,
            },
            done: true,
          });
          controller.enqueue(encoder.encode(`data: ${metaChunk}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err: any) {
          logger.error('AI', 'BOTCHAT_STREAM_FATAL', { message: err?.message || String(err) });
          try {
            const errChunk = JSON.stringify({
              error: 'Stream terminated unexpectedly',
            });
            controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch {
            controller.error(err);
          }
        }
      },
    });

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('AI', 'BOTCHAT_GLOBAL_ERROR', { message: msg, stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
}

export const POST = withTracing(botChatHandler, 'POST /api/bot/chat');
