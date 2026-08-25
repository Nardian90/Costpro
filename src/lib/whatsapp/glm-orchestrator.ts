/**
 * GLM Orchestrator — Procesa mensajes de WhatsApp con IA.
 *
 * Flujo:
 * 1. Cargar config del bot (system prompt, modelo, temperatura, contexto)
 * 2. Cargar últimos N mensajes como historial
 * 3. Llamar a GLM via Vercel AI SDK (same path as /api/bot/chat web chat)
 * 4. Guardar respuesta en BD con tokens y tiempo de respuesta
 * 5. Retornar texto para enviar por WhatsApp
 *
 * FIX (2026-08-25): se reemplazó z-ai-web-dev-sdk por Vercel AI SDK
 * (getGLMModel + generateText). Esto es lo mismo que usa /api/bot/chat
 * (el chat web) y /lib/telegram/glm-orchestrator.ts (el bot de Telegram).
 *
 * Antes, el bot de WhatsApp fallaba en producción (Vercel) porque
 * z-ai-web-dev-sdk requiere /etc/.z-ai-config (que solo existe en la
 * máquina de desarrollo local). El chat web funcionaba porque ya usaba
 * getGLMModel() que tiene fallback a env vars.
 */

import { generateText, type ModelMessage } from 'ai';
import { getGLMModel } from '@/lib/ai/vercel-provider';
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

export async function generateResponse(
  storeId: string,
  contactId: string | null,
  phoneNumber: string,
  incomingMessage: string,
  contactName?: string
): Promise<GLMResponse> {
  const startTime = Date.now();
  const admin = getSupabaseAdminSafe();
  if (!admin) throw new Error('Supabase admin not available');

  // 1. Cargar config del bot
  const { data: configData } = await admin
    .from('whatsapp_configs')
    .select('system_prompt, model_name, temperature, max_tokens, context_window')
    .eq('store_id', storeId)
    .single();

  const config: BotConfig = configData || {
    system_prompt: 'Eres un asistente de ventas amable y breve. Responde en español.',
    model_name: 'glm-4.5-flash',
    temperature: 0.7,
    max_tokens: 1024,
    context_window: 10,
  };

  // 2. Cargar historial de mensajes (últimos N)
  // FIX-AUDIT-WA-3: Filtrar SIEMPRE por store_id además de contact_id.
  let history: ChatMessage[] = [];
  if (contactId) {
    const { data: messages } = await admin
      .from('whatsapp_messages')
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

  // Build ModelMessage[] for Vercel AI SDK (NO system message — use `system:` option)
  // Same pattern as Telegram orchestrator — avoids AI_InvalidPromptError.
  const messages: ModelMessage[] = history.map((m): ModelMessage => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: m.content,
  })).concat([{ role: 'user', content: incomingMessage }]);

  // 4. Llamar a GLM via Vercel AI SDK (same path as /api/bot/chat)
  try {
    const model = getGLMModel(config.model_name);
    const result = await generateText({
      model,
      system: systemContent,
      messages,
      temperature: config.temperature,
    });

    const text = result.text || 'Lo siento, no pude procesar tu mensaje.';
    const tokensUsed = result.usage?.totalTokens ?? 0;
    const responseTimeMs = Date.now() - startTime;

    logger.info('DATABASE', 'WHATSAPP_GLM_RESPONSE', {
      storeId, phoneNumber, tokensUsed, responseTimeMs,
      textPreview: text.slice(0, 80),
      provider: 'glm',
      model: config.model_name,
    });

    return { text, tokensUsed, responseTimeMs };
  } catch (error: any) {
    // Capture the real error — same pattern as Telegram orchestrator.
    logger.error('DATABASE', 'WHATSAPP_GLM_FAILED', {
      storeId,
      phoneNumber,
      errorName: error?.name ?? 'Unknown',
      errorMessage: error?.message ?? String(error),
      errorCause: error?.cause ? String(error.cause).slice(0, 300) : null,
      stackTop: error?.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : null,
      model: config.model_name,
      messageCount: messages.length,
      historyLength: history.length,
      responseTimeMs: Date.now() - startTime,
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
 * FIX-AUDIT-WA-2: previene inyección cross-tenant — un manager de la Tienda A
 * no puede insertar mensajes contra el contact_id de la Tienda B simplemente
 * enviando el UUID en el body. Esta función se invoca antes de cualquier
 * inserción que use service-role (que bypassa RLS).
 *
 * Retorna true si el contacto existe Y pertenece a la tienda indicada,
 * o si contactId es null (caso en el que se crea un contacto nuevo).
 */
export async function validateContactBelongsToStore(
  storeId: string,
  contactId: string | null
): Promise<boolean> {
  if (!contactId) return true; // sin contact_id → se creará después
  const admin = getSupabaseAdminSafe();
  if (!admin) return false;

  const { data } = await admin
    .from('whatsapp_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('store_id', storeId)
    .maybeSingle();

  return !!data;
}

export async function saveMessage(
  storeId: string,
  contactId: string | null,
  phoneNumber: string,
  direction: 'incoming' | 'outgoing',
  content: string,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<void> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  // FIX-AUDIT-WA-2: Validar que contact_id (si viene) pertenece a storeId.
  // Si no pertenece, no usarlo — se crea/usa contacto por phone_number+storeId.
  // Esto evita que un caller malicioso inyecte mensajes en el historial de
  // otra tienda pasando un UUID foráneo.
  if (contactId) {
    const belongs = await validateContactBelongsToStore(storeId, contactId);
    if (!belongs) {
      logger.warn('DATABASE', 'WHATSAPP_CONTACT_TENANT_MISMATCH', {
        storeId, contactId, phoneNumber,
      });
      contactId = null; // descartar — se reasigna abajo por phone_number
    }
  }

  // Crear contacto si no existe
  if (!contactId) {
    const { data: existing } = await admin
      .from('whatsapp_contacts')
      .select('id')
      .eq('store_id', storeId)
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (existing) {
      contactId = existing.id;
    } else {
      const { data: newContact } = await admin
        .from('whatsapp_contacts')
        .insert({ store_id: storeId, phone_number: phoneNumber })
        .select()
        .single();
      contactId = newContact?.id;
    }
  }

  await admin.from('whatsapp_messages').insert({
    store_id: storeId,
    contact_id: contactId,
    direction,
    content,
    tokens_used: tokensUsed || null,
    response_time_ms: responseTimeMs || null,
  });

  // Actualizar last_contact del contacto
  if (contactId) {
    await admin
      .from('whatsapp_contacts')
      .update({ last_contact: new Date().toISOString() })
      .eq('id', contactId);
  }
}
