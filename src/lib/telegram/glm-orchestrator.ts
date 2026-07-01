/**
 * Telegram GLM Orchestrator — Fase T3
 *
 * Espejo de whatsapp/glm-orchestrator.ts con diffs mínimas:
 *   - Mismas funciones: generateResponse, saveMessage, validateContactBelongsToStore
 *   - Mismo fix WA-2: validateContactBelongsToStore antes de usar contact_id
 *   - Mismo fix WA-3: historial filtra por store_id + contact_id (no solo contact_id)
 *   - Diferencia: telegram_user_id es BIGINT (number), no phone_number (string)
 *
 * Flujo:
 *   1. Cargar config del bot (system_prompt, modelo, temperatura, contexto)
 *   2. Cargar últimos N mensajes como historial (filtrado por store_id + contact_id)
 *   3. Llamar a GLM via z-ai-web-dev-sdk
 *   4. Guardar respuesta en BD con tokens y tiempo de respuesta
 *   5. Retornar texto para enviar por Telegram
 */

import ZAI from 'z-ai-web-dev-sdk';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

export interface GLMResponse {
  text: string;
  tokensUsed: number;
  responseTimeMs: number;
}

interface BotConfig {
  system_prompt: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  context_window: number;
}

interface ChatMessage {
  direction: string; // 'incoming' | 'outgoing'
  content: string;
}

let zaiClient: any = null;

async function getZAIClient() {
  if (!zaiClient) {
    zaiClient = await ZAI.create();
  }
  return zaiClient;
}

/**
 * Genera una respuesta con GLM para un mensaje entrante de Telegram.
 *
 * FIX-AUDIT-WA-3 (aplicado desde el inicio): la query de historial filtra
 * por store_id + contact_id, no solo contact_id. Previene cross-tenant
 * poisoning del contexto del bot.
 */
export async function generateResponse(
  storeId: string,
  contactId: string | null,
  telegramUserId: number,
  incomingMessage: string,
  contactName?: string
): Promise<GLMResponse> {
  const startTime = Date.now();
  const admin = getSupabaseAdminSafe();
  if (!admin) throw new Error('Supabase admin not available');

  // 1. Cargar config del bot
  const { data: configData } = await admin
    .from('telegram_configs')
    .select('system_prompt, model_name, temperature, max_tokens, context_window')
    .eq('store_id', storeId)
    .maybeSingle();

  const config: BotConfig = configData || {
    system_prompt: 'Eres un asistente de ventas amable y breve. Responde en español.',
    model_name: 'glm-4.5-flash',
    temperature: 0.7,
    max_tokens: 1024,
    context_window: 10,
  };

  // 2. Cargar historial de mensajes (últimos N)
  // FIX-AUDIT-WA-3: filtro compuesto store_id + contact_id
  let history: ChatMessage[] = [];
  if (contactId) {
    const { data: messages } = await admin
      .from('telegram_messages')
      .select('direction, content')
      .eq('store_id', storeId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(config.context_window);

    history = (messages || []).reverse();
  }

  // 3. Construir messages array para GLM
  const systemContent = config.system_prompt
    .replace('{negocio_name}', contactName || 'la tienda')
    .replace('{contacto_name}', contactName || 'cliente');

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemContent },
    ...history.map(m => ({
      role: m.direction === 'incoming' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: incomingMessage },
  ];

  // 4. Llamar a GLM
  try {
    const client = await getZAIClient();
    const response = await client.chat.completions.create({
      model: config.model_name,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    });

    const text = response.choices?.[0]?.message?.content || 'Lo siento, no pude procesar tu mensaje.';
    const tokensUsed = response.usage?.total_tokens || 0;
    const responseTimeMs = Date.now() - startTime;

    logger.info('DATABASE', 'TELEGRAM_GLM_RESPONSE', {
      storeId, telegramUserId, tokensUsed, responseTimeMs,
    });

    return { text, tokensUsed, responseTimeMs };
  } catch (error: any) {
    logger.error('DATABASE', 'TELEGRAM_GLM_FAILED', {
      storeId, telegramUserId, error: error.message,
    });

    return {
      text: 'Disculpa, estoy teniendo dificultades técnicas. Intenta de nuevo en un momento.',
      tokensUsed: 0,
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Verifica que un contact_id pertenece a un store_id específico.
 * FIX-AUDIT-WA-2 (aplicado desde el inicio): previene inyección cross-tenant.
 */
export async function validateContactBelongsToStore(
  storeId: string,
  contactId: string | null
): Promise<boolean> {
  if (!contactId) return true;
  const admin = getSupabaseAdminSafe();
  if (!admin) return false;

  const { data } = await admin
    .from('telegram_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('store_id', storeId)
    .maybeSingle();

  return !!data;
}

/**
 * Guarda un mensaje en la BD.
 * FIX-AUDIT-WA-2: valida contact_id↔store_id antes de usarlo.
 */
export async function saveMessage(
  storeId: string,
  contactId: string | null,
  telegramUserId: number,
  direction: 'incoming' | 'outgoing',
  content: string,
  options?: {
    telegramMessageId?: number;
    telegramChatId?: number;
    tokensUsed?: number;
    responseTimeMs?: number;
    raw?: Record<string, unknown>;
  }
): Promise<string | null> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return null;

  // FIX-AUDIT-WA-2: validar contact_id
  if (contactId) {
    const belongs = await validateContactBelongsToStore(storeId, contactId);
    if (!belongs) {
      logger.warn('DATABASE', 'TELEGRAM_CONTACT_TENANT_MISMATCH', {
        storeId, contactId, telegramUserId,
      });
      contactId = null;
    }
  }

  // Crear contacto si no existe
  if (!contactId) {
    const { data: existing } = await admin
      .from('telegram_contacts')
      .select('id')
      .eq('store_id', storeId)
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (existing) {
      contactId = existing.id;
    } else {
      const { data: newContact } = await admin
        .from('telegram_contacts')
        .insert({ store_id: storeId, telegram_user_id: telegramUserId })
        .select()
        .single();
      contactId = newContact?.id || null;
    }
  }

  const { data: inserted, error } = await admin
    .from('telegram_messages')
    .insert({
      store_id: storeId,
      contact_id: contactId,
      telegram_message_id: options?.telegramMessageId || null,
      telegram_chat_id: options?.telegramChatId || null,
      direction,
      content,
      raw: options?.raw || null,
      tokens_used: options?.tokensUsed || null,
      response_time_ms: options?.responseTimeMs || null,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('DATABASE', 'TELEGRAM_MESSAGE_SAVE_ERROR', {
      storeId, telegramUserId, error: error.message,
    });
    return null;
  }

  // Actualizar last_contact del contacto
  if (contactId) {
    await admin
      .from('telegram_contacts')
      .update({ last_contact: new Date().toISOString() })
      .eq('id', contactId);
  }

  return inserted?.id || null;
}
