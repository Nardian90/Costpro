-- ============================================================================
-- Store Exchange Rates — tasas manuales persistentes por tienda
-- ============================================================================
-- Permite que cada tienda guarde sus tasas de cambio manuales (USD, EUR, MLC)
-- que se usan en el POS. Persisten hasta que el usuario las cambie manualmente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  currency TEXT NOT NULL, -- USD, EUR, MLC
  rate NUMERIC(14,4) NOT NULL, -- tasa respecto al CUP (ej: 680)
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_store_rates_store ON public.store_exchange_rates(store_id);

ALTER TABLE public.store_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own store rates" ON public.store_exchange_rates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.store_id = store_exchange_rates.store_id)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Users can manage own store rates" ON public.store_exchange_rates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.store_id = store_exchange_rates.store_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.store_id = store_exchange_rates.store_id)
  );

COMMENT ON TABLE public.store_exchange_rates IS 'Tasas de cambio manuales por tienda — persisten hasta cambio manual';
