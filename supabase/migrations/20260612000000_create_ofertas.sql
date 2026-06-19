-- Ofertas Comerciales table
-- Migration: 20260612_create_ofertas.sql

CREATE TABLE IF NOT EXISTS public.ofertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  objeto TEXT NOT NULL,
  suministrador JSONB NOT NULL DEFAULT '{}',
  cliente JSONB NOT NULL DEFAULT '{}',
  productos JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  stamp_url TEXT,
  sign_url TEXT,
  stamp_scale INTEGER NOT NULL DEFAULT 100,
  sign_scale INTEGER NOT NULL DEFAULT 100,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  descuento DOUBLE PRECISION NOT NULL DEFAULT 0,
  itbis DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'CUP',
  validez TEXT NOT NULL DEFAULT '30 días',
  condiciones_pago TEXT NOT NULL DEFAULT 'Pago en la fecha de entrega',
  condiciones_entrega TEXT NOT NULL DEFAULT 'Según acuerdo entre las partes',
  notas TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ofertas_store_id ON public.ofertas(store_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_status ON public.ofertas(status);
CREATE INDEX IF NOT EXISTS idx_ofertas_created_by ON public.ofertas(created_by);

-- Enable RLS
ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see ofertas from stores they belong to
DROP POLICY IF EXISTS "Users can view ofertas from their stores" ON public.ofertas;
CREATE POLICY "Users can view ofertas from their stores"
  ON public.ofertas FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM public.user_store_memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Admin/manager/encargado can insert ofertas
DROP POLICY IF EXISTS "Admin/manager/encargado can insert ofertas" ON public.ofertas;
CREATE POLICY "Admin/manager/encargado can insert ofertas"
  ON public.ofertas FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM public.user_store_memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager', 'encargado')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Admin/manager/encargado can update ofertas
DROP POLICY IF EXISTS "Admin/manager/encargado can update ofertas" ON public.ofertas;
CREATE POLICY "Admin/manager/encargado can update ofertas"
  ON public.ofertas FOR UPDATE
  USING (
    store_id IN (
      SELECT store_id FROM public.user_store_memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager', 'encargado')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Only admin/manager can delete ofertas
DROP POLICY IF EXISTS "Admin/manager can delete ofertas" ON public.ofertas;
CREATE POLICY "Admin/manager can delete ofertas"
  ON public.ofertas FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
    OR store_id IN (
      SELECT store_id FROM public.user_store_memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'manager'
    )
  );

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ofertas_updated_at ON public.ofertas;
CREATE TRIGGER set_ofertas_updated_at
  BEFORE UPDATE ON public.ofertas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
