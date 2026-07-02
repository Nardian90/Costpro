-- =====================================================================
-- Migration: WhatsApp Bot Module — Multi-tienda
-- Fecha: 2026-07-02
-- Fase 1: Tablas + RLS para sistema WhatsApp + GLM por tienda
-- =====================================================================

-- 1. Configuración del bot por tienda (1:1 con stores)
CREATE TABLE IF NOT EXISTS public.whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone_number TEXT,
  group_jid TEXT,
  group_name TEXT,
  bot_is_admin BOOLEAN NOT NULL DEFAULT false,
  welcome_enabled BOOLEAN NOT NULL DEFAULT true,
  welcome_message TEXT NOT NULL DEFAULT '¡Bienvenido al grupo de ventas!',
  system_prompt TEXT NOT NULL DEFAULT 'Eres un asistente de ventas amable y breve. Responde en español. Ayuda con consultas sobre productos, precios y disponibilidad.',
  model_name TEXT NOT NULL DEFAULT 'glm-4.5-flash',
  temperature FLOAT NOT NULL DEFAULT 0.7,
  max_tokens INT NOT NULL DEFAULT 1024,
  context_window INT NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT false,
  trigger_mode TEXT NOT NULL DEFAULT 'mention',
  trigger_keywords TEXT,
  session_data JSONB,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_store ON public.whatsapp_configs(store_id);

-- 2. Contactos de WhatsApp por tienda
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  push_name TEXT,
  is_group BOOLEAN NOT NULL DEFAULT false,
  group_id TEXT,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  tags TEXT,
  first_contact TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_store ON public.whatsapp_contacts(store_id);

-- 3. Mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  content TEXT NOT NULL,
  raw JSONB,
  tokens_used INT,
  response_time_ms INT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  read_receipt BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_store ON public.whatsapp_messages(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact ON public.whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON public.whatsapp_messages(created_at DESC);

-- 4. Invitaciones a grupo
CREATE TABLE IF NOT EXISTS public.whatsapp_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_invitations_store ON public.whatsapp_invitations(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_invitations_status ON public.whatsapp_invitations(status);

-- 5. Estado de riesgo anti-ban por tienda
CREATE TABLE IF NOT EXISTS public.whatsapp_risk_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'safe',
  consecutive_blocks INT NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  daily_invitation_count INT NOT NULL DEFAULT 0,
  last_invitation_at TIMESTAMPTZ,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_risk_state_store ON public.whatsapp_risk_state(store_id);

-- ============================================
-- RLS Policies — mismo patrón que el resto de CostPro
-- ============================================

ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_risk_state ENABLE ROW LEVEL SECURITY;

-- SELECT: usuarios ven datos de tiendas donde tienen membership activa
CREATE POLICY "whatsapp_configs_select" ON public.whatsapp_configs FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_contacts_select" ON public.whatsapp_contacts FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_messages_select" ON public.whatsapp_messages FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_invitations_select" ON public.whatsapp_invitations FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_risk_state_select" ON public.whatsapp_risk_state FOR SELECT
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- INSERT/UPDATE/DELETE: solo admin y manager de la tienda
CREATE POLICY "whatsapp_configs_write" ON public.whatsapp_configs FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_contacts_write" ON public.whatsapp_contacts FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_messages_write" ON public.whatsapp_messages FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_invitations_write" ON public.whatsapp_invitations FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "whatsapp_risk_state_write" ON public.whatsapp_risk_state FOR ALL
  USING (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (store_id IN (
    SELECT m.store_id FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('admin', 'manager')
  ) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

COMMENT ON TABLE public.whatsapp_configs IS 'Configuración del bot WhatsApp + GLM por tienda. Una fila por tienda.';
COMMENT ON TABLE public.whatsapp_contacts IS 'Contactos de WhatsApp por tienda.';
COMMENT ON TABLE public.whatsapp_messages IS 'Mensajes de WhatsApp (entrantes/salientes) con metadata de GLM.';
COMMENT ON TABLE public.whatsapp_invitations IS 'Cola de invitaciones a grupo de ventas con 5 estados.';
COMMENT ON TABLE public.whatsapp_risk_state IS 'Estado de riesgo anti-banneo por tienda.';
