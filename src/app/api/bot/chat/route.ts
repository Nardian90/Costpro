import { botChatSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { executeTool } from '@/lib/ai/tools/registry';
import { TOOLS } from '@/lib/ai/tools/definitions';
import { createServerClient } from '@/lib/supabaseClient';
import { buildSystemPrompt } from '@/lib/ai/prompts/system-prompt-builder';
import { logger } from '@/lib/logger';
import { callAI, callAIStream, type AIMessage, type AIProviderName } from '@/lib/ai/provider';
import { createClient } from '@supabase/supabase-js';
import { createApiError } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'model';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  imageData?: {
    mimeType: string;
    data: string;
  } | null;
}

// ─── AGENT LOOP (Handles reasoning and tools) ───────────────────────────────
const MAX_TOOL_ITERATIONS = 3;

/**
 * Converts ChatMessage[] to AIMessage[] for the provider,
 * preserving imageData on the last user message.
 */
function toAIMessages(chatMessages: ChatMessage[]): AIMessage[] {
  return chatMessages.map((m, i) => {
    const isLast = i === chatMessages.length - 1;
    return {
      role: m.role as any,
      content: m.content,
      ...(isLast && m.imageData ? { imageData: m.imageData } : {}),
    };
  });
}

async function runAgentLoop(
  initialMessages: ChatMessage[],
  options: { temperature?: number; model?: string; systemPrompt?: string; stream?: boolean },
  toolContext: { supabase: any; userId: string; userRole: string; storeId: string },
  signal?: AbortSignal
): Promise<{ text: string; actions: any[]; provider: string }> {
  let messages = [...initialMessages];
  const allActions: any[] = [];
  let lastProvider: AIProviderName = 'glm';

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const aiMessages = toAIMessages(messages);

    // Use streaming for the first iteration (user sees real-time output),
    // non-streaming for tool iterations (we need the full response to parse tools)
    if (iteration === 0 && options.stream) {
      // Streaming is handled directly by the route — agent loop returns early
      // and the route pipes the stream. Tool iterations only happen if the AI
      // explicitly requests tool calls, which we detect post-stream.
      // For simplicity, we use streaming only for the final output.
      const result = await callAI(aiMessages, options.systemPrompt || '', {
        model: options.model,
        temperature: options.temperature,
      });
      lastProvider = result.provider;
      return { text: result.text, actions: allActions, provider: lastProvider };
    }

    const result = await callAI(aiMessages, options.systemPrompt || '', {
      model: options.model,
      temperature: options.temperature,
    });
    lastProvider = result.provider;

    const text = result.text;

    // Check if the AI wants to call a tool
    // Tool calls are detected by parsing structured JSON in the response
    const toolCalls = parseToolCalls(text);

    if (toolCalls.length === 0) {
      // No tools requested — return the text as-is
      return { text: text.replace(/\[TOOL_RESULT\][\s\S]*$/, '').trim(), actions: allActions, provider: lastProvider };
    }

    // Execute each tool call
    for (const toolCall of toolCalls) {
      logger.info('AI', 'AGENT_TOOL_EXEC', { iteration: iteration + 1, tool: toolCall.name, args: toolCall.args });
      const toolResult = await executeTool(toolCall.name, toolCall.args, toolContext);

      allActions.push({
        type: 'tool_call',
        name: toolCall.name,
        args: toolCall.args,
        result: toolResult,
      });

      // Append tool call and result to messages for the next iteration
      messages.push({
        role: 'assistant',
        content: JSON.stringify({ tool_call: toolCall }),
      });
      messages.push({
        role: 'tool',
        name: toolCall.name,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return { text: 'Procesé la solicitud con múltiples herramientas.', actions: allActions, provider: lastProvider };
}

/**
 * Parse structured tool calls from AI response text.
 * Supports format: ```json\n{ "tool": "name", "args": {...} }\n```
 * Or: [TOOL_CALL] {"tool": "name", "args": {...}}
 */
function parseToolCalls(text: string): Array<{ name: string; args: any }> {
  const calls: Array<{ name: string; args: any }> = [];

  // Pattern 1: [TOOL_CALL] JSON
  const toolCallPattern = /\[TOOL_CALL\]\s*(\{[\s\S]*?\})/g;
  let match;
  while ((match = toolCallPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool && typeof parsed.tool === 'string') {
        calls.push({ name: parsed.tool, args: parsed.args || {} });
      }
    } catch { /* skip malformed JSON */ }
  }

  // Pattern 2: ```json blocks with tool field
  const jsonBlockPattern = /```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"[\s\S]*?\})\s*```/g;
  while ((match = jsonBlockPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool && typeof parsed.tool === 'string') {
        // Avoid duplicates
        if (!calls.some(c => c.name === parsed.tool && JSON.stringify(c.args) === JSON.stringify(parsed.args || {}))) {
          calls.push({ name: parsed.tool, args: parsed.args || {} });
        }
      }
    } catch { /* skip malformed JSON */ }
  }

  return calls;
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
async function botChatHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session?.user) {
      return NextResponse.json(createApiError('UNAUTHORIZED'), { status: 401 });
    }

    // FIX-AUDIT-5: CSRF validation on mutation route
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const clientId = session.user?.id || req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json(createApiError('INVALID_JSON'), { status: 400 });
    }

    const parsed = botChatSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn('VALIDATION', 'BOTCHAT_ZOD_FAILED', {
        errors: parsed.error.issues.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        receivedFields: Object.keys(body ?? {}),
      });
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }

    const { messages, storeId, context: botContext } = parsed.data;

    // FIX-SEC-H5: Fetch user memberships for store validation
    let userMemberships: any[] = [];
    let userRole = 'user';
    try {
      const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (adminUrl && adminKey) {
        const adminClient = createClient(adminUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
        // FIX-BOTCHAT-FK: Specify the FK explicitly because there are 2 relationships
        // between profiles and user_store_memberships (profiles_memberships_fkey and
        // user_store_memberships_user_id_fkey) and PostgREST refuses to pick one.
        // Without this hint, the query silently fails and userRole stays as 'user'.
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

    // FIX-SEC-H5: Validate that storeId matches user's active memberships
    if (storeId) {
      const isAdmin = userRole === 'admin';
      const hasStoreAccess = isAdmin || userMemberships.some(
        (m: any) => m.store_id === storeId && m.status === 'active'
      );
      if (!hasStoreAccess) {
        return NextResponse.json(
          createApiError('FORBIDDEN'),
          { status: 403 }
        );
      }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(createApiError('EMPTY_MESSAGES'), { status: 400 });
    }

    try {
      const currentView = (botContext?.currentView as string) || undefined;
      const uiMode = (botContext?.uiMode as string) || undefined;
      // Use Zod-parsed values instead of raw body to avoid validation bypass
      const temperature = parsed.data.temperature ?? 0.4;
      const model = parsed.data.model || undefined;
      const useStream = parsed.data.stream !== false;

      const supabaseClient = createServerClient();
      const systemPrompt = await buildSystemPrompt({
        userName: session?.user ? ((session.user as any).name || session.user.email || 'Usuario') : 'Usuario',
        userRole: session?.user ? ((session.user as any).role || 'user') : 'user',
        currentView,
        storeId: storeId || '',
        uiMode,
        supabase: supabaseClient,
      });

      const chatMessages: ChatMessage[] = messages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
        .map((m: any) => ({
          role: m.role,
          content: m.content || '',
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name,
          imageData: m.imageData || null,
        }));

      // FIX-SEC-BOTCHAT: Use the already-resolved userRole from profile fetch (L190-208),
      // not a re-declaration from the un-enriched session (which would shadow the correct value)
      const userId = session.user?.id || 'anonymous';
      const toolContext = { supabase: supabaseClient, userId, userRole, storeId: storeId || '' };

      // ── Streaming response ──
      if (useStream) {
        try {
          const aiMessages = toAIMessages(chatMessages);
          const { stream, provider, model: usedModel } = await callAIStream(aiMessages, systemPrompt, {
            model,
            temperature,
          });

          // Stream tokens to client in real-time while collecting text for tool detection
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          const transformedStream = new ReadableStream({
            async start(controller) {
              try {
                const reader = stream.getReader();
                let fullText = '';

                // Phase 1: Stream tokens in real-time + collect text for tool detection
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  // Immediately forward to client (real-time streaming)
                  controller.enqueue(value);

                  // Extract text from chunk for tool-call detection
                  const chunkText = decoder.decode(value, { stream: true });
                  const lines = chunkText.split('\n');
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') continue;
                    try {
                      const parsed = JSON.parse(payload);
                      if (parsed.text) fullText += parsed.text;
                    } catch { /* skip */ }
                  }
                }

                // Phase 2: Check for tool calls in the full response
                const toolCalls = parseToolCalls(fullText);
                const allActions: any[] = [];

                if (toolCalls.length > 0) {
                  // Execute tools and send follow-up
                  let followMessages = [...chatMessages, { role: 'assistant' as const, content: fullText }];

                  for (const toolCall of toolCalls) {
                    logger.info('AI', 'BOTCHAT_STREAMING_TOOL_EXEC', { tool: toolCall.name });
                    const toolResult = await executeTool(toolCall.name, toolCall.args, toolContext);
                    allActions.push({ type: 'tool_call', name: toolCall.name, args: toolCall.args, result: toolResult });

                    followMessages.push({ role: 'assistant' as const, content: JSON.stringify({ tool_call: toolCall }) });
                    followMessages.push({ role: 'tool' as const, name: toolCall.name, content: JSON.stringify(toolResult) });
                  }

                  // Get AI follow-up after tool execution
                  const followAIMessages = toAIMessages(followMessages);
                  const followResult = await callAI(followAIMessages, systemPrompt, { model, temperature });

                  if (followResult.text) {
                    // Stream the follow-up text as a continuation
                    const followChunk = JSON.stringify({ text: '\n\n' + followResult.text });
                    controller.enqueue(encoder.encode(`data: ${followChunk}\n\n`));
                  }
                }

                // Send final metadata
                const metaChunk = JSON.stringify({
                  metadata: {
                    provider,
                    model: usedModel,
                    actions: allActions,
                  },
                  done: true,
                });
                controller.enqueue(encoder.encode(`data: ${metaChunk}\n\n`));
                controller.close();
              } catch (err) {
                controller.error(err);
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
        } catch (streamError: any) {
          // If streaming fails, fall back to non-streaming
          logger.warn('AI', 'BOTCHAT_STREAMING_FALLBACK', { error: streamError.message });
        }
      }

      // ── Non-streaming fallback ──
      const aiOptions = { temperature, model, systemPrompt, stream: false };
      const result = await runAgentLoop(chatMessages, aiOptions, toolContext);

      if (!result.text) {
        throw new Error('La IA no devolvió ninguna respuesta');
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          try {
            const textChunk = JSON.stringify({
              text: result.text,
              provider: result.provider,
            });
            controller.enqueue(encoder.encode(`data: ${textChunk}\n\n`));

            const metaChunk = JSON.stringify({
              metadata: {
                provider: result.provider,
                actions: result.actions ?? [],
              },
              done: true,
            });
            controller.enqueue(encoder.encode(`data: ${metaChunk}\n\n`));

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });

    } catch (aiError: any) {
      const message = aiError instanceof Error ? aiError.message : 'Error en el servicio AI';
      logger.error('AI', 'BOTCHAT_CALLAI_FAILED', { message });
      return NextResponse.json(
        createApiError('AI_UNAVAILABLE'),
        { status: 503 }
      );
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('AI', 'BOTCHAT_GLOBAL_ERROR', { message: msg, stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      createApiError('INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

export const POST = withTracing(botChatHandler, 'POST /api/bot/chat');
