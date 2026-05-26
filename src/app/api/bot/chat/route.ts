import { botChatSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { getViewDetails } from '@/config/viewRegistry';
import { executeTool } from '@/lib/ai/tools/registry';
import { TOOLS } from '@/lib/ai/tools/definitions';
import { createServerClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ─── Z-AI SDK CLIENT (bypasses geo-restrictions) ────────────────────────────
let _zaiClient: any = null;

async function getZaiClient() {
  if (!_zaiClient) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    _zaiClient = await ZAI.create();
  }
  return _zaiClient;
}

// ─── RETRY UTILITY WITH EXPONENTIAL BACKOFF ──────────────────────────────────
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
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

// ─── MESSAGE TYPES ───────────────────────────────────────────────────────────
interface ChatMessage {
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

// ─── Z-AI SDK DIRECT CALL (OpenAI-compatible, bypasses geo-block) ───────────
async function callAI(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string; tools?: any[] }
): Promise<ToolCallResult> {
  const zai = await getZaiClient();

  // Build OpenAI-compatible messages
  const apiMessages: any[] = [];
  if (options.systemPrompt) {
    apiMessages.push({ role: 'system', content: options.systemPrompt });
  }

  // Handle multimodal: extract images and add as separate messages or inline
  for (const msg of messages) {
    if (msg.role === 'tool') {
      apiMessages.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content,
      });
      continue;
    }

    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const parts: any[] = [];

    // If message has tool_calls (from assistant)
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      apiMessages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      });
      continue;
    }

    // Multimodal support: image + text
    if (msg.imageData) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${msg.imageData.mimeType};base64,${msg.imageData.data}` }
      });
    }

    if (msg.content) {
      parts.push({ type: 'text', text: msg.content });
    }

    apiMessages.push({
      role,
      content: parts.length === 1 && parts[0].type === 'text'
        ? msg.content
        : parts.length > 0 ? parts : msg.content,
    });
  }

  if (apiMessages.length === 0) {
    apiMessages.push({ role: 'user', content: 'Hola' });
  }

  const reqBody: any = {
    messages: apiMessages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 4096,
  };

  const completion = await zai.chat.completions.create(reqBody);
  const choice = completion.choices?.[0];
  const text = choice?.message?.content || '';
  const tool_calls = choice?.message?.tool_calls || undefined;

  return { text, tool_calls: tool_calls?.length ? tool_calls : undefined, actions: [] };
}

// ─── Z-AI SDK STREAMING CALL (SSE) ──────────────────────────────────────────
async function callAIStream(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string; tools?: any[] }
): Promise<ReadableStream<Uint8Array>> {
  const zai = await getZaiClient();

  const apiMessages: any[] = [];
  if (options.systemPrompt) {
    apiMessages.push({ role: 'system', content: options.systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      apiMessages.push({ role: 'tool', tool_call_id: msg.tool_call_id, content: msg.content });
      continue;
    }
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      apiMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
      continue;
    }
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const parts: any[] = [];
    if (msg.imageData) {
      parts.push({ type: 'image_url', image_url: { url: `data:${msg.imageData.mimeType};base64,${msg.imageData.data}` } });
    }
    if (msg.content) {
      parts.push({ type: 'text', text: msg.content });
    }
    apiMessages.push({
      role,
      content: parts.length === 1 && parts[0].type === 'text'
        ? msg.content
        : parts.length > 0 ? parts : msg.content,
    });
  }

  if (apiMessages.length === 0) {
    apiMessages.push({ role: 'user', content: 'Hola' });
  }

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Use non-streaming as fallback since streaming via SDK may vary
        const completion = await Promise.race([
          zai.chat.completions.create({
            messages: apiMessages,
            temperature: options.temperature ?? 0.4,
            max_tokens: options.maxTokens ?? 4096,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: streaming excedió los 30 segundos')), 30_000)
          )
        ]);

        const text = completion.choices?.[0]?.message?.content || '';
        // Send as single chunk
        if (text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
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
  initialMessages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string },
  toolContext: { supabase: any; userId: string; userRole: string; storeId: string }
): Promise<{ text: string; actions: any[] }> {
  let messages = [...initialMessages];
  const allActions: any[] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await fetchWithRetry(() =>
      callAI(messages, { ...options, tools: TOOLS })
    );

    if (!result.tool_calls || result.tool_calls.length === 0) {
      return { text: result.text, actions: allActions };
    }

    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.tool_calls,
    });

    // Execute tool calls in parallel (F3-01)
    const toolPromises = result.tool_calls.map(async (tc) => {
      let args: any;
      try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch { args = {}; }

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
        console.error(`[BotChat] Tool '${tc.function.name}' error:`, toolErr.message);
        return {
          id: tc.id,
          name: tc.function.name,
          content: JSON.stringify({ error: toolErr.message }),
          success: false,
          action: null,
        };
      }
    });

    const toolResults = await Promise.all(toolPromises);

    for (const tr of toolResults) {
      messages.push({
        role: 'tool',
        name: tr.name,
        content: tr.content,
        tool_call_id: tr.id,
      });
      if (tr.success && tr.action) allActions.push(tr.action);
    }
  }

  const final = await fetchWithRetry(() =>
    callAI(messages, { ...options, tools: [] })
  );
  return { text: final.text || 'Procesé varias acciones. ¿Necesitas algo más?', actions: allActions };
}

// ─── STREAMING AGENT LOOP ────────────────────────────────────────────────────
async function runAgentLoopStream(
  initialMessages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; systemPrompt?: string },
  toolContext: { supabase: any; userId: string; userRole: string; storeId: string }
): Promise<{ stream: ReadableStream<Uint8Array>; actions: any[] }> {
  let messages = [...initialMessages];
  const allActions: any[] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await fetchWithRetry(() =>
      callAI(messages, { ...options, tools: TOOLS })
    );

    if (!result.tool_calls || result.tool_calls.length === 0) {
      const stream = await callAIStream(messages, { ...options, tools: [] });
      return { stream, actions: allActions };
    }

    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.tool_calls,
    });

    const toolPromises = result.tool_calls.map(async (tc) => {
      let args: any;
      try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch { args = {}; }
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

  const stream = await callAIStream(messages, { ...options, tools: [] });
  return { stream, actions: allActions };
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
async function botChatHandler(req: NextRequest) {
  try {
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

    const { messages, aiProvider, storeId, context: botContext } = parsed.data;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages vacío' }, { status: 400 });
    }

    const useStreaming = body.stream === true;

    try {
      const currentView = (botContext?.currentView as string) || undefined;
      const uiMode = (botContext?.uiMode as string) || undefined;
      const temperature = typeof body.temperature === 'number' ? Math.max(0, Math.min(1, body.temperature)) : 0.4;

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

      const aiOptions = { temperature, maxTokens: 4096, systemPrompt };

      if (useStreaming) {
        const { stream, actions } = await runAgentLoopStream(chatMessages, aiOptions, toolContext);

        const encoder = new TextEncoder();
        const wrappedStream = new ReadableStream({
          async start(controller) {
            const reader = stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ metadata: { provider: aiProvider || 'z-ai', actions }, done: true })}\n\n`));
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

      // Non-streaming
      const result = await runAgentLoop(chatMessages, aiOptions, toolContext);

      if (!result.text) {
        throw new Error('La IA no devolvió ninguna respuesta');
      }

      return NextResponse.json({
        text: result.text,
        metadata: {
          provider: aiProvider || 'z-ai',
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
                      errorMsg.includes('RESOURCE_EXHAUSTED');

      const isAuthError = errorMsg.includes('401') ||
                          errorMsg.includes('unauthorized') ||
                          errorMsg.includes('invalid api key');

      let userMessage = 'Error de comunicación con la IA';
      if (isAuthError) userMessage = 'API Key inválida o expirada.';
      else if (isQuota) userMessage = 'Cuota de API agotada. Espera un momento.';

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
