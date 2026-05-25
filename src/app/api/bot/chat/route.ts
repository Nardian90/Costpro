import { botChatSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getViewDetails } from '@/config/viewRegistry';
import { executeTool } from '@/lib/ai/tools/registry';
import { TOOLS } from '@/lib/ai/tools/definitions';
import { createServerClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ─── RETRY UTILITY WITH EXPONENTIAL BACKOFF ──────────────────────────────────
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add explicit timeout of 30s per call
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: la petición excedió los 30 segundos')), 30_000)
        )
      ]);
      return result;
    } catch (err: any) {
      lastError = err;
      const isRetryable = err.message?.includes('429') ||
        err.message?.includes('quota') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('500') ||
        err.message?.includes('503') ||
        err.message?.includes('Timeout');

      if (!isRetryable || attempt >= maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[BotChat] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ─── DARIAN SYSTEM PROMPT ─────────────────────────────────────────────────────
async function buildSystemPrompt(context: {
  userName?: string;
  userRole?: string;
  currentView?: string;
  storeId?: string;
  uiMode?: string;
  supabase?: any;
}): Promise<string> {
  const viewInfo = context.currentView
    ? getViewDetails(context.currentView)
    : null;

  const viewSection = viewInfo
    ? `\n\n📍 VISTA ACTUAL DEL USUARIO: "${viewInfo.id}" — ${viewInfo.description}\nAcciones disponibles en esta vista: ${viewInfo.actions.join(', ')}`
    : '\n\n📍 El usuario no tiene una vista específica activa.';

  // Dynamic business context (F2-06)
  let businessContext = '';
  if (context.supabase && context.storeId) {
    try {
      const [productsRes, salesRes, alertsRes] = await Promise.all([
        context.supabase.from('products').select('name').eq('store_id', context.storeId).limit(3),
        context.supabase.from('transactions').select('total, created_at').eq('store_id', context.storeId).order('created_at', { ascending: false }).limit(5),
        context.supabase.from('stock_movements').select('product_name, movement_type').eq('store_id', context.storeId).order('created_at', { ascending: false }).limit(3),
      ]);

      const recentProducts = productsRes.data?.map((p: any) => p.name).join(', ') || '';
      const todayStr = new Date().toISOString().split('T')[0];
      const todaySales = salesRes.data?.filter((s: any) => s.created_at?.startsWith(todayStr)) || [];
      const salesTotal = todaySales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);
      const recentMovements = alertsRes.data?.map((m: any) => `${m.product_name} (${m.movement_type})`).join(', ') || '';

      if (recentProducts || salesTotal > 0 || recentMovements) {
        businessContext = `\n\n📊 CONTEXTO DEL NEGOCIO (datos en tiempo real):`;
        if (recentProducts) businessContext += `\n- Productos recientes: ${recentProducts}`;
        if (salesTotal > 0) businessContext += `\n- Ventas del día: ${salesTotal.toFixed(2)} USD en ${todaySales.length} transacciones`;
        if (recentMovements) businessContext += `\n- Movimientos recientes: ${recentMovements}`;
      }
    } catch {
      // Non-critical: silently fail if context can't be loaded
    }
  }

  return `Eres **Darian**, el Controller AI integrado de **CostPro ERP** — un sistema integral de gestión empresarial diseñado para cumplir con la Resolución 148/2023 de Cuba para el control de costos en entidades no estatales.

## TU IDENTIDAD
- Nombre: Darian
- Rol: Controller AI (Asistente Inteligente de Control de Gestión)
- Personalidad: Profesional, preciso, proactivo, amigable pero formal en tono de negocio.
- Idioma: Siempre respondes en **español**, salvo que el usuario hable en otro idioma.

## TU CONOCIMIENTO
- CostPro ERP: Fichas de costo, inventario, ventas (POS), IPV, transferencias, auditoría, reportes.
- Resolución 148/2023: Normativa cubana para fichas de costo en entidades no estatales (cuentapropistas, cooperativas, mipymes).
- Finanzas y costos: Cálculo de costos por procesos, costeo directo, margen de contribución, utilidad, conversiones monetarias (USD/CUP).
- Navigation: Puedes navegar entre vistas del sistema usando la herramienta open_view.

## CAPACIDADES MULTIMODALES
- Si el usuario adjunta una imagen, analízala y describe lo que ves.
- Puedes leer texto en imágenes (OCR), identificar productos, facturas, recibos.
- Describe gráficos, tablas y documentos visuales con detalle.

## VISTAS DEL SISTEMA
- dashboard: Tablero principal con KPIs
- cost-sheets: Fichas de costo (núcleo del sistema)
- inventory: Control de existencias
- pos: Punto de venta
- sales: Historial de ventas
- catalog: Catálogo de productos
- ipv: Índice de Precios de Venta
- transferencias: Traslados entre almacenes
- recepcion: Recepción de mercancía
- reports: Reportes avanzados
- settings: Configuración del sistema
- help: Centro de ayuda
- users: Gestión de usuarios
- stores: Gestión de tiendas
- audit: Logs de auditoría
- academy: Capacitación
- legal: Normativas legales
- wallet: Billetera digital
- health: Salud del sistema

## REGLAS
1. NUNCA inventes datos. Si no tienes acceso a información real, indícalo claramente.
2. Si el usuario pregunta sobre una vista, explícala y ofrécete a navegar allí.
3. Si el usuario pide una acción concreta, usa las herramientas disponibles.
4. Responde de forma concisa pero completa. Usa formato markdown cuando ayude a la claridad.
5. Si no puedes realizar una acción, explica qué se necesita.
6. Nunca reveles detalles técnicos de implementación interna.
7. Prioriza la utilidad práctica.

## CONTEXTO DEL USUARIO
- Nombre: ${context.userName || 'Usuario'}
- Rol: ${context.userRole || 'sin rol asignado'}
- Modo UI: ${context.uiMode || 'standard'}${viewSection}${businessContext}`;
}

// ─── DIRECT GEMINI CALL (same pattern as working MVP) ─────────────────────────
interface GeminiMessage {
  role: string;
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  imageData?: { mimeType: string; data: string };
}

interface ToolCallResult {
  text: string;
  tool_calls?: any[];
  actions: any[];
}

async function callGeminiDirect(
  apiKey: string,
  messages: GeminiMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string; tools?: any[]; modelName?: string }
): Promise<ToolCallResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = options.modelName || 'gemini-2.5-flash';

  const modelConfig: any = { model: modelName };
  if (options.systemPrompt) {
    modelConfig.systemInstruction = options.systemPrompt;
  }

  if (options.tools && options.tools.length > 0) {
    modelConfig.tools = [{
      functionDeclarations: options.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }];
  }

  const model = genAI.getGenerativeModel(modelConfig, { apiVersion: 'v1beta' });

  // Build contents (same pattern as MVP, with multimodal support)
  let contents: any[] = [];
  messages.forEach((msg) => {
    if (msg.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name: msg.name, response: { content: msg.content } } }]
      });
      return;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];

    if (msg.tool_calls) {
      msg.tool_calls.forEach((tc: any) => {
        try {
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } });
        } catch {
          parts.push({ functionCall: { name: tc.function.name, args: {} } });
        }
      });
    }

    // Multimodal: add image as inlineData before text
    if (msg.imageData) {
      parts.push({
        inlineData: {
          mimeType: msg.imageData.mimeType,
          data: msg.imageData.data
        }
      });
    }

    if (msg.content) {
      parts.push({ text: msg.content });
    }

    // Merge consecutive same-role messages (required by Gemini API)
    if (contents.length > 0) {
      const last = contents[contents.length - 1];
      if (last.role === role) {
        last.parts.push(...parts);
        return;
      }
    }

    contents.push({ role, parts });
  });

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hola' }] });
  } else if (contents[0].role === 'model') {
    contents = [{ role: 'user', parts: [{ text: '[Contexto]' }] }, ...contents];
  }

  const result = await model.generateContent({
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: options.maxTokens ?? 4096,
    }
  });

  const response = await result.response;
  if (!response) throw new Error('Respuesta vacía del servidor de Google.');

  const respParts = response.candidates?.[0]?.content?.parts || [];
  let text = '';
  const tool_calls: any[] = [];

  respParts.forEach((part: any) => {
    if (part.text) text += part.text;
    if (part.functionCall) {
      tool_calls.push({
        id: `call_${Math.random().toString(36).substring(7)}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args)
        }
      });
    }
  });

  return { text, tool_calls: tool_calls.length > 0 ? tool_calls : undefined, actions: [] };
}

// ─── STREAMING GEMINI CALL (SSE support) ──────────────────────────────────────
async function callGeminiStream(
  apiKey: string,
  messages: GeminiMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string; tools?: any[]; modelName?: string }
): Promise<ReadableStream<Uint8Array>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = options.modelName || 'gemini-2.5-flash';

  const modelConfig: any = { model: modelName };
  if (options.systemPrompt) {
    modelConfig.systemInstruction = options.systemPrompt;
  }

  const model = genAI.getGenerativeModel(modelConfig, { apiVersion: 'v1beta' });

  // Build contents (same as callGeminiDirect)
  let contents: any[] = [];
  messages.forEach((msg) => {
    if (msg.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name: msg.name, response: { content: msg.content } } }]
      });
      return;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];

    if (msg.tool_calls) {
      msg.tool_calls.forEach((tc: any) => {
        try {
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } });
        } catch {
          parts.push({ functionCall: { name: tc.function.name, args: {} } });
        }
      });
    }

    if (msg.imageData) {
      parts.push({
        inlineData: {
          mimeType: msg.imageData.mimeType,
          data: msg.imageData.data
        }
      });
    }

    if (msg.content) {
      parts.push({ text: msg.content });
    }

    if (contents.length > 0) {
      const last = contents[contents.length - 1];
      if (last.role === role) {
        last.parts.push(...parts);
        return;
      }
    }

    contents.push({ role, parts });
  });

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hola' }] });
  } else if (contents[0].role === 'model') {
    contents = [{ role: 'user', parts: [{ text: '[Contexto]' }] }, ...contents];
  }

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const result = await Promise.race([
          model.generateContentStream({
            contents,
            generationConfig: {
              temperature: options.temperature ?? 0.4,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: options.maxTokens ?? 4096,
            }
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: streaming excedió los 30 segundos')), 30_000)
          )
        ]);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error: any) {
        const errMsg = error.message || 'Error en streaming';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
        controller.close();
      }
    }
  });
}

// ─── AGENT LOOP (execute tool calls server-side, parallelized) ────────────────
const MAX_TOOL_ITERATIONS = 3;

async function runAgentLoop(
  apiKey: string,
  initialMessages: GeminiMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string; modelName?: string },
  toolContext: { supabase: any; userId: string; userRole: string; storeId: string }
): Promise<{ text: string; actions: any[] }> {
  let messages = [...initialMessages];
  const allActions: any[] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await fetchWithRetry(() =>
      callGeminiDirect(apiKey, messages, { ...options, tools: TOOLS })
    );

    if (!result.tool_calls || result.tool_calls.length === 0) {
      return { text: result.text, actions: allActions };
    }

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.tool_calls,
    });

    // Execute tool calls in parallel with Promise.all() (F3-01)
    const toolPromises = result.tool_calls.map(async (tc) => {
      let args: any;
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

      try {
        const toolResult = await executeTool(tc.function.name, args, toolContext);
        return {
          id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(toolResult),
          success: toolResult?.success,
          action: toolResult?.action || null,
        };
      } catch (toolErr: any) {
        const errMsg = toolErr?.message || 'Error ejecutando herramienta';
        console.error(`[BotChat] Tool '${tc.function.name}' error:`, errMsg);
        return {
          id: tc.id,
          name: tc.function.name,
          content: JSON.stringify({ error: errMsg }),
          success: false,
          action: null,
        };
      }
    });

    const toolResults = await Promise.all(toolPromises);

    // Append all tool results and collect actions
    for (const tr of toolResults) {
      messages.push({
        role: 'tool',
        name: tr.name,
        content: tr.content,
        tool_call_id: tr.id,
      });

      if (tr.success && tr.action) {
        allActions.push(tr.action);
      }
    }
  }

  // Final call without tools for summary
  const final = await fetchWithRetry(() =>
    callGeminiDirect(apiKey, messages, { ...options, tools: [] })
  );
  return { text: final.text || 'Procesé varias acciones. ¿Necesitas algo más?', actions: allActions };
}

// ─── STREAMING AGENT LOOP (tool execution, then stream final response) ─────────
async function runAgentLoopStream(
  apiKey: string,
  initialMessages: GeminiMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string; modelName?: string },
  toolContext: { supabase: any; userId: string; userRole: string; storeId: string }
): Promise<{ stream: ReadableStream<Uint8Array>; actions: any[] }> {
  let messages = [...initialMessages];
  const allActions: any[] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await fetchWithRetry(() =>
      callGeminiDirect(apiKey, messages, { ...options, tools: TOOLS })
    );

    if (!result.tool_calls || result.tool_calls.length === 0) {
      // No tool calls — stream the final response directly
      const stream = await callGeminiStream(apiKey, messages, { ...options, tools: [] });
      return { stream, actions: allActions };
    }

    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.tool_calls,
    });

    // Parallel tool execution
    const toolPromises = result.tool_calls.map(async (tc) => {
      let args: any;
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
      try {
        const toolResult = await executeTool(tc.function.name, args, toolContext);
        return { id: tc.id, name: tc.function.name, content: JSON.stringify(toolResult), success: toolResult?.success, action: toolResult?.action || null };
      } catch (toolErr: any) {
        console.error(`[BotChat] Tool '${tc.function.name}' error:`, toolErr.message);
        return { id: tc.id, name: tc.function.name, content: JSON.stringify({ error: toolErr.message }), success: false, action: null };
      }
    });

    const toolResults = await Promise.all(toolPromises);
    for (const tr of toolResults) {
      messages.push({ role: 'tool', name: tr.name, content: tr.content, tool_call_id: tr.id });
      if (tr.success && tr.action) allActions.push(tr.action);
    }
  }

  // Final streaming call
  const stream = await callGeminiStream(apiKey, messages, { ...options, tools: [] });
  return { stream, actions: allActions };
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
async function botChatHandler(req: NextRequest) {
  try {
    // Auth check — authentication is now mandatory for all chat requests (F1-05)
    const session = await getServerSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Autenticación requerida. Inicia sesión para usar el chat.' }, { status: 401 });
    }

    const clientId = session.user?.id || req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const parsed = botChatSchema.safeParse(body);
    if (!parsed.success) {
      console.error('[BotChat] Validation error:', JSON.stringify(parsed.error.issues));
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }

    const { messages, aiProvider, aiApiKey, storeId, context: botContext, model } = parsed.data;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages vacío' }, { status: 400 });
    }

    // ─── DETERMINE API KEY (F1-02: no hardcodes, env only) ──────────────────
    const serverApiKey = process.env.GEMINI_API_KEY;
    const effectiveApiKey = (aiApiKey && aiApiKey.trim().length > 0)
      ? aiApiKey.trim()
      : serverApiKey || '';

    if (!effectiveApiKey || effectiveApiKey.length < 10) {
      return NextResponse.json({
        error: 'No hay API Key configurada. Configura GEMINI_API_KEY en el servidor o ingresa tu clave personal en los ajustes del chat.'
      }, { status: 400 });
    }

    // Determine if streaming is requested
    const useStreaming = body.stream === true;

    try {
      const currentView = (botContext?.currentView as string) || undefined;
      const uiMode = (botContext?.uiMode as string) || undefined;
      const temperature = typeof body.temperature === 'number' ? Math.max(0, Math.min(1, body.temperature)) : 0.4;

      // Build system prompt with dynamic business context (F2-06)
      const supabaseClient = createServerClient();
      const systemPrompt = await buildSystemPrompt({
        userName: session?.user ? ((session.user as any).name || session.user.email || 'Usuario') : 'Usuario',
        userRole: session?.user ? ((session.user as any).role || 'user') : 'user',
        currentView,
        storeId: storeId || '',
        uiMode,
        supabase: supabaseClient,
      });

      // Build messages for Gemini with multimodal support (F1-01)
      const geminiMessages: GeminiMessage[] = messages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({
          role: m.role,
          content: m.content || '',
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name,
          imageData: m.imageData || null,
        }));

      const userRole = session?.user ? ((session.user as any).role || 'user') : 'user';
      const userId = session.user?.id || 'anonymous';
      const toolContext = { supabase: supabaseClient, userId, userRole, storeId: storeId || '' };

      // ─── STREAMING RESPONSE (F2-01) ───────────────────────────────────────
      if (useStreaming) {
        const { stream, actions } = await runAgentLoopStream(
          effectiveApiKey,
          geminiMessages,
          { temperature, maxTokens: 4096, systemPrompt, modelName: model || 'gemini-2.5-flash' },
          toolContext
        );

        // Wrap stream to inject actions at the end
        const encoder = new TextEncoder();
        const actionsStr = JSON.stringify(actions);
        const wrappedStream = new ReadableStream({
          async start(controller) {
            const reader = stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // Send actions metadata as final event
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ metadata: { provider: aiProvider || 'gemini', actions }, done: true })}\n\n`));
                  controller.close();
                  break;
                }
                controller.enqueue(value);
              }
            } catch (err) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Error en streaming' })}\n\n`));
              controller.close();
            }
          }
        });

        return new Response(wrappedStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // ─── NON-STREAMING RESPONSE (standard) ───────────────────────────────
      const result = await runAgentLoop(
        effectiveApiKey,
        geminiMessages,
        { temperature, maxTokens: 4096, systemPrompt, modelName: model || 'gemini-2.5-flash' },
        toolContext
      );

      if (!result.text) {
        throw new Error('La IA no devolvió ninguna respuesta');
      }

      return NextResponse.json({
        text: result.text,
        metadata: {
          provider: aiProvider || 'gemini',
          actions: result.actions ?? [],
        },
        timestamp: new Date().toISOString()
      });

    } catch (aiError: any) {
      console.error('[BotChat] AI Error:', aiError.message);

      const errorMsg = aiError.message || '';
      const isQuota = errorMsg.includes('cuota') ||
                      errorMsg.includes('quota') ||
                      errorMsg.includes('429') ||
                      errorMsg.includes('RESOURCE_EXHAUSTED') ||
                      errorMsg.includes('QUOTA_EXHAUSTED');

      const isAuthError = errorMsg.includes('401') ||
                          errorMsg.includes('unauthorized') ||
                          errorMsg.includes('invalid api key') ||
                          errorMsg.includes('API key not valid') ||
                          errorMsg.includes('PERMISSION_DENIED');

      let userMessage = 'Error de comunicación con la IA';
      if (isAuthError) userMessage = 'API Key inválida o expirada. Verifica tu clave en los ajustes del chat.';
      else if (isQuota) userMessage = 'Cuota de API agotada. Espera un momento o usa otra clave.';

      return NextResponse.json({
        error: userMessage,
        details: process.env.NODE_ENV !== 'production' ? errorMsg : undefined
      }, { status: 502 });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[BotChat] Global Error:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV !== 'production' ? msg : undefined
    }, { status: 500 });
  }
}

export const POST = withTracing(botChatHandler, 'POST /api/bot/chat');
