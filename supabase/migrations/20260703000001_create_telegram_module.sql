-- =====================================================================
-- Migration: Telegram Bot Module — Multi-tienda
-- Fecha: 2026-07-03
-- Fase T1: Tablas + RLS para sistema Telegram + GLM por tienda
--
-- Diferencias clave con WhatsApp (ver docs/telegram/MODULE_OVERVIEW.md):
--   1. Sin sistema anti-ban (Telegram no banea bots oficiales).
--   2. telegram_user_id es BIGINT (Telegram usa IDs numéricos de 64 bits).
--   3. Sin risk_state — no hay límites diarios de invitación (Telegram las permite).
--   4. invitations usa callback_query (botones inline "Sí/No") en vez de
--      detección de texto.
--   5. bot_token se guarda en telegram_configs (1 bot por tienda).
-- =====================================================================

-- 1. Configuración del bot por tienda (1:1 con stores)
CREATE TABLE IF NOT EXISTS public.telegram_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  -- Credenciales del bot (de BotFather)
  bot_token TEXT NOT NULL,
  bot_username TEXT,           -- @username del bot (sin @), cacheado de getMe()
  bot_user_id BIGINT,          -- ID numérico del bot, cacheado de getMe()
  -- Config del grupo de ventas
  group_chat_id BIGINT,        -- ID numérico del grupo (-100xxxxxxxxx)
  group_title TEXT,            -- Nombre del grupo, cacheado de getChat()
  bot_is_admin BOOLEAN NOT NULL DEFAULT false,  -- verificado via getChatMember()
  -- Config de bienvenida
  welcome_enabled BOOLEAN NOT NULL DEFAULT true,
  welcome_message TEXT NOT NULL DEFAULT '¡Bienvenido al grupo de ventas!',
  -- Config del bot GLM
  system_prompt TEXT NOT NULL DEFAULT 'Eres un asistente de ventas amable y breve. Responde en español. Ayuda con consultas sobre productos, precios y disponibilidad.',
  model_name TEXT NOT NULL DEFAULT 'glm-4.5-flash',
  temperature FLOAT NOT NULL DEFAULT 0.7,
  max_tokens INT NOT NULL DEFAULT 1024,
  context_window INT NOT NULL DEFAULT 10,
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT false,
  trigger_mode TEXT NOT NULL DEFAULT 'mention',  -- 'always' | 'mention' | 'keyword'
  trigger_keywords TEXT,  -- JSON array de keywords
  -- Webhook
  webhook_url TEXT,             -- URL registrada en Telegram
  webhook_secret TEXT,          -- X-Telegram-Bot-Api-Secret-Token
  webhook_registered_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_configs_store ON public.telegram_configs(store_id);
CREATE INDEX IF NOT EXISTS idx_telegram_configs_bot_user_id ON public.telegram_configs(bot_user_id);

-- 2. Contactos de Telegram por tienda
CREATE TABLE IF NOT EXISTS public.telegram_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,                -- @username (sin @), puede ser null si el usuario no tiene
  first_name TEXT,
  last_name TEXT,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  tags TEXT,
  first_contact TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_contacts_store ON public.telegram_contacts(store_id);
CREATE INDEX IF NOT EXISTS idx_telegram_contacts_tg_user ON public.telegram_contacts(telegram_user_id);

-- 3. Mensajes de Telegram
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.telegram_contacts(id) ON DELETE SET NULL,
  -- Telegram message info
  telegram_message_id BIGINT,   -- ID del mensaje en Telegram (por chat)
  telegram_chat_id BIGINT,      -- Chat donde se envió/recebió (privado o grupo)
  direction TEXT NOT NULL,      -- 'incoming' | 'outgoing'
  content TEXT NOT NULL,
  raw JSONB,                    -- Update object completo de Telegram (para debug)
  -- GLM metadata
  tokens_used INT,
  response_time_ms INT,
  -- Estado
  delivered BOOLEAN NOT NULL DEFAULT false,
  read_receipt BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_store ON public.telegram_messages(store_id);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_contact ON public.telegram_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_created ON public.telegram_messages(created_at DESC);

-- 4. Invitaciones a grupo (mismo flujo de 5 estados que WhatsApp)
-- Diferencia: las invitations se confirman via callback_query (botones inline)
-- en vez de detección de texto "sí/no".
CREATE TABLE IF NOT EXISTS public.telegram_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.telegram_contacts(id) ON DELETE SET NULL,
  -- Datos del invitado
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  -- Estado del flujo
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' → 'pre_message_sent' → 'waiting_response'
  --   ├─ callback "accept" → 'invited' → 'accepted' (tras join confirmado)
  --   ├─ callback "reject" → 'rejected'
  --   ├─ sin respuesta 24h → 'expired'
  --   └─ error Telegram → 'failed'
  -- Mensaje de invitación con botones inline
  invitation_message_id BIGINT,  -- ID del mensaje con botones (para editar/eliminar)
  -- Timestamps del flujo
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,         -- cuando el usuario efectivamente entró al grupo
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_invitations_store ON public.telegram_invitations(store_id);
CREATE INDEX IF NOT EXISTS idx_telegram_invitations_status ON public.telegram_invitations(status);
CREATE INDEX IF NOT EXISTS idx_telegram_invitations_tg_user ON public.telegram_invitations(telegram_user_id);

-- NOTA: No creamos telegram_risk_state porque Telegram no banea bots oficiales.
-- El rate-limit por usuario se maneja en memoria (anti-spam.ts) o via Upstash
-- Redis si se quiere persistencia entre invocaciones serverless.

-- ============================================
-- RLS Policies — mismo patrón que whatsapp y resto de CostPro
-- ============================================

ALTER TABLE public.telegram_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_invitations ENABLE ROW LEVEL SECURITY;

-- SELECT: usuarios ven datos de tiendas donde tienen membership activa
CREATE POLICY "telegram_configs_select" ON public.telegram_configs FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "telegram_contacts_select" ON public.telegram_contacts FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "telegram_messages_select" ON public.telegram_messages FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "telegram_invitations_select" ON public.telegram_invitations FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- INSERT/UPDATE/DELETE: solo admin y manager/encargado de la tienda
CREATE POLICY "telegram_configs_write" ON public.telegram_configs FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "telegram_contacts_write" ON public.telegram_contacts FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "telegram_messages_write" ON public.telegram_messages FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "telegram_invitations_write" ON public.telegram_invitations FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager', 'encargado')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Comentarios para documentación
COMMENT ON TABLE public.telegram_configs IS 'Configuración del bot Telegram + GLM por tienda. Una fila por tienda. 1 bot por tienda.';
COMMENT ON TABLE public.telegram_contacts IS 'Contactos de Telegram por tienda. telegram_user_id es BIGINT (IDs de 64 bits de Telegram).';
COMMENT ON TABLE public.telegram_messages IS 'Mensajes de Telegram (entrantes/salientes) con metadata de GLM y raw Update object.';
COMMENT ON TABLE public.telegram_invitations IS 'Cola de invitaciones a grupo de ventas con 5 estados. Confirmación via callback_query (botones inline).';
