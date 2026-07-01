/**
 * GLM Orchestrator — Procesa mensajes de WhatsApp con IA.
 *
 * Flujo:
 * 1. Cargar config del bot (system prompt, modelo, temperatura, contexto)
 * 2. Cargar últimos N mensajes como historial
 * 3. Llamar a GLM via z-ai-web-dev-sdk
 * 4. Guardar respuesta en BD con tokens y tiempo de respuesta
 * 5. Retornar texto para enviar por WhatsApp
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
  // Antes solo se filtraba por contact_id, lo que permitía cross-tenant poisoning:
  // si un contacto de la Tienda A tenía el mismo UUID que otro (imposible por FK,
  // pero defensivo), o si un mensaje se insertaba con contact_id de otra tienda
  // (ver FIX-AUDIT-WA-2 en saveMessage/send route), ese mensaje contaminaba el
  // contexto del bot. Ahora el filtro compuesto store_id+contact_id garantiza
  // aislamiento incluso ante un bug upstream.
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

    logger.info('DATABASE', 'GLM_RESPONSE_GENERATED', {
      storeId, phoneNumber, tokensUsed, responseTimeMs,
    });

    return { text, tokensUsed, responseTimeMs };
  } catch (error: any) {
    logger.error('DATABASE', 'GLM_RESPONSE_FAILED', {
      storeId, phoneNumber, error: error.message,
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
