import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminSafe as getAdminClientSync } from '@/lib/supabase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { Message, LLMProvider, BotContext } from '@/lib/ai/types';
import { TOOLS } from '@/lib/ai/tools/definitions';
import { executeTool } from '@/lib/ai/tools/registry';
import { VIEW_REGISTRY } from '@/config/viewRegistry';
import { AI_FORM_SCHEMAS } from '@/validation/forms/ai-form-schemas';

let cachedKnowledge: string | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

async function getKnowledgeBaseContext(): Promise<string> {
  const now = Date.now();
  if (cachedKnowledge && (now - lastCacheTime < CACHE_TTL)) {
    return cachedKnowledge;
  }

  const dirPath = path.join(/*turbopackIgnore: true*/process.cwd(), 'docs/knowledge/resolutions');
  if (!fs.existsSync(dirPath)) return '';

  try {
    const files = fs.readdirSync(dirPath);
    let knowledge = '';
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.txt')) {
        const fileContent = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        knowledge += `\n[DOC: ${file}]\n${fileContent}\n`;
      }
    }
    cachedKnowledge = knowledge;
    lastCacheTime = now;
    return knowledge;
  } catch (err) {
    console.error('Error reading knowledge base:', err);
    return '';
  }
}

function isLegalQuery(messages: Message[]): boolean {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const legalKeywords = ['resolución', 'ley', 'normativa', 'legal', 'artículo', 'regulación', 'sc-3-01', 'modelo'];
  return legalKeywords.some(keyword => lastMessage.includes(keyword));
}

function isLightQuery(messages: Message[]): boolean {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const lightKeywords = ['hola', 'buenos días', 'buenas tardes', 'quien eres', 'qué puedes hacer', 'gracias', 'chau', 'adios'];
  // If it's very short and contains light keywords, or is just a greeting
  return lastMessage.length < 50 && lightKeywords.some(k => lastMessage.includes(k));
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
    const maxHistory = 10;
    const historyToProcess = messages.length > maxHistory
      ? messages.slice(-maxHistory)
      : messages;

    const totalLength = historyToProcess.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    if (totalLength > 10000) {
      throw new Error("El mensaje es demasiado largo para ser procesado.");
    }

    if (!historyToProcess || historyToProcess.length === 0) {
      return { text: 'Hola! ¿En qué puedo ayudarte hoy?', metadata: { model: 'default' } };
    }

    const lightQuery = isLightQuery(historyToProcess);

    // Optimization: Only load Knowledge Base if the query seems relevant
    let knowledgeBase = '';
    if (!lightQuery && isLegalQuery(historyToProcess)) {
      knowledgeBase = await getKnowledgeBaseContext();
    }

    // FIX-RAG (2026-07-14): usar RAG de knowledge/help/ para recuperar docs relevantes
    let ragContext = '';
    if (!lightQuery) {
      try {
        const { buildRagContext } = await import('@/lib/ai/rag/knowledge-rag');
        ragContext = buildRagContext(historyToProcess.map(m => ({ role: m.role, content: m.content || '' })));
      } catch (e) {
        console.warn('[bot-service] RAG no disponible:', e);
      }
    }

    // Compact context representation - Only include full context if NOT a light query
    const viewsContext = lightQuery
      ? "Responde de forma breve y amable."
      : VIEW_REGISTRY.map(v => `${v.id}:${v.description.substring(0, 60)}`).join('|');

    const formsContext = lightQuery ? "" : JSON.stringify(AI_FORM_SCHEMAS);

    const systemPrompt: Message = {
      role: 'system',
      content: `Darian AI. Tienda:${storeId}. Rol:${userRole}.
Vista Actual: ${botContext?.currentView || 'unknown'}.
${lightQuery ? '' : 'Vistas:' + viewsContext + '\nForms:' + formsContext}
${knowledgeBase ? 'KB:' + knowledgeBase : ''}
${ragContext}
Reglas: ${lightQuery ? 'Eres un asistente amable. No uses tools para saludos.' : 'Actúa siempre con tools si es posible. Solo Tienda:' + storeId + '. Solo ejecuta run_system_health_check si el usuario lo pide explícitamente y está en la vista salud.'}
${lightQuery ? '' : `\n## 🧭 Navegación: Si el usuario pregunta CÓMO hacer algo, explícalo y OFRECE navegar usando open_view. ViewIds: pos, sales, cash, inventory, catalog, cost-sheets, reception_list, accounts_payable, cash_report, workers, transferencias, purchase-orders, reports, settings, occ.`}`
    };

    let provider: LLMProvider;
    if (typeof aiProviderOrInstance === 'object' && aiProviderOrInstance !== null && 'getResponse' in aiProviderOrInstance) {
      provider = aiProviderOrInstance as LLMProvider;
    } else {
      provider = getLLMProvider(aiProviderOrInstance as string, aiApiKey);
    }

    let currentMessages = [systemPrompt, ...historyToProcess];
    let finalResponse;
    let iterations = 0;
    const MAX_ITERATIONS = lightQuery ? 1 : 5;
    const actions: any[] = [];
    const correlationId = crypto.randomUUID();
    const toolLogs: any[] = [];

    while (iterations < MAX_ITERATIONS) {
      // Mandatory delay between iterations to respect RPM limits (especially Gemini free)
      if (iterations > 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const MAX_RETRIES = 3;
      let retryCount = 0;
      let response: any;
      while (retryCount < MAX_RETRIES) {
        try {
          response = await provider.getResponse(currentMessages, {
            tools: lightQuery ? [] : TOOLS,
            maxTokens: iterations < MAX_ITERATIONS - 1 ? 800 : 2000
          });
          break;
        } catch (err: any) {
          const msg = err.message.toLowerCase();
          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('limit');
          retryCount++;
          if (retryCount >= MAX_RETRIES) throw err;
          const delay = isQuota ? 3000 * retryCount : 1000 * retryCount;
          await new Promise(resolve => setTimeout(resolve, delay));
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
          /* BUG-05 FIX */ (() => {
            try { return JSON.parse(toolCall.function.arguments); }
            catch (e) {
              console.error('[BotService] JSON.parse failed:', e, toolCall.function.arguments);
              return {};
            }
          })(),
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
      await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
        user_id: userId,
        action: 'AI_CONTROLLER_QUERY',
        table_name: 'bot_interactions',
        store_id: storeId,
        metadata: {
          iterations,
          last_query: historyToProcess[historyToProcess.length - 1].content.substring(0, 100),
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
