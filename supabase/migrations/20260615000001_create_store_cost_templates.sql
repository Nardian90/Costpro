-- =============================================================================
-- Migration: Create store_cost_templates table
-- Date: 2026-06-15
-- Task: Fase 1.1 - FC Automatizada por Tienda
--
-- Stores the default cost sheet template assignment per store.
-- Each store can have exactly one active template that applies to
-- all products without a custom FC. This table bridges the
-- TenantAdmin (stores) and CostManagement (templates) bounded contexts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.store_cost_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  template_data JSONB,
  modalidad TEXT NOT NULL CHECK (modalidad IN ('produccion', 'servicios', 'comercializacion')),
  pdf_format TEXT NOT NULL DEFAULT 'res148',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active template per store
  CONSTRAINT uq_store_cost_templates_store_id UNIQUE (store_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_store_cost_templates_store_id ON public.store_cost_templates(store_id);
CREATE INDEX IF NOT EXISTS idx_store_cost_templates_template_id ON public.store_cost_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_store_cost_templates_is_active ON public.store_cost_templates(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.store_cost_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view templates from stores they belong to
DROP POLICY IF EXISTS "store_cost_templates_select_authenticated" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_select_authenticated" ON public.store_cost_templates
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(store_cost_templates.store_id)
  );

-- RLS Policy: Admin/manager/encargado can insert templates
DROP POLICY IF EXISTS "store_cost_templates_insert_roles" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_insert_roles" ON public.store_cost_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(store_cost_templates.store_id, ARRAY['admin', 'manager', 'encargado'])
  );

-- RLS Policy: Admin/manager/encargado can update templates
DROP POLICY IF EXISTS "store_cost_templates_update_roles" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_update_roles" ON public.store_cost_templates
  FOR UPDATE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(store_cost_templates.store_id, ARRAY['admin', 'manager', 'encargado'])
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(store_cost_templates.store_id, ARRAY['admin', 'manager', 'encargado'])
  );

-- RLS Policy: Only admin can delete templates
DROP POLICY IF EXISTS "store_cost_templates_delete_admin" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_delete_admin" ON public.store_cost_templates
  FOR DELETE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(store_cost_templates.store_id, ARRAY['admin'])
  );

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_store_cost_templates_updated_at ON public.store_cost_templates;
CREATE TRIGGER set_store_cost_templates_updated_at
  BEFORE UPDATE ON public.store_cost_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- RPC: upsert_store_cost_template
-- Atomic upsert: inserts or updates the template for a store in one operation.
-- Ensures only one active template per store (UNIQUE constraint on store_id).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.upsert_store_cost_template(
  p_store_id UUID,
  p_template_id TEXT,
  p_template_data JSONB,
  p_modalidad TEXT,
  p_pdf_format TEXT DEFAULT 'res148',
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado'])) THEN
    RAISE EXCEPTION 'Sin permisos para modificar la plantilla de esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida. Debe ser: produccion, servicios o comercializacion';
  END IF;

  -- Validate store exists
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o inactiva';
  END IF;

  INSERT INTO store_cost_templates (store_id, template_id, template_data, modalidad, pdf_format, created_by)
  VALUES (p_store_id, p_template_id, p_template_data, p_modalidad, p_pdf_format, p_created_by)
  ON CONFLICT (store_id)
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    template_data = EXCLUDED.template_data,
    modalidad = EXCLUDED.modalidad,
    pdf_format = EXCLUDED.pdf_format,
    is_active = true,
    updated_at = now()
  RETURNING jsonb_build_object(
    'id', id,
    'store_id', store_id,
    'template_id', template_id,
    'modalidad', modalidad,
    'pdf_format', pdf_format,
    'is_active', is_active,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.upsert_store_cost_template(UUID, TEXT, JSONB, TEXT, TEXT, UUID) IS
  'Atomic upsert for store cost template. Inserts or updates the default FC template for a store. SECURITY DEFINER for RLS bypass on service-role operations.';

GRANT EXECUTE ON FUNCTION public.upsert_store_cost_template(UUID, TEXT, JSONB, TEXT, TEXT, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_store_cost_template(UUID, TEXT, JSONB, TEXT, TEXT, UUID) FROM anon;
