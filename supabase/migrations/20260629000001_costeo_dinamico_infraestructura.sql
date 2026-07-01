-- ============================================================================
-- Migration: 20260629000001_costeo_dinamico_infraestructura.sql
-- Objetivo: Infraestructura de datos para el Sistema de Costeo Dinámico
-- ============================================================================

-- ============================================================================
-- 1. EXTENDER receipt_items CON MONEDA Y TASA DE CAMBIO
-- ============================================================================
-- Permite registrar la moneda original y la tasa de cambio utilizada
-- en la compra de cada item de la recepción.
-- Las recepciones existentes quedan con CUP/1.0 (sin efecto).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipt_items' AND column_name = 'moneda_recepcion'
  ) THEN
    ALTER TABLE public.receipt_items
      ADD COLUMN moneda_recepcion TEXT NOT NULL DEFAULT 'CUP';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipt_items' AND column_name = 'tasa_cambio_recepcion'
  ) THEN
    ALTER TABLE public.receipt_items
      ADD COLUMN tasa_cambio_recepcion NUMERIC(12,4) NOT NULL DEFAULT 1.0;
  END IF;
END $$;

COMMENT ON COLUMN public.receipt_items.moneda_recepcion IS
  'Moneda original de compra (CUP, USD, EUR, MLC). Default CUP.';
COMMENT ON COLUMN public.receipt_items.tasa_cambio_recepcion IS
  'Tasa de cambio REAL utilizada en la compra (ej: 500 CUP/USD). Default 1.0 para CUP.';

-- ============================================================================
-- 2. TABLA receipt_tasa_audit — Auditoría de cambios de tasa
-- ============================================================================
-- Registra cada modificación de tasa de cambio en receipt_items.
-- Permite trazabilidad total: quién, cuándo, por qué cambió la tasa.

CREATE TABLE IF NOT EXISTS public.receipt_tasa_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_item_id UUID NOT NULL REFERENCES public.receipt_items(id) ON DELETE CASCADE,
  valor_anterior NUMERIC(12,4) NOT NULL,
  valor_nuevo NUMERIC(12,4) NOT NULL,
  moneda_anterior TEXT NOT NULL,
  moneda_nueva TEXT NOT NULL,
  modificado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  modificado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_receipt_tasa_audit_item
  ON public.receipt_tasa_audit(receipt_item_id);
CREATE INDEX IF NOT EXISTS idx_receipt_tasa_audit_user
  ON public.receipt_tasa_audit(modificado_por);

COMMENT ON TABLE public.receipt_tasa_audit IS
  'Auditoría de cambios de tasa de cambio en receipt_items. Nunca eliminar.';

-- ============================================================================
-- 3. TABLA commission_reception_links — Vincular comisiones a recepciones
-- ============================================================================
-- Permite absorber comisiones pagadas a trabajadores (por ventas)
-- en el costo del producto recibido.

CREATE TABLE IF NOT EXISTS public.commission_reception_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_payment_id UUID REFERENCES public.commission_payments(id) ON DELETE SET NULL,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  allocated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  distribution_method TEXT NOT NULL DEFAULT 'cost_value'
    CHECK (distribution_method IN ('quantity', 'cost_value', 'weight', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_reception_links_receipt
  ON public.commission_reception_links(receipt_id);
CREATE INDEX IF NOT EXISTS idx_commission_reception_links_product
  ON public.commission_reception_links(product_id);
CREATE INDEX IF NOT EXISTS idx_commission_reception_links_payment
  ON public.commission_reception_links(commission_payment_id);

-- UNIQUE: un producto solo puede tener una asignación de comisión por recepción
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_reception_links_unique
  ON public.commission_reception_links(receipt_id, product_id)
  WHERE product_id IS NOT NULL;

COMMENT ON TABLE public.commission_reception_links IS
  'Vincula comisiones pagadas a trabajadores con recepciones para absorción de costo.';
COMMENT ON COLUMN public.commission_reception_links.distribution_method IS
  'Método de distribución: quantity (por cantidad), cost_value (por valor del costo), weight (por peso), manual';

-- ============================================================================
-- 4. TABLA price_commit_log — Auditoría de actualizaciones batch de precios
-- ============================================================================
-- Registra cada operación de "commit" de precios sugeridos por el motor.
-- Permite rollback completo de una actualización cambiaria.

CREATE TABLE IF NOT EXISTS public.price_commit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  escenario_id UUID, -- FK a revaluation_scenarios (Fase 3, nullable por ahora)
  committed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  products_count INTEGER NOT NULL DEFAULT 0,
  changes JSONB NOT NULL, -- [{product_id, old_price, new_price, old_cost, new_cost}]
  tasa_usada NUMERIC(12,4),
  fuente_tasa TEXT, -- 'BCC_seg1' | 'BCC_seg2' | 'BCC_seg3' | 'elToque' | 'Manual'
  motivo TEXT,
  rollback BOOLEAN NOT NULL DEFAULT FALSE,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_price_commit_log_store
  ON public.price_commit_log(store_id);
CREATE INDEX IF NOT EXISTS idx_price_commit_log_committed_by
  ON public.price_commit_log(committed_by);

COMMENT ON TABLE public.price_commit_log IS
  'Auditoría de actualizaciones batch de precios. Permite rollback completo.';

-- ============================================================================
-- 5. HABILITAR RLS EN NUEVAS TABLAS
-- ============================================================================

ALTER TABLE public.receipt_tasa_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_reception_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_commit_log ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismas que otras tablas: admin ve todo, miembros ven su tienda)

-- receipt_tasa_audit: admin y miembros de la tienda pueden ver
CREATE POLICY "receipt_tasa_audit_select_authenticated"
  ON public.receipt_tasa_audit FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM public.receipt_items ri
      JOIN public.receipts r ON ri.receipt_id = r.id
      WHERE ri.id = receipt_tasa_audit.receipt_item_id
      AND public.is_store_member(r.store_id)
    )
  );

-- Solo admin/manager pueden insertar (via API)
CREATE POLICY "receipt_tasa_audit_insert_admin"
  ON public.receipt_tasa_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin() OR public.has_store_role(NULL, ARRAY['admin', 'manager']));

-- commission_reception_links: admin y miembros
CREATE POLICY "commission_reception_links_select_authenticated"
  ON public.commission_reception_links FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(commission_reception_links.receipt_id::uuid)
  );

CREATE POLICY "commission_reception_links_insert_admin"
  ON public.commission_reception_links FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin() OR public.has_store_role(NULL, ARRAY['admin', 'manager']));

CREATE POLICY "commission_reception_links_delete_admin"
  ON public.commission_reception_links FOR DELETE TO authenticated
  USING (public.is_global_admin() OR public.has_store_role(NULL, ARRAY['admin', 'manager']));

-- price_commit_log: admin y miembros
CREATE POLICY "price_commit_log_select_authenticated"
  ON public.price_commit_log FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(price_commit_log.store_id)
  );

CREATE POLICY "price_commit_log_insert_admin"
  ON public.price_commit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin() OR public.has_store_role(NULL, ARRAY['admin', 'manager']));

CREATE POLICY "price_commit_log_update_admin"
  ON public.price_commit_log FOR UPDATE TO authenticated
  USING (public.is_global_admin());
