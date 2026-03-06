import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { Message, LLMProvider, BotContext } from '@/lib/ai/types';
import { TOOLS } from '@/lib/ai/tools/definitions';
import { executeTool } from '@/lib/ai/tools/registry';
import { VIEW_REGISTRY } from '@/config/viewRegistry';
import { AI_FORM_SCHEMAS } from '@/validation/forms/ai-form-schemas';

async function getKnowledgeBaseContext(): Promise<string> {
  const dirPath = path.join(process.cwd(), 'docs/knowledge/resolutions');
  if (!fs.existsSync(dirPath)) return '';

  try {
    const files = fs.readdirSync(dirPath);
    let knowledge = '';
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.txt')) {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        knowledge += `\n--- DOCUMENTO: ${file} ---\n${content}\n`;
      }
    }
    return knowledge;
  } catch (err) {
    console.error('Error reading knowledge base:', err);
    return '';
  }
}

export const botService = {
  async handleChat(
    supabase: SupabaseClient,
    userId: string,
    userRole: string,
    storeId: string,
    messages: Message[],
    aiProviderOrInstance?: string | LLMProvider,
    aiApiKey?: string,
    botContext?: BotContext
  ) {
    const totalLength = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    if (totalLength > 10000) {
      throw new Error("El mensaje es demasiado largo para ser procesado.");
    }

    if (!messages || messages.length === 0) {
      return { text: 'Hola! ¿En qué puedo ayudarte hoy?', metadata: { model: 'default' } };
    }

    const knowledgeBase = await getKnowledgeBaseContext();
    const viewsContext = VIEW_REGISTRY.map(v => `- ${v.id}: ${v.description}`).join('\n');
    const formsContext = JSON.stringify(AI_FORM_SCHEMAS, null, 2);

    const systemPrompt: Message = {
      role: 'system',
      content: `Eres Darian, el AI Application Controller oficial del sistema. Tu propósito es ser la interfaz inteligente que controla toda la aplicación mediante lenguaje natural.

      CAPACIDADES:
      1. NAVEGACIÓN: Puedes abrir cualquier vista usando 'open_view'.
      2. ACCIONES: Puedes ejecutar acciones como crear fichas, exportar PDFs, etc.
      3. FORMULARIOS: Puedes completar formularios para el usuario.
      4. EXPLICACIÓN: Puedes explicar el funcionamiento de cada módulo.

      REGLAS DE ORO:
      1. Tu personalidad es profesional, técnica y ejecutiva.
      2. No solo respondas preguntas, ACTÚA. Si el usuario dice "Llévame a ventas", usa el tool 'open_view'.
      3. SEGURIDAD: Solo opera dentro de la Tienda ID: ${storeId}.
      4. CONTEXTO: Utiliza la información del contexto actual para tus decisiones.

      VISTAS DISPONIBLES:
      ${viewsContext}

      FORMULARIOS SOPORTADOS Y SUS ESQUEMAS:
      ${formsContext}

      CONTEXTO ACTUAL DEL SISTEMA:
      - Usuario: ${userId}
      - Tienda: ${storeId}
      - Vista Actual: ${botContext?.currentView || 'Desconocida'}
      - Registro Activo: ${botContext?.activeRecordId || 'Ninguno'}
      - Modo UI: ${botContext?.uiMode || 'standard'}

      BIBLIOTECA DE RESOLUCIONES:
      ${knowledgeBase || 'Sin documentos cargados.'}`
    };

    let provider: LLMProvider;
    if (typeof aiProviderOrInstance === 'object' && aiProviderOrInstance !== null && 'getResponse' in aiProviderOrInstance) {
      provider = aiProviderOrInstance as LLMProvider;
    } else {
      provider = getLLMProvider(aiProviderOrInstance as string, aiApiKey);
    }

    let currentMessages = [systemPrompt, ...messages];
    let finalResponse;
    let iterations = 0;
    const MAX_ITERATIONS = 5;
    const actions: any[] = [];
    const correlationId = crypto.randomUUID();
    const toolLogs: any[] = [];

    while (iterations < MAX_ITERATIONS) {
const MAX_RETRIES = 3;
    let retryCount = 0;
    let response: any;
    while (retryCount < MAX_RETRIES) {
      try {
        response = await provider.getResponse(currentMessages, { tools: TOOLS });
        break;
      } catch (err: any) {
        retryCount++;
        if (retryCount >= MAX_RETRIES) throw err;
        console.warn(`[BotService] LLM Error (attempt ${retryCount}):`, err.message);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
      }
    }

      if (!response || !response.tool_calls || response.tool_calls.length === 0) {
        finalResponse = {
          ...response,
          metadata: {
            ...response.metadata,
            actions: actions.length > 0 ? actions : undefined
          }
        };
        break;
      }

      currentMessages.push({
        role: 'assistant',
        content: response.text || '',
        tool_calls: response.tool_calls
      });

      for (const toolCall of response.tool_calls) {
        const startTime = Date.now();
        let status = 'success';
        let errorMessage = null;

        const result = await executeTool(
          toolCall.function.name,
          JSON.parse(toolCall.function.arguments),
          { supabase, userId, userRole, storeId }
        );

        if (result.error) {
          status = 'error';
          errorMessage = result.error;
        }

        toolLogs.push({
          tool_name: toolCall.function.name,
          parameters: toolCall.function.arguments,
          duration_ms: Date.now() - startTime,
          status,
          error_message: errorMessage,
          timestamp: new Date().toISOString()
        });

        if (result.action) {
          actions.push(result.action);
        }

        currentMessages.push({
          role: 'tool',
          name: toolCall.function.name,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      iterations++;
    }

    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'AI_CONTROLLER_QUERY',
        table_name: 'bot_interactions',
        store_id: storeId,
        metadata: {
          iterations,
          last_query: messages[messages.length - 1].content.substring(0, 100),
          provider: finalResponse?.metadata?.model,
          actions_count: actions.length,
          correlation_id: correlationId,
          tool_executions: toolLogs
        }
      });
    } catch (e) {
      console.error('Audit failed', e);
    }

    return finalResponse;
  }
};
