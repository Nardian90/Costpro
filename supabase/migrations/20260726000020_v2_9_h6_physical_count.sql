-- ════════════════════════════════════════════════════════════════════════
-- V2.9 — H6: Conteo físico / Cycle count multi-tienda
--
-- Auditoría H6: "Sin conteo físico (cycle count) dedicado para multi-tienda.
-- Con inventario compartido entre tiendas vía transferencias, la falta de un
-- proceso de conteo regular hace que los errores sean más difíciles de detectar."
--
-- SOLUCIÓN:
-- 1. Tabla physical_counts (cabecera: store, fecha, estado, auditor)
-- 2. Tabla physical_count_items (productos contados + diferencia)
-- 3. RPC create_physical_count(p_store_id, p_user_id, p_items)
-- 4. RPC apply_physical_count(p_count_id) — aplica ajustes al inventario
-- 5. Vista v_physical_count_summary para dashboard
-- 6. RLS: solo miembros de la tienda pueden ver/crear
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabla physical_counts (cabecera)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.physical_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  count_number TEXT,  -- generado por trigger
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'counted', 'applied', 'voided')),
  -- draft: creado sin items
  -- in_progress: items cargados, contando
  -- counted: items contados, pendiente de aplicar
  -- applied: diferencias aplicadas al inventario (ajustes)
  -- voided: cancelado
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  started_by UUID REFERENCES public.profiles(id),
  completed_by UUID REFERENCES public.profiles(id),
  applied_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  total_items INTEGER DEFAULT 0,
  total_discrepancies INTEGER DEFAULT 0,
  total_value_discrepancy NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_store ON public.physical_counts(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_physical_counts_status ON public.physical_counts(status);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Tabla physical_count_items (productos contados)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.physical_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES public.physical_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Cantidades
  expected_quantity NUMERIC(12,4) NOT NULL DEFAULT 0,  -- stock_current al iniciar
  counted_quantity NUMERIC(12,4),  -- NULL = pendiente de contar
  difference NUMERIC(12,4) GENERATED ALWAYS AS (
    COALESCE(counted_quantity, 0) - expected_quantity
  ) STORED,
  -- Costo
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,  -- cost_average al contar
  value_discrepancy NUMERIC(15,2) GENERATED ALWAYS AS (
    (COALESCE(counted_quantity, 0) - expected_quantity) * unit_cost
  ) STORED,
  -- Metadatos
  counted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_physical_count_items_count ON public.physical_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_physical_count_items_product ON public.physical_count_items(product_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Trigger: generar count_number automático
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_generate_physical_count_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.count_number IS NULL THEN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.physical_counts
    WHERE store_id = NEW.store_id
      AND created_at >= date_trunc('year', NOW());
    NEW.count_number := 'PC-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(v_count::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_physical_count_number ON public.physical_counts;
CREATE TRIGGER trg_generate_physical_count_number
  BEFORE INSERT ON public.physical_counts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_generate_physical_count_number();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC: create_physical_count
--    Crea un conteo nuevo con todos los productos de la tienda y su stock actual
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_physical_count(
  p_store_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count_id UUID;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- Autorización
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Crear cabecera
  INSERT INTO public.physical_counts (
    store_id, status, started_at, started_by, notes
  ) VALUES (
    p_store_id, 'in_progress', NOW(), v_caller_uid, p_notes
  ) RETURNING id INTO v_count_id;

  -- Cargar todos los productos activos de la tienda con su stock actual
  INSERT INTO public.physical_count_items (count_id, product_id, expected_quantity, unit_cost)
  SELECT
    v_count_id,
    p.id,
    COALESCE(p.stock_current, 0),
    COALESCE(p.cost_average, 0)
  FROM public.products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true;

  -- Actualizar total_items
  UPDATE public.physical_counts
    SET total_items = (SELECT COUNT(*) FROM physical_count_items WHERE count_id = v_count_id)
    WHERE id = v_count_id;

  RETURN v_count_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_physical_count(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_physical_count(UUID, UUID, TEXT) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RPC: record_counted_quantity
--    Registra la cantidad contada para un item específico
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_counted_quantity(
  p_count_id UUID,
  p_product_id UUID,
  p_counted_quantity NUMERIC,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_store_id UUID;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT store_id INTO v_store_id FROM public.physical_counts WHERE id = p_count_id;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;

  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.physical_count_items
    SET counted_quantity = p_counted_quantity,
        counted_at = NOW(),
        notes = COALESCE(p_notes, notes)
    WHERE count_id = p_count_id AND product_id = p_product_id;

  RETURN jsonb_build_object('status', 'success', 'count_id', p_count_id, 'product_id', p_product_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_counted_quantity(UUID, UUID, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_counted_quantity(UUID, UUID, NUMERIC, UUID, TEXT) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RPC: apply_physical_count
--    Aplica las diferencias al inventario (ajustes) y marca como 'applied'
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_physical_count(
  p_count_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_apply_zero_diffs BOOLEAN DEFAULT FALSE  -- si TRUE, también ajusta items sin diferencia
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_applied INTEGER := 0;
  v_discrepancies INTEGER := 0;
  v_total_value NUMERIC := 0;
BEGIN
  SELECT * INTO v_count FROM public.physical_counts WHERE id = p_count_id FOR UPDATE;
  IF v_count IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;
  IF v_count.status != 'counted' AND v_count.status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATE: solo se pueden aplicar conteos en estado counted o in_progress';
  END IF;

  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Aplicar cada item con diferencia
  FOR v_item IN
    SELECT * FROM public.physical_count_items
    WHERE count_id = p_count_id
      AND counted_quantity IS NOT NULL
      AND (p_apply_zero_diffs OR difference != 0)
  LOOP
    -- Actualizar stock del producto
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_count.store_id;

    -- Registrar movimiento de stock
    -- V2.9: skip_access_check=TRUE porque ya validamos con has_store_access_as arriba
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_count.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.difference,
      p_movement_type := 'adjustment',
      p_unit_cost := v_item.unit_cost,
      p_reason := 'Conteo físico ' || v_count.count_number,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_applied := v_applied + 1;
    IF v_item.difference != 0 THEN
      v_discrepancies := v_discrepancies + 1;
      v_total_value := v_total_value + v_item.value_discrepancy;
    END IF;
  END LOOP;

  -- Marcar como aplicado
  UPDATE public.physical_counts
    SET status = 'applied',
        applied_at = NOW(),
        applied_by = v_caller_uid,
        total_discrepancies = v_discrepancies,
        total_value_discrepancy = v_total_value
    WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'count_id', p_count_id,
    'items_applied', v_applied,
    'discrepancies', v_discrepancies,
    'total_value_discrepancy', v_total_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_physical_count(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_physical_count(UUID, UUID, BOOLEAN) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. Vista para dashboard
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_physical_count_summary AS
SELECT
  pc.id,
  pc.store_id,
  pc.count_number,
  pc.status,
  pc.started_at,
  pc.applied_at,
  pc.total_items,
  pc.total_discrepancies,
  pc.total_value_discrepancy,
  s.name AS store_name,
  COUNT(pci.id) AS items_with_count,
  COUNT(pci.id) FILTER (WHERE pci.difference != 0) AS items_with_diff,
  SUM(pci.value_discrepancy) AS total_value_diff
FROM public.physical_counts pc
JOIN public.stores s ON s.id = pc.store_id
LEFT JOIN public.physical_count_items pci ON pci.count_id = pc.id
GROUP BY pc.id, s.name;

GRANT SELECT ON public.v_physical_count_summary TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RLS
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "physical_counts_store_isolation" ON public.physical_counts;
CREATE POLICY "physical_counts_store_isolation" ON public.physical_counts
  FOR ALL TO authenticated
  USING (public.has_store_access(store_id));

DROP POLICY IF EXISTS "physical_count_items_via_count" ON public.physical_count_items;
CREATE POLICY "physical_count_items_via_count" ON public.physical_count_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_counts pc
      WHERE pc.id = count_id AND public.has_store_access(pc.store_id)
    )
  );

NOTIFY pgrst, 'reload schema';
