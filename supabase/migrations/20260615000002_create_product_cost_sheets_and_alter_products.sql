-- =============================================================================
-- Migration: Create product_cost_sheets table + ALTER products
-- Date: 2026-06-15
-- Task: Fase 1.2 + 1.3 - FC Automatizada por Tienda
--
-- Links each product to its generated cost sheet. This table is the
-- shared read model between Inventory and CostManagement bounded contexts.
-- Products without a cost_sheet_id fall back to the store's default template.
-- =============================================================================

-- ─── Step 1: Create product_cost_sheets ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_cost_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  modalidad TEXT NOT NULL CHECK (modalidad IN ('produccion', 'servicios', 'comercializacion')),
  calculated_data JSONB NOT NULL DEFAULT '{}',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price_updated_at TIMESTAMPTZ DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_cost_sheets_product_id ON public.product_cost_sheets(product_id);
CREATE INDEX IF NOT EXISTS idx_product_cost_sheets_store_id ON public.product_cost_sheets(store_id);
CREATE INDEX IF NOT EXISTS idx_product_cost_sheets_sync_status ON public.product_cost_sheets(sync_status) WHERE sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_product_cost_sheets_not_deleted ON public.product_cost_sheets(product_id) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE public.product_cost_sheets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view cost sheets from stores they belong to
DROP POLICY IF EXISTS "product_cost_sheets_select_authenticated" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_select_authenticated" ON public.product_cost_sheets
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(product_cost_sheets.store_id)
  );

-- RLS Policy: Admin/manager/encargado/costo can insert cost sheets
DROP POLICY IF EXISTS "product_cost_sheets_insert_roles" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_insert_roles" ON public.product_cost_sheets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(product_cost_sheets.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  );

-- RLS Policy: Admin/manager/encargado/costo can update cost sheets
DROP POLICY IF EXISTS "product_cost_sheets_update_roles" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_update_roles" ON public.product_cost_sheets
  FOR UPDATE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(product_cost_sheets.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(product_cost_sheets.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  );

-- RLS Policy: Only admin can hard-delete cost sheets (soft delete preferred)
DROP POLICY IF EXISTS "product_cost_sheets_delete_admin" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_delete_admin" ON public.product_cost_sheets
  FOR DELETE TO authenticated
  USING (
    public.is_global_admin()
  );

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_product_cost_sheets_updated_at ON public.product_cost_sheets;
CREATE TRIGGER set_product_cost_sheets_updated_at
  BEFORE UPDATE ON public.product_cost_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Step 2: ALTER products table ─────────────────────────────────────────────

-- Add FK to product_cost_sheets (nullable: existing products may not have FC yet)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_sheet_id UUID REFERENCES public.product_cost_sheets(id) ON DELETE SET NULL;

-- Add flag to control auto-generation per product
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fc_auto_enabled BOOLEAN NOT NULL DEFAULT true;

-- Index for the new FK column
CREATE INDEX IF NOT EXISTS idx_products_cost_sheet_id ON public.products(cost_sheet_id) WHERE cost_sheet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_fc_auto_enabled ON public.products(fc_auto_enabled) WHERE fc_auto_enabled = true;

-- ─── Step 3: RPC for quick FC generation ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_product_cost_sheet(
  p_product_id UUID,
  p_store_id UUID,
  p_template_id TEXT DEFAULT NULL,
  p_modalidad TEXT DEFAULT NULL,
  p_pdf_format TEXT DEFAULT 'res148'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost_sheet_id UUID;
  v_template_id TEXT;
  v_modalidad TEXT;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para acceder a las fichas de costo de esta tienda';
  END IF;

  -- 1. Check if product already has a cost sheet
  SELECT cost_sheet_id INTO v_cost_sheet_id
  FROM products WHERE id = p_product_id;

  IF v_cost_sheet_id IS NOT NULL THEN
    -- Return existing cost sheet data
    SELECT jsonb_build_object(
      'id', id,
      'product_id', product_id,
      'store_id', store_id,
      'template_id', template_id,
      'modalidad', modalidad,
      'calculated_data', calculated_data,
      'cost_price', cost_price,
      'cost_price_updated_at', cost_price_updated_at,
      'sync_status', sync_status,
      'exists', true
    ) INTO v_result
    FROM product_cost_sheets
    WHERE id = v_cost_sheet_id AND deleted_at IS NULL;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- 2. Resolve template: explicit parameter > store default > error
  IF p_template_id IS NOT NULL THEN
    v_template_id := p_template_id;
    v_modalidad := COALESCE(p_modalidad, 'produccion');
  ELSE
    -- Get store's default template
    SELECT sct.template_id, sct.modalidad INTO v_template_id, v_modalidad
    FROM store_cost_templates sct
    WHERE sct.store_id = p_store_id AND sct.is_active = true;

    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'No hay plantilla de FC asignada a esta tienda. Configure una plantilla predeterminada primero.';
    END IF;
  END IF;

  -- 3. Return template info for client-side calculation
  -- (The actual calculation uses the TypeScript cost-engine on the API route)
  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'store_id', p_store_id,
    'template_id', v_template_id,
    'modalidad', v_modalidad,
    'pdf_format', COALESCE(p_pdf_format, 'res148'),
    'exists', false,
    'needs_calculation', true
  );
END;
$$;

COMMENT ON FUNCTION public.get_or_create_product_cost_sheet(UUID, UUID, TEXT, TEXT, TEXT) IS
  'Resolves the FC for a product: returns existing data or identifies which template to apply. Does NOT perform calculation (that happens in the TypeScript cost-engine on the API route). SECURITY DEFINER for RLS bypass.';

GRANT EXECUTE ON FUNCTION public.get_or_create_product_cost_sheet(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_product_cost_sheet(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;

-- ─── Step 4: RPC for saving calculated cost sheet ─────────────────────────────

CREATE OR REPLACE FUNCTION public.save_product_cost_sheet(
  p_product_id UUID,
  p_store_id UUID,
  p_template_id TEXT,
  p_modalidad TEXT,
  p_calculated_data JSONB,
  p_cost_price NUMERIC(12,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cs_id UUID;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para guardar fichas de costo en esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida';
  END IF;

  -- Validate cost_price > 0 (REG-03: division by zero prevention)
  IF p_cost_price < 0 THEN
    RAISE EXCEPTION 'El costo unitario no puede ser negativo';
  END IF;

  -- Upsert the cost sheet
  INSERT INTO product_cost_sheets (product_id, store_id, template_id, modalidad, calculated_data, cost_price, sync_status)
  VALUES (p_product_id, p_store_id, p_template_id, p_modalidad, p_calculated_data, p_cost_price, 'synced')
  ON CONFLICT (product_id) WHERE deleted_at IS NULL
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    modalidad = EXCLUDED.modalidad,
    calculated_data = EXCLUDED.calculated_data,
    cost_price = EXCLUDED.cost_price,
    cost_price_updated_at = now(),
    sync_status = 'synced',
    updated_at = now()
  RETURNING id INTO v_cs_id;

  -- Link product to cost sheet
  UPDATE products SET cost_sheet_id = v_cs_id WHERE id = p_product_id;

  -- Return confirmation
  SELECT jsonb_build_object(
    'id', id,
    'product_id', product_id,
    'cost_price', cost_price,
    'cost_price_updated_at', cost_price_updated_at,
    'sync_status', sync_status
  ) INTO v_result
  FROM product_cost_sheets WHERE id = v_cs_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.save_product_cost_sheet(UUID, UUID, TEXT, TEXT, JSONB, NUMERIC) IS
  'Saves a calculated cost sheet for a product. Upserts if already exists. Links the product to the cost sheet. SECURITY DEFINER for atomic product + cost_sheet update.';

GRANT EXECUTE ON FUNCTION public.save_product_cost_sheet(UUID, UUID, TEXT, TEXT, JSONB, NUMERIC) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_product_cost_sheet(UUID, UUID, TEXT, TEXT, JSONB, NUMERIC) FROM anon;
