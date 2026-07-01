-- =====================================================================
-- Migration: saved_analytics_views — Centro de Análisis Dinámico
-- Fecha: 2026-07-01
-- Propósito: Persistir vistas personalizadas del Centro de Análisis
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.saved_analytics_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL DEFAULT 'costs',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_analytics_views_user ON public.saved_analytics_views(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_analytics_views_store ON public.saved_analytics_views(store_id);
CREATE INDEX IF NOT EXISTS idx_saved_analytics_views_module ON public.saved_analytics_views(module);

ALTER TABLE public.saved_analytics_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics views" ON public.saved_analytics_views
  FOR SELECT USING (
    auth.uid() = user_id
    OR store_id IN (
      SELECT m.store_id FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

CREATE POLICY "Users can insert own analytics views" ON public.saved_analytics_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analytics views" ON public.saved_analytics_views
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics views" ON public.saved_analytics_views
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.saved_analytics_views IS
'Vistas guardadas del Centro de Análisis Dinámico. Cada vista pertenece a un
usuario y opcionalmente a una tienda. El campo config almacena la configuración
completa (filas, columnas, valores, filtros, orden, agrupaciones).';
