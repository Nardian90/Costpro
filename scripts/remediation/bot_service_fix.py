import sys

file_path = 'src/services/bot-service.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if 'async function getKnowledgeBaseContext(): Promise<string>' in line and 'let cachedKnowledge' not in lines[0]:
         # We already have the new version at the top but the old one might still be there due to failed regex
         pass

    # Clean up the duplicate/broken parts
    if ' ---\\n${content}\\n`;' in line:
        skip = False
        continue
    if skip:
        continue

    new_lines.append(line)

# Let's just rewrite the file with a clean version of what I want
clean_content = """import { SupabaseClient } from '@supabase/supabase-js';
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

  const dirPath = path.join(process.cwd(), 'docs/knowledge/resolutions');
  if (!fs.existsSync(dirPath)) return '';

  try {
    const files = fs.readdirSync(dirPath);
    let knowledge = '';
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.txt')) {
        const fileContent = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        knowledge += `\\n[DOC: ${file}]\\n${fileContent}\\n`;
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
    // Limit message history to save tokens
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

    const knowledgeBase = await getKnowledgeBaseContext();
    // Compact context representation to save tokens
    const viewsContext = VIEW_REGISTRY.map(v => `${v.id}:${v.description.substring(0, 100)}`).join('|');
    const formsContext = JSON.stringify(AI_FORM_SCHEMAS);

    const systemPrompt: Message = {
      role: 'system',
      content: `Darian AI. Tienda ${storeId}.
      Vistas: ${viewsContext}
      Forms: ${formsContext}
      KB: ${knowledgeBase || 'N/A'}`
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
          response = await provider.getResponse(currentMessages, {
            tools: TOOLS,
            maxTokens: iterations < MAX_ITERATIONS - 1 ? 800 : 2000 // Optimized token limit
          });
          break;
        } catch (err: any) {
          const msg = err.message.toLowerCase();
          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('limit');
          retryCount++;
          if (retryCount >= MAX_RETRIES) throw err;
          const delay = isQuota ? 2000 * retryCount : 1000 * retryCount;
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
"""

with open(file_path, 'w') as f:
    f.write(clean_content)
