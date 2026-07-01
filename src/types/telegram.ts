/**
 * Tipos del módulo Telegram — Fase T1
 *
 * Espejo de los tipos de WhatsApp con diffs mínimas:
 *   - telegram_user_id es BIGINT (number en TS, ya que JS soporta hasta 2^53)
 *   - Sin RiskState (Telegram no banea bots)
 *   - Sin connectionStatus (no hay conexión persistente — webhook-based)
 *   - invitations usan callback_query (botones inline) en vez de texto
 */

// ── Config ────────────────────────────────────────────────────────────

export interface TelegramConfig {
  id: string;
  store_id: string;
  bot_token: string;
  bot_username: string | null;
  bot_user_id: number | null;
  group_chat_id: number | null;
  group_title: string | null;
  bot_is_admin: boolean;
  welcome_enabled: boolean;
  welcome_message: string;
  system_prompt: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  context_window: number;
  is_active: boolean;
  trigger_mode: 'always' | 'mention' | 'keyword';
  trigger_keywords: string[] | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_registered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelegramBotStatus {
  configured: boolean;
  is_active: boolean;
  bot_username: string | null;
  bot_user_id: number | null;
  webhook_url: string | null;
  webhook_registered_at: string | null;
  group_chat_id: number | null;
  group_title: string | null;
  bot_is_admin: boolean;
}

// ── Contacto ──────────────────────────────────────────────────────────

export interface TelegramContact {
  id: string;
  store_id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_banned: boolean;
  tags: string[] | null;
  first_contact: string;
  last_contact: string | null;
  created_at: string;
}

// Conenido enriquecido para la vista de conversaciones
export interface TelegramConversation extends TelegramContact {
  last_message: string;
  last_message_direction: 'incoming' | 'outgoing';
  last_message_at: string | null;
  unread_count: number;
}

// ── Mensaje ───────────────────────────────────────────────────────────

export interface TelegramMessage {
  id: string;
  store_id: string;
  contact_id: string | null;
  telegram_message_id: number | null;
  telegram_chat_id: number | null;
  direction: 'incoming' | 'outgoing';
  content: string;
  raw: Record<string, unknown> | null;
  tokens_used: number | null;
  response_time_ms: number | null;
  delivered: boolean;
  read_receipt: boolean;
  error: string | null;
  created_at: string;
}

// ── Invitaciones ──────────────────────────────────────────────────────

export type TelegramInvitationStatus =
  | 'pending'
  | 'pre_message_sent'
  | 'waiting_response'
  | 'invited'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'failed';

export interface TelegramInvitation {
  id: string;
  store_id: string;
  contact_id: string | null;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  status: TelegramInvitationStatus;
  invitation_message_id: number | null;
  scheduled_at: string | null;
  sent_at: string | null;
  response_at: string | null;
  expires_at: string | null;
  joined_at: string | null;
  created_at: string;
}

// ── Métricas (para Dashboard) ─────────────────────────────────────────

export interface TelegramMetrics {
  messagesToday: number;
  incomingToday: number;
  outgoingToday: number;
  activeConversations: number;
  invitationsToday: number;
  totalContacts: number;
  botStatus: 'active' | 'inactive' | 'not_configured';
  invitationsByStatus: Record<TelegramInvitationStatus, number>;
  dailyStats: Array<{ date: string; incoming: number; outgoing: number }>;
}

// ── Eventos Realtime (Fase T6 — Supabase Realtime) ────────────────────

export interface TelegramMessageEvent {
  contact_id: string | null;
  telegram_user_id: number;
  chat_id: number | null;
  content: string;
  sender_name?: string;
  tokens_used?: number;
  response_time_ms?: number;
  ts: number;
}

export interface TelegramTypingEvent {
  contact_id: string | null;
  telegram_user_id: number;
  ts: number;
}

export interface TelegramGroupParticipantEvent {
  chat_id: number;
  user_id: number;
  username: string | null;
  action: 'join' | 'leave' | 'promote' | 'demote';
  ts: number;
}

export interface TelegramBotStatusEvent {
  status: 'active' | 'inactive' | 'webhook_registered' | 'webhook_removed';
  bot_username?: string;
  ts: number;
}

export type TelegramEventName =
  | 'message_incoming'
  | 'message_outgoing'
  | 'typing'
  | 'typing_stop'
  | 'group_participant'
  | 'bot_status'
  | 'metrics_update';

// ── Telegram Bot API tipos (subconjunto que usamos) ───────────────────

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface TelegramChatInfo {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramChatMember {
  user: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  status: 'creator' | 'administrator' | 'member' | 'left' | 'kicked' | 'restricted';
  can_promote_members?: boolean;
  can_change_info?: boolean;
  can_delete_messages?: boolean;
  can_invite_users?: boolean;
}

// ── Webhook Update (de Telegram) ──────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessageUpdate;
  edited_message?: TelegramMessageUpdate;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramChatMemberUpdated;
}

export interface TelegramMessageUpdate {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  date: number;
  text?: string;
  entities?: Array<{
    type: 'mention' | 'bot_command' | 'url' | 'email' | 'text_mention';
    offset: number;
    length: number;
    user?: { id: number; first_name: string; username?: string };
  }>;
  // Para detectar menciones del bot
  reply_to_message?: TelegramMessageUpdate;
}

export interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: { id: number; type: string };
  };
  data: string;  // 'accept' | 'reject' | 'cancel' | custom
}

export interface TelegramChatMemberUpdated {
  chat: { id: number; type: string; title?: string };
  from: { id: number; first_name: string; username?: string };
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}
