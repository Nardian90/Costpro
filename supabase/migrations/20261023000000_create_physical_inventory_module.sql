-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO DE INVENTARIO FÍSICO — COSTPRO 4 Multitienda
-- ═══════════════════════════════════════════════════════════════════════════
-- Misión 2026-10-23: gestión de inventarios físicos por tienda y fecha de
-- corte, conciliación de diferencias y generación controlada de ajustes
-- documentales.
--
-- DECISIONES DE DISEÑO (basadas en auditoría de la arquitectura):
--   1. Tablas NUEVAS (physical_inventories*) — NO se reutiliza physical_counts
--      (existe pero está sin usar, sin alcance, sin ceguera, sin snapshot de
--      corte, sin vinculación con ajustes documentales ni versiones de hojas).
--   2. Los ajustes se generan como BORRADORES 'pending' en las tablas
--      EXISTENTES inventory_adjustments / inventory_adjustment_items, con la
--      nueva columna source_physical_inventory_id para trazabilidad. La
--      aplicación del stock SIEMPRE ocurre vía confirm_inventory_adjustment
--      (mecanismo oficial: register_stock_movement + trigger de kardex).
--   3. La existencia teórica a fecha de corte se congela en las líneas al
--      PREPARAR el inventario:
--        - corte reciente (>= now-5min): fuente = inventory.quantity
--        - corte histórico: fuente = Σ stock_movements.quantity_change
--          (created_at <= corte, orden canónico (created_at,id) — mismo
--          patrón que useProductKardex). Si el ledger presente deriva
--          respecto a inventory (Σtotal ≠ inventory.quantity) la línea se
--          marca theoretical_source='ledger_drift' y la conciliación lo
--          advierte — NO se inventa el saldo histórico.
--   4. Conteo ciego REAL a nivel BD: en blind_mode, la policy SELECT de
--      physical_inventory_items EXCLUYE a roles sin privilegio; los
--      contadores acceden vía get_physical_inventory_count_lines() que
--      omite las columnas teóricas.
--   5. Concurrencia: bloqueo optimista por línea (updated_at esperado) en
--      record_physical_inventory_counts; version del header se incrementa
--      en cada UPDATE mediante trigger.
--   6. Indicadores del header SIEMPRE recalculados desde las líneas por
--      trigger (nunca valores manuales).
--   7. Transiciones de estado validadas por trigger (patrón
--      fn_validate_document_transition existente).
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.physical_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  pi_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'prepared', 'in_progress', 'counted',
      'in_reconciliation', 'pending_authorization', 'conciliated',
      'closed', 'voided'
    )),
  cutoff_date TIMESTAMPTZ NOT NULL,
  description TEXT,
  responsible_name TEXT,
  scope_type TEXT NOT NULL DEFAULT 'full'
    CHECK (scope_type IN ('full', 'category', 'selection')),
  scope_category_names TEXT[],
  scope_products UUID[],
  blind_mode BOOLEAN NOT NULL DEFAULT false,
  observations TEXT,
  snapshot_meta JSONB,
  -- Indicadores derivados (mantenidos por trigger — nunca manuales)
  total_items INTEGER NOT NULL DEFAULT 0,
  counted_items INTEGER NOT NULL DEFAULT 0,
  pending_items INTEGER NOT NULL DEFAULT 0,
  shortfall_items INTEGER NOT NULL DEFAULT 0,
  surplus_items INTEGER NOT NULL DEFAULT 0,
  -- Auditoría de momentos (NO confundir: corte ≠ creación ≠ conteo ≠ …)
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  count_started_at TIMESTAMPTZ,
  count_started_by UUID REFERENCES public.profiles(id),
  count_completed_at TIMESTAMPTZ,
  count_completed_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES public.profiles(id),
  authorized_at TIMESTAMPTZ,
  authorized_by UUID REFERENCES public.profiles(id),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  tenant_id UUID
);

COMMENT ON TABLE public.physical_inventories IS
'Inventario físico por tienda: cabecera documental con ciclo draft→prepared→in_progress→counted→in_reconciliation→pending_authorization→conciliated→closed (+voided). La existencia teórica corresponde a cutoff_date y se congela en las líneas al preparar.';

CREATE INDEX IF NOT EXISTS idx_physical_inventories_store_created
  ON public.physical_inventories (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_physical_inventories_status
  ON public.physical_inventories (status);

ALTER TABLE public.physical_inventories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.physical_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.physical_inventories(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  -- Instantánea congelada de la existencia teórica a cutoff_date
  theoretical_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
  theoretical_unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  theoretical_source TEXT NOT NULL DEFAULT 'inventory'
    CHECK (theoretical_source IN ('inventory', 'ledger', 'ledger_drift')),
  -- Conteo físico: NULL = pendiente (vacío ≠ cero)
  counted_qty NUMERIC(12,4),
  difference NUMERIC(12,4) GENERATED ALWAYS AS
    (COALESCE(counted_qty, 0) - theoretical_qty) STORED,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'counted', 'review')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  counted_by UUID REFERENCES public.profiles(id),
  counted_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pi_id, product_id),
  UNIQUE (pi_id, line_number)
);

COMMENT ON COLUMN public.physical_inventory_items.counted_qty IS
'Cantidad física contada. NULL = pendiente de contar (un campo vacío NO equivale a cero); 0 = contado explícitamente en cero.';

CREATE INDEX IF NOT EXISTS idx_physical_inventory_items_pi
  ON public.physical_inventory_items (pi_id);
CREATE INDEX IF NOT EXISTS idx_physical_inventory_items_product
  ON public.physical_inventory_items (product_id);

ALTER TABLE public.physical_inventory_items ENABLE ROW LEVEL SECURITY;

-- Historial de capturas: quién contó, cuándo, valor anterior y nuevo
CREATE TABLE IF NOT EXISTS public.physical_inventory_count_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.physical_inventories(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.physical_inventory_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('count', 'clear', 'import', 'review')),
  old_counted_qty NUMERIC(12,4),
  new_counted_qty NUMERIC(12,4),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'excel')),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_count_log_pi
  ON public.physical_inventory_count_log (pi_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pi_count_log_item
  ON public.physical_inventory_count_log (item_id);

ALTER TABLE public.physical_inventory_count_log ENABLE ROW LEVEL SECURITY;

-- Versiones de hojas de conteo generadas (PDF) — auditoría
CREATE TABLE IF NOT EXISTS public.physical_inventory_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.physical_inventories(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('with_theoretical', 'blind')),
  total_lines INTEGER NOT NULL DEFAULT 0,
  filter_summary JSONB,
  generated_by UUID NOT NULL REFERENCES public.profiles(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pi_id, seq)
);

ALTER TABLE public.physical_inventory_sheets ENABLE ROW LEVEL SECURITY;

-- Vínculo PI ↔ ajustes documentales generados (faltantes / sobrantes)
CREATE TABLE IF NOT EXISTS public.physical_inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.physical_inventories(id),
  adjustment_id UUID NOT NULL REFERENCES public.inventory_adjustments(id),
  kind TEXT NOT NULL CHECK (kind IN ('shortfall', 'surplus')),
  items_count INTEGER NOT NULL DEFAULT 0,
  generated_by UUID NOT NULL REFERENCES public.profiles(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pi_id, adjustment_id),
  UNIQUE (pi_id, kind)
);

ALTER TABLE public.physical_inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- Trazabilidad documental persistida: el ajuste recuerda su inventario origen
ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS source_physical_inventory_id UUID
  REFERENCES public.physical_inventories(id);

-- Fix de alcance por categoría: la app opera con la columna TEXTO products.category
-- (category_id está vacío en producción). Idempotente para despliegues repetidos.
ALTER TABLE public.physical_inventories DROP COLUMN IF EXISTS scope_categories;
ALTER TABLE public.physical_inventories ADD COLUMN IF NOT EXISTS scope_category_names TEXT[];

COMMENT ON COLUMN public.inventory_adjustments.source_physical_inventory_id IS
'Referencia persistida al inventario físico que originó este ajuste (permite la etiqueta «Ajuste por inventario físico» verificable, sin depender de texto manual).';

CREATE INDEX IF NOT EXISTS idx_inv_adjustments_source_pi
  ON public.inventory_adjustments (source_physical_inventory_id)
  WHERE source_physical_inventory_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────

-- 2.1 Numeración IF-YYYY-##### por tienda y año (patrón PC- de physical_counts)
CREATE OR REPLACE FUNCTION public.fn_generate_pi_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.pi_number IS NULL THEN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.physical_inventories
    WHERE store_id = NEW.store_id
      AND created_at >= date_trunc('year', NOW());
    NEW.pi_number := 'IF-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(v_count::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_pi_number ON public.physical_inventories;
CREATE TRIGGER trg_generate_pi_number
  BEFORE INSERT ON public.physical_inventories
  FOR EACH ROW EXECUTE FUNCTION public.fn_generate_pi_number();

-- 2.2 Transiciones de estado válidas (patrón fn_validate_document_transition)
CREATE OR REPLACE FUNCTION public.fn_validate_pi_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_valid JSONB := '{
    "draft":               ["prepared","voided"],
    "prepared":            ["in_progress","voided"],
    "in_progress":         ["counted","voided"],
    "counted":             ["in_reconciliation","voided"],
    "in_reconciliation":   ["pending_authorization","voided"],
    "pending_authorization":["conciliated","in_reconciliation","voided"],
    "conciliated":         ["closed"],
    "closed":              [],
    "voided":               []
  }'::jsonb;
BEGIN
  IF OLD.status IS NULL OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE((v_valid -> OLD.status) ? NEW.status, false) THEN
    RAISE EXCEPTION 'ERR_INVALID_PI_TRANSITION: el inventario físico no puede pasar de % a %',
      OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- 2.3 Indicadores SIEMPRE derivados de las líneas + version optimistic-lock
--     (evita que un UPDATE manual falsee los contadores del header)
CREATE OR REPLACE FUNCTION public.fn_pi_recalc_and_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total INT; v_counted INT; v_pending INT; v_short INT; v_surplus INT;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE counted_qty IS NOT NULL),
         COUNT(*) FILTER (WHERE counted_qty IS NULL),
         COUNT(*) FILTER (WHERE counted_qty IS NOT NULL AND COALESCE(counted_qty,0) < theoretical_qty),
         COUNT(*) FILTER (WHERE counted_qty IS NOT NULL AND COALESCE(counted_qty,0) > theoretical_qty)
    INTO v_total, v_counted, v_pending, v_short, v_surplus
  FROM public.physical_inventory_items WHERE pi_id = NEW.id;

  NEW.total_items     := v_total;
  NEW.counted_items   := v_counted;
  NEW.pending_items   := v_pending;
  NEW.shortfall_items := v_short;
  NEW.surplus_items   := v_surplus;
  NEW.version         := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pi_transition ON public.physical_inventories;
CREATE TRIGGER trg_validate_pi_transition
  BEFORE UPDATE OF status ON public.physical_inventories
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pi_transition();

DROP TRIGGER IF EXISTS trg_pi_recalc_and_guard ON public.physical_inventories;
CREATE TRIGGER trg_pi_recalc_and_guard
  BEFORE UPDATE ON public.physical_inventories
  FOR EACH ROW EXECUTE FUNCTION public.fn_pi_recalc_and_guard();

-- 2.4 Al cambiar una línea, refrescar los indicadores del header
--     (UPDATE mínimo: el BEFORE UPDATE del header recalcula todo)
CREATE OR REPLACE FUNCTION public.fn_touch_pi_on_item_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.physical_inventories
    SET version = version
  WHERE id = COALESCE(NEW.pi_id, OLD.pi_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_pi_on_item_change ON public.physical_inventory_items;
CREATE TRIGGER trg_touch_pi_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.physical_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_pi_on_item_change();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RPCs — CICLO DE VIDA DEL INVENTARIO FÍSICO
--    Patrón de caller: service_role pasa p_user_id; usuario final usa auth.uid()
-- ──────────────────────────────────────────────────────────────────────────

-- 3.1 Crear inventario físico (borrador)
--     (DROP del overload legacy con p_categories UUID[]: el alcance por
--      categoría usa nombres de texto — products.category)
DROP FUNCTION IF EXISTS public.create_physical_inventory(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID[], UUID[], BOOLEAN, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.create_physical_inventory(
  p_store_id UUID,
  p_cutoff_date TIMESTAMPTZ,
  p_description TEXT DEFAULT NULL,
  p_responsible_name TEXT DEFAULT NULL,
  p_scope_type TEXT DEFAULT 'full',
  p_categories TEXT[] DEFAULT NULL,
  p_product_ids UUID[] DEFAULT NULL,
  p_blind_mode BOOLEAN DEFAULT false,
  p_observations TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pi_id UUID;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT public.has_store_role(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_CREATE_PI';
  END IF;
  IF p_cutoff_date IS NULL OR p_cutoff_date > NOW() THEN
    RAISE EXCEPTION 'ERR_INVALID_CUTOFF_DATE: la fecha de corte no puede ser futura';
  END IF;
  IF p_scope_type NOT IN ('full','category','selection') THEN
    RAISE EXCEPTION 'ERR_INVALID_SCOPE';
  END IF;
  IF p_scope_type = 'category' AND (p_categories IS NULL OR array_length(p_categories, 1) = 0) THEN
    RAISE EXCEPTION 'ERR_SCOPE_CATEGORIES_REQUIRED';
  END IF;
  IF p_scope_type = 'selection' AND (p_product_ids IS NULL OR array_length(p_product_ids, 1) = 0) THEN
    RAISE EXCEPTION 'ERR_SCOPE_PRODUCTS_REQUIRED';
  END IF;

  INSERT INTO public.physical_inventories (
    store_id, cutoff_date, description, responsible_name,
    scope_type, scope_category_names, scope_products, blind_mode, observations, created_by
  ) VALUES (
    p_store_id, p_cutoff_date, p_description, p_responsible_name,
    p_scope_type, p_categories, p_product_ids, p_blind_mode, p_observations, v_caller_uid
  ) RETURNING id INTO v_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_CREATED', 'physical_inventories', v_pi_id,
          jsonb_build_object('pi_number', (SELECT pi_number FROM public.physical_inventories WHERE id = v_pi_id),
                             'cutoff_date', p_cutoff_date, 'scope_type', p_scope_type,
                             'blind_mode', p_blind_mode), p_store_id);

  RETURN v_pi_id;
END;
$$;

-- 3.2 Preparar: genera las líneas y congela la existencia teórica a la fecha de corte
CREATE OR REPLACE FUNCTION public.prepare_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_recent BOOLEAN;
  v_drift_count INTEGER := 0;
  v_source_text TEXT;
  v_inserted INTEGER;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo un borrador puede prepararse (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_PREPARE_PI';
  END IF;

  -- ¿El corte es "ahora"? (ventana de 5 min) → usar inventory (fuente primaria).
  v_recent := v_pi.cutoff_date >= NOW() - INTERVAL '5 minutes';

  -- Generación de líneas con instantánea de existencias teóricas:
  --  * corte reciente: inventory.quantity (primary truth model)
  --  * corte histórico: Σ stock_movements.quantity_change (created_at <= corte)
  --    + verificación de coherencia ledger↔inventory (drift → advertencia)
  INSERT INTO public.physical_inventory_items (
    pi_id, line_number, product_id,
    theoretical_qty, theoretical_unit_cost, theoretical_source
  )
  SELECT
    p_pi_id,
    ROW_NUMBER() OVER (ORDER BY p.name, p.sku NULLS LAST),
    p.id,
    CASE WHEN v_recent THEN COALESCE(inv.quantity, 0)
         ELSE COALESCE(ms.sum_cutoff, 0) END::numeric,
    COALESCE(p.cost_average, 0)::numeric,
    CASE WHEN v_recent THEN 'inventory'
         WHEN ROUND(COALESCE(ms.sum_now, 0)::numeric, 4) = ROUND(COALESCE(inv.quantity, 0)::numeric, 4)
           THEN 'ledger'
         ELSE 'ledger_drift' END
  FROM public.products p
  LEFT JOIN public.inventory inv
    ON inv.product_id = p.id AND inv.store_id = v_pi.store_id
  LEFT JOIN LATERAL (
    SELECT SUM(sm.quantity_change) FILTER (WHERE sm.created_at <= v_pi.cutoff_date) AS sum_cutoff,
           SUM(sm.quantity_change) AS sum_now
    FROM public.stock_movements sm
    WHERE sm.product_id = p.id AND sm.store_id = v_pi.store_id
  ) ms ON TRUE
  WHERE p.store_id = v_pi.store_id
    AND p.is_active = true
    AND COALESCE(p.is_service, false) = false
    AND (v_pi.scope_type = 'full'
         OR (v_pi.scope_type = 'category' AND p.category = ANY(v_pi.scope_category_names))
         OR (v_pi.scope_type = 'selection' AND p.id = ANY(v_pi.scope_products)));

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_SCOPE: el alcance no incluye ningún producto activo de la tienda';
  END IF;

  SELECT COUNT(*) INTO v_drift_count
  FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND theoretical_source = 'ledger_drift';

  v_source_text := CASE WHEN v_recent THEN 'inventory' ELSE 'ledger' END;
  UPDATE public.physical_inventories
    SET status = 'prepared',
        snapshot_meta = jsonb_build_object(
          'prepared_at', NOW(),
          'prepared_by', v_caller_uid,
          'cutoff_date', v_pi.cutoff_date,
          'theoretical_method', v_source_text,
          'ledger_drift_products', v_drift_count,
          'lines_generated', v_inserted
        )
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_PREPARED', 'physical_inventories', p_pi_id,
          jsonb_build_object('lines', v_inserted, 'method', v_source_text,
                             'drift_products', v_drift_count), v_pi.store_id);

  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id,
                            'lines', v_inserted, 'ledger_drift_products', v_drift_count,
                            'theoretical_method', v_source_text);
END;
$$;

-- 3.3 Iniciar el conteo
CREATE OR REPLACE FUNCTION public.start_physical_inventory_count(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'prepared' THEN
    RAISE EXCEPTION 'ERR_NOT_PREPARED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'in_progress', count_started_at = NOW(), count_started_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_COUNT_STARTED', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'in_progress');
END;
$$;

-- 3.4 Registrar cantidades contadas (lote, con bloqueo optimista por línea)
--     p_items: [{"item_id": uuid, "counted_qty": number|null,
--                "expected_updated_at": timestamptz|null}]
CREATE OR REPLACE FUNCTION public.record_physical_inventory_counts(
  p_pi_id UUID,
  p_items JSONB,
  p_source TEXT DEFAULT 'manual',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item public.physical_inventory_items%ROWTYPE;
  v_elem JSONB;
  v_item_id UUID; v_qty NUMERIC; v_expected_ts TIMESTAMPTZ;
  v_applied INT := 0;
  v_conflicts JSONB := '[]'::jsonb;
  v_not_found JSONB := '[]'::jsonb;
  v_invalid JSONB := '[]'::jsonb;
  v_new_status TEXT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_source NOT IN ('manual','excel') THEN RAISE EXCEPTION 'ERR_INVALID_SOURCE'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_progress' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTING: el conteo solo puede registrarse en estado in_progress (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_elem->>'item_id')::uuid;
    v_expected_ts := NULLIF(v_elem->>'expected_updated_at','')::timestamptz;
    BEGIN
      v_qty := CASE WHEN jsonb_typeof(v_elem->'counted_qty') = 'null' OR (v_elem->>'counted_qty') = ''
                    THEN NULL ELSE (v_elem->>'counted_qty')::numeric END;
    EXCEPTION WHEN OTHERS THEN
      v_invalid := v_invalid || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_QTY_NOT_NUMERIC');
      CONTINUE;
    END;

    SELECT * INTO v_item FROM public.physical_inventory_items
    WHERE id = v_item_id AND pi_id = p_pi_id FOR UPDATE;

    IF v_item IS NULL OR v_item.id IS NULL THEN
      v_not_found := v_not_found || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_ITEM_NOT_IN_PI');
      CONTINUE;
    END IF;

    -- Bloqueo optimista: si otro usuario contó esta línea desde que el
    -- cliente la cargó, NO se sobrescribe silenciosamente → conflicto 409.
    IF v_expected_ts IS NOT NULL AND v_item.updated_at <> v_expected_ts AND v_item.counted_at IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'item_id', v_item_id,
        'error', 'ERR_CONCURRENT_UPDATE',
        'current_counted_qty', v_item.counted_qty,
        'current_counted_by', v_item.counted_by,
        'current_updated_at', v_item.updated_at);
      CONTINUE;
    END IF;

    IF v_qty IS NOT NULL AND v_qty < 0 THEN
      v_invalid := v_invalid || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_QTY_NEGATIVE');
      CONTINUE;
    END IF;

    v_new_status := CASE WHEN v_qty IS NULL THEN 'pending' ELSE 'counted' END;
    UPDATE public.physical_inventory_items
      SET counted_qty = v_qty,
          status = v_new_status,
          counted_by = CASE WHEN v_qty IS NULL THEN NULL ELSE v_caller_uid END,
          counted_at = CASE WHEN v_qty IS NULL THEN NULL ELSE NOW() END,
          updated_by = v_caller_uid,
          updated_at = NOW()
    WHERE id = v_item_id;

    INSERT INTO public.physical_inventory_count_log (
      pi_id, item_id, product_id, action, old_counted_qty, new_counted_qty, source, user_id)
    VALUES (
      p_pi_id, v_item_id, v_item.product_id,
      CASE WHEN v_qty IS NULL THEN 'clear' WHEN p_source = 'excel' THEN 'import' ELSE 'count' END,
      v_item.counted_qty, v_qty, p_source, v_caller_uid);

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success', 'pi_id', p_pi_id,
    'applied', v_applied,
    'conflicts', v_conflicts, 'not_found', v_not_found, 'invalid', v_invalid
  );
END;
$$;

-- 3.5 Completar el conteo (admite líneas pendientes solo con aceptación explícita)
CREATE OR REPLACE FUNCTION public.complete_physical_inventory_count(
  p_pi_id UUID,
  p_accept_pending BOOLEAN DEFAULT false,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_progress' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTING (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;

  SELECT COUNT(*) INTO v_pending FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND counted_qty IS NULL;

  IF v_pending > 0 AND NOT p_accept_pending THEN
    RAISE EXCEPTION 'ERR_PENDING_LINES: quedan % línea(s) sin contar; registre su cantidad física (incluido cero) o confirme la aceptación explícita', v_pending;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'counted', count_completed_at = NOW(), count_completed_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_COUNT_COMPLETED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pending_lines', v_pending, 'accepted_pending', p_accept_pending), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'pending_lines', v_pending);
END;
$$;

-- 3.6 Enviar a conciliación (exige TODO contado)
CREATE OR REPLACE FUNCTION public.submit_physical_inventory_reconciliation(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'counted' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_RECONCILE';
  END IF;
  SELECT COUNT(*) INTO v_pending FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND counted_qty IS NULL;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'ERR_PENDING_LINES: un inventario con líneas pendientes no puede conciliarse (% pendientes)', v_pending;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'in_reconciliation', submitted_at = NOW(), submitted_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_RECONCILIATION_STARTED', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'in_reconciliation');
END;
$$;

-- 3.7 Registrar revisión de una línea (motivo/explicación de la diferencia)
CREATE OR REPLACE FUNCTION public.review_physical_inventory_item(
  p_pi_id UUID,
  p_item_id UUID,
  p_review_notes TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status NOT IN ('in_reconciliation','pending_authorization') THEN
    RAISE EXCEPTION 'ERR_NOT_IN_RECONCILIATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_REVIEW';
  END IF;

  UPDATE public.physical_inventory_items
    SET review_notes = p_review_notes, status = 'review',
        reviewed_by = v_caller_uid, reviewed_at = NOW(),
        updated_by = v_caller_uid, updated_at = NOW()
  WHERE id = p_item_id AND pi_id = p_pi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ITEM_NOT_IN_PI'; END IF;

  INSERT INTO public.physical_inventory_count_log (
    pi_id, item_id, product_id, action, old_counted_qty, new_counted_qty, source, user_id)
  SELECT p_pi_id, p_item_id, product_id, 'review', counted_qty, counted_qty, 'manual', v_caller_uid
  FROM public.physical_inventory_items WHERE id = p_item_id;

  RETURN jsonb_build_object('status', 'success', 'item_id', p_item_id);
END;
$$;

-- 3.8 Enviar a autorización (después de la revisión de diferencias)
CREATE OR REPLACE FUNCTION public.submit_physical_inventory_authorization(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_reconciliation' THEN
    RAISE EXCEPTION 'ERR_NOT_IN_RECONCILIATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_SUBMIT';
  END IF;

  UPDATE public.physical_inventories SET status = 'pending_authorization' WHERE id = p_pi_id;
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_SUBMITTED_FOR_AUTHORIZATION', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'pending_authorization');
END;
$$;

-- 3.9 GENERAR AJUSTES DOCUMENTALES desde el inventario físico autorizado.
--     Regla fundamental: aquí NO se modifica stock — se crean BORRADORES
--     'pending' en inventory_adjustments (flujo documental EXISTENTE) que
--     luego se confirman/aplican/revierten con las RPC oficiales.
--     Por línea: expected = saldo ACTUAL (locked) del kardex operativo,
--     counted = cantidad física → tras confirmar, el stock queda = contado.
--     Para productos sin movimientos post-corte, expected = teórico del
--     corte y la diferencia documental == diferencia física del conteo.
CREATE OR REPLACE FUNCTION public.generate_adjustments_from_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_line RECORD;
  v_adj_id UUID;
  v_expected NUMERIC;
  v_short_count INT := 0;
  v_surplus_count INT := 0;
  v_adj_short_id UUID;
  v_adj_surplus_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'pending_authorization' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING_AUTHORIZATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_GENERATE_ADJUSTMENTS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.physical_inventory_adjustments WHERE pi_id = p_pi_id) THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_ALREADY_GENERATED';
  END IF;

  -- 3.9.a Documento de FALTANTES (salida por STOCKTAKE_SHRINKAGE)
  FOR v_line IN
    SELECT i.*, p.sku, p.name
    FROM public.physical_inventory_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.pi_id = p_pi_id
      AND i.counted_qty IS NOT NULL
      AND COALESCE(i.counted_qty, 0) < i.theoretical_qty
    ORDER BY i.line_number
  LOOP
    SELECT COALESCE(inv.quantity, 0) INTO v_current_stock
    FROM public.inventory inv
    WHERE inv.product_id = v_line.product_id AND inv.store_id = v_pi.store_id
    FOR UPDATE;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    IF v_adj_short_id IS NULL THEN
      INSERT INTO public.inventory_adjustments (
        store_id, created_by, status, reason, notes, source_physical_inventory_id
      ) VALUES (
        v_pi.store_id, v_caller_uid, 'pending', 'STOCKTAKE_SHRINKAGE',
        'Faltantes del inventario físico ' || v_pi.pi_number, p_pi_id
      ) RETURNING id INTO v_adj_short_id;
    END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_adj_short_id, v_line.product_id, v_current_stock, v_line.counted_qty
    );
    v_short_count := v_short_count + 1;
  END LOOP;

  -- 3.9.b Documento de SOBRANTES (entrada por STOCKTAKE_SURPLUS)
  FOR v_line IN
    SELECT i.*, p.sku, p.name
    FROM public.physical_inventory_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.pi_id = p_pi_id
      AND i.counted_qty IS NOT NULL
      AND COALESCE(i.counted_qty, 0) > i.theoretical_qty
    ORDER BY i.line_number
  LOOP
    SELECT COALESCE(inv.quantity, 0) INTO v_current_stock
    FROM public.inventory inv
    WHERE inv.product_id = v_line.product_id AND inv.store_id = v_pi.store_id
    FOR UPDATE;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    IF v_adj_surplus_id IS NULL THEN
      INSERT INTO public.inventory_adjustments (
        store_id, created_by, status, reason, notes, source_physical_inventory_id
      ) VALUES (
        v_pi.store_id, v_caller_uid, 'pending', 'STOCKTAKE_SURPLUS',
        'Sobrantes del inventario físico ' || v_pi.pi_number, p_pi_id
      ) RETURNING id INTO v_adj_surplus_id;
    END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_adj_surplus_id, v_line.product_id, v_current_stock, v_line.counted_qty
    );
    v_surplus_count := v_surplus_count + 1;
  END LOOP;

  -- 3.9.c Vínculos PI ↔ documentos + conciliación del inventario
  IF v_adj_short_id IS NOT NULL THEN
    INSERT INTO public.physical_inventory_adjustments (pi_id, adjustment_id, kind, items_count, generated_by)
    VALUES (p_pi_id, v_adj_short_id, 'shortfall', v_short_count, v_caller_uid);
  END IF;
  IF v_adj_surplus_id IS NOT NULL THEN
    INSERT INTO public.physical_inventory_adjustments (pi_id, adjustment_id, kind, items_count, generated_by)
    VALUES (p_pi_id, v_adj_surplus_id, 'surplus', v_surplus_count, v_caller_uid);
  END IF;

  UPDATE public.physical_inventories
    SET status = 'conciliated', authorized_at = NOW(), authorized_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_ADJUSTMENTS_GENERATED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number,
                             'shortfall_adjustment_id', v_adj_short_id,
                             'shortfall_items', v_short_count,
                             'surplus_adjustment_id', v_adj_surplus_id,
                             'surplus_items', v_surplus_count), v_pi.store_id);

  RETURN jsonb_build_object(
    'status', 'success', 'pi_id', p_pi_id, 'new_status', 'conciliated',
    'shortfall_adjustment_id', v_adj_short_id, 'shortfall_items', v_short_count,
    'surplus_adjustment_id', v_adj_surplus_id, 'surplus_items', v_surplus_count
  );
END;
$$;

-- 3.10 Cerrar (exige que los ajustes vinculados NO estén pendientes)
CREATE OR REPLACE FUNCTION public.close_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending_adj INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'conciliated' THEN
    RAISE EXCEPTION 'ERR_NOT_CONCILIATED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_CLOSE';
  END IF;

  SELECT COUNT(*) INTO v_pending_adj
  FROM public.physical_inventory_adjustments l
  JOIN public.inventory_adjustments a ON a.id = l.adjustment_id
  WHERE l.pi_id = p_pi_id AND a.status = 'pending';

  IF v_pending_adj > 0 THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_PENDING: hay % ajuste(s) pendiente(s) de confirmar; el inventario no puede cerrarse', v_pending_adj;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'closed', closed_at = NOW(), closed_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_CLOSED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'closed');
END;
$$;

-- 3.11 Anular (solo antes de conciliar; un inventario conciliado/cerrado se
--      rectifica revirtiendo los ajustes, nunca reescribiendo la historia)
CREATE OR REPLACE FUNCTION public.void_physical_inventory(
  p_pi_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_VOID_REASON_REQUIRED';
  END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status IN ('conciliated','closed','voided') THEN
    RAISE EXCEPTION 'ERR_CANNOT_VOID_STATE: un inventario % no puede anularse; utilice la reversión de los ajustes generados', v_pi.status;
  END IF;
  IF NOT public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_VOID';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'voided', voided_at = NOW(), voided_by = v_caller_uid, void_reason = p_reason
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_VOIDED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number, 'reason', p_reason,
                             'previous_status', v_pi.status), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'voided');
END;
$$;

-- 3.12 Líneas para el conteo — SEGURO PARA CONTEO CIEGO:
--      en blind_mode los roles sin privilego (clerk/warehouse/usuario)
--      reciben las líneas SIN theoretical_qty / difference / theoretical_source.
--      (La policy SELECT de physical_inventory_items les niega el acceso
--      directo a la tabla; esta RPC es su única vía.)
CREATE OR REPLACE FUNCTION public.get_physical_inventory_count_lines(
  p_pi_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := auth.uid();
  v_privileged BOOLEAN;
  v_lines JSONB;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;

  v_privileged := public.is_admin()
    OR public.has_store_role(v_pi.store_id, ARRAY['admin','manager','encargado']::text[]);

  IF NOT v_privileged
     AND NOT public.has_store_role(v_pi.store_id,
          ARRAY['warehouse','clerk','usuario','costo']::text[]) THEN
    RAISE EXCEPTION 'ERR_NO_STORE_ACCESS';
  END IF;

  IF v_pi.blind_mode AND NOT v_privileged THEN
    SELECT COALESCE(jsonb_agg(ROW_TO_JSON(t) ORDER BY t.line_number), '[]'::jsonb) INTO v_lines
    FROM (
      SELECT i.id, i.line_number, i.product_id, p.sku, p.name,
             COALESCE(p.unit_of_measure, '') AS unit,
             i.counted_qty, i.status, i.updated_at, i.counted_at
      FROM public.physical_inventory_items i
      JOIN public.products p ON p.id = i.product_id
      WHERE i.pi_id = p_pi_id
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(ROW_TO_JSON(t) ORDER BY t.line_number), '[]'::jsonb) INTO v_lines
    FROM (
      SELECT i.id, i.line_number, i.product_id, p.sku, p.name,
             COALESCE(p.unit_of_measure, '') AS unit,
             i.theoretical_qty, i.theoretical_source, i.counted_qty,
             i.difference, i.status, i.review_notes, i.updated_at, i.counted_at
      FROM public.physical_inventory_items i
      JOIN public.products p ON p.id = i.product_id
      WHERE i.pi_id = p_pi_id
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'pi_id', p_pi_id,
    'pi_number', v_pi.pi_number,
    'status', v_pi.status,
    'blind_mode', v_pi.blind_mode,
    'show_theoretical', (NOT v_pi.blind_mode OR v_privileged),
    'lines', v_lines
  );
END;
$$;

-- 3.13 Resumen de conciliación (roles privilegiados): líneas + movimientos
--      posteriores al corte (transparencia para la regla de conciliación
--      temporal) + totales.
CREATE OR REPLACE FUNCTION public.get_physical_inventory_reconciliation(
  p_pi_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := auth.uid();
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;

  IF NOT (public.is_admin()
          OR public.has_store_role(v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_RECONCILIATION';
  END IF;

  RETURN jsonb_build_object(
    'pi', to_jsonb(v_pi),
    'lines', (
      SELECT COALESCE(jsonb_agg(ROW_TO_JSON(t) ORDER BY t.line_number), '[]'::jsonb)
      FROM (
        SELECT i.id, i.line_number, i.product_id, p.sku, p.name, p.category,
               COALESCE(p.unit_of_measure, '') AS unit,
               i.theoretical_qty, i.theoretical_source, i.counted_qty, i.difference,
               i.theoretical_unit_cost,
               ROUND((i.difference * i.theoretical_unit_cost)::numeric, 2) AS difference_value,
               i.status, i.review_notes, i.reviewed_by, i.counted_by, i.counted_at,
               (SELECT COUNT(*)::int FROM public.stock_movements sm
                WHERE sm.product_id = i.product_id AND sm.store_id = v_pi.store_id
                  AND sm.created_at > v_pi.cutoff_date) AS post_cutoff_movements,
               (SELECT COALESCE(SUM(sm.quantity_change), 0)
                FROM public.stock_movements sm
                WHERE sm.product_id = i.product_id AND sm.store_id = v_pi.store_id
                  AND sm.created_at > v_pi.cutoff_date) AS post_cutoff_net
        FROM public.physical_inventory_items i
        JOIN public.products p ON p.id = i.product_id
        WHERE i.pi_id = p_pi_id
      ) t
    ),
    'totals', (
      SELECT jsonb_build_object(
        'total_items', COUNT(*),
        'counted', COUNT(*) FILTER (WHERE counted_qty IS NOT NULL),
        'pending', COUNT(*) FILTER (WHERE counted_qty IS NULL),
        'match', COUNT(*) FILTER (WHERE counted_qty IS NOT NULL AND COALESCE(counted_qty,0) = theoretical_qty),
        'shortfall', COUNT(*) FILTER (WHERE counted_qty IS NOT NULL AND COALESCE(counted_qty,0) < theoretical_qty),
        'surplus', COUNT(*) FILTER (WHERE counted_qty IS NOT NULL AND COALESCE(counted_qty,0) > theoretical_qty),
        'drift', COUNT(*) FILTER (WHERE theoretical_source = 'ledger_drift'),
        'post_cutoff_affected', COUNT(*) FILTER (
          WHERE EXISTS (SELECT 1 FROM public.stock_movements sm
                        WHERE sm.product_id = physical_inventory_items.product_id
                          AND sm.store_id = v_pi.store_id
                          AND sm.created_at > v_pi.cutoff_date))
      )
      FROM public.physical_inventory_items WHERE pi_id = p_pi_id
    )
  );
END;
$$;

-- 3.14 Registrar versión de hoja de conteo generada (auditoría de PDFs)
CREATE OR REPLACE FUNCTION public.register_physical_inventory_sheet(
  p_pi_id UUID,
  p_mode TEXT,
  p_total_lines INTEGER,
  p_filter_summary JSONB DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_seq INTEGER;
  v_id UUID;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_mode NOT IN ('with_theoretical','blind') THEN RAISE EXCEPTION 'ERR_INVALID_SHEET_MODE'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF NOT (public.is_admin()
          OR public.has_store_role(v_pi.store_id,
              ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_SHEET';
  END IF;
  -- En conteo ciego, la hoja con existencias solo puede generarla un rol privilegiado
  IF p_mode = 'with_theoretical' AND v_pi.blind_mode
     AND NOT (public.is_admin()
              OR public.has_store_role(v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_BLIND_MODE_THEORETICAL_FORBIDDEN';
  END IF;

  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
  FROM public.physical_inventory_sheets WHERE pi_id = p_pi_id;

  INSERT INTO public.physical_inventory_sheets (pi_id, seq, mode, total_lines, filter_summary, generated_by)
  VALUES (p_pi_id, v_seq, p_mode, p_total_lines, p_filter_summary, v_caller_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'success', 'sheet_id', v_id, 'seq', v_seq, 'mode', p_mode);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. confirm_inventory_adjustment — enriquecido con referencia al PI origen
--    (idéntico comportamiento; el motivo del movimiento en el kardex cita
--     el número del inventario físico cuando procede de uno)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_stock NUMERIC;
  v_count INTEGER := 0;
  v_pi_number TEXT;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda (fail-closed: sin usuario autenticado no se confirma)
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Trazabilidad: si el ajuste proviene de un inventario físico, el kardex
  -- lo referencia explícitamente (campo persistido, no texto manual).
  SELECT pi.pi_number INTO v_pi_number
  FROM public.physical_inventories pi
  WHERE pi.id = v_adj.source_physical_inventory_id;
  v_reason := CASE WHEN v_pi_number IS NOT NULL
                   THEN 'Ajuste por inventario físico ' || v_pi_number
                   ELSE 'Ajuste documental confirmado' END;

  -- Aplicar cada item: actualizar stock + kardex
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Actualizar stock del producto (atómico)
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Registrar movimiento en kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_adj.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.counted_quantity - v_item.expected_quantity,
      p_movement_type := 'adjustment',
      p_unit_cost := 0,
      p_reason := v_reason,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE  -- ya validamos con has_store_access_as
    );

    v_count := v_count + 1;
  END LOOP;

  -- Marcar como confirmed
  UPDATE public.inventory_adjustments
    SET status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = v_caller_uid
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'items_applied', v_count
  );
END;
$$;

-- Anti-spoofing: EXECUTE nunca queda expuesto a PUBLIC/anon (default de PostgreSQL)
REVOKE EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. POLÍTICAS RLS (aislamiento por tienda — patrón del proyecto)
-- ──────────────────────────────────────────────────────────────────────────

-- 5.1 physical_inventories
DROP POLICY IF EXISTS physical_inventories_select ON public.physical_inventories;
CREATE POLICY physical_inventories_select ON public.physical_inventories
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_store_access(store_id));

DROP POLICY IF EXISTS physical_inventories_insert ON public.physical_inventories;
CREATE POLICY physical_inventories_insert ON public.physical_inventories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin()
              OR public.has_store_role(store_id, ARRAY['admin','manager','encargado']::text[]));

DROP POLICY IF EXISTS physical_inventories_update ON public.physical_inventories;
CREATE POLICY physical_inventories_update ON public.physical_inventories
  FOR UPDATE TO authenticated
  USING (public.is_admin()
         OR public.has_store_role(store_id, ARRAY['admin','manager','encargado']::text[]))
  WITH CHECK (public.is_admin()
              OR public.has_store_role(store_id, ARRAY['admin','manager','encargado']::text[]));
-- Sin política DELETE → denegado (integridad del historial)

-- 5.2 physical_inventory_items — CONTEO CIEGO REAL A NIVEL BD:
--     en blind_mode solo roles privilegiados pueden leer las filas
--     completas (que contienen theoretical_qty y difference).
DROP POLICY IF EXISTS physical_inventory_items_select ON public.physical_inventory_items;
CREATE POLICY physical_inventory_items_select ON public.physical_inventory_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND (
          pi.blind_mode = false
          OR public.is_admin()
          OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[])
        )
        AND (public.is_admin() OR public.has_store_access(pi.store_id))
    )
  );

DROP POLICY IF EXISTS physical_inventory_items_insert ON public.physical_inventory_items;
CREATE POLICY physical_inventory_items_insert ON public.physical_inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND (public.is_admin()
             OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[]))
    )
  );

DROP POLICY IF EXISTS physical_inventory_items_update ON public.physical_inventory_items;
CREATE POLICY physical_inventory_items_update ON public.physical_inventory_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND (public.is_admin()
             OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[]))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND (public.is_admin()
             OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[]))
    )
  );
-- Sin política DELETE → denegado

-- 5.3 Tablas de soporte (solo lectura para miembros; escritura vía RPC)
DROP POLICY IF EXISTS physical_inventory_count_log_select ON public.physical_inventory_count_log;
CREATE POLICY physical_inventory_count_log_select ON public.physical_inventory_count_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_count_log.pi_id
        AND (public.is_admin() OR public.has_store_access(pi.store_id))
    )
  );

DROP POLICY IF EXISTS physical_inventory_sheets_select ON public.physical_inventory_sheets;
CREATE POLICY physical_inventory_sheets_select ON public.physical_inventory_sheets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_sheets.pi_id
        AND (public.is_admin() OR public.has_store_access(pi.store_id))
    )
  );

DROP POLICY IF EXISTS physical_inventory_adjustments_select ON public.physical_inventory_adjustments;
CREATE POLICY physical_inventory_adjustments_select ON public.physical_inventory_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_adjustments.pi_id
        AND (public.is_admin() OR public.has_store_access(pi.store_id))
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 6. GRANTS FINALES
-- ──────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.physical_inventories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.physical_inventory_items TO authenticated;
GRANT SELECT ON public.physical_inventory_count_log TO authenticated;
GRANT SELECT ON public.physical_inventory_sheets TO authenticated;
GRANT SELECT ON public.physical_inventory_adjustments TO authenticated;
GRANT SELECT, UPDATE ON public.inventory_adjustments TO authenticated; -- columna nueva cubierta por policy existente

GRANT EXECUTE ON FUNCTION public.create_physical_inventory(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], UUID[], BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_physical_inventory(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_physical_inventory_count(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_physical_inventory_counts(UUID, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_physical_inventory_count(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_physical_inventory_reconciliation(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_physical_inventory_item(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_physical_inventory_authorization(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_adjustments_from_physical_inventory(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_physical_inventory(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_physical_inventory(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_physical_inventory_count_lines(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_physical_inventory_reconciliation(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_physical_inventory_sheet(UUID, TEXT, INTEGER, JSONB, UUID) TO authenticated, service_role;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto al crear funciones; un
-- REVOKE FROM anon NO cubre PUBLIC. Se revoca de PUBLIC y anon explícitamente
-- (patrón 20260616000001_create_bulk_assign_memberships_rpc.sql) para que
-- ningún SECURITY DEFINER nuevo quede alcanzable por roles anónimos.
REVOKE EXECUTE ON FUNCTION public.create_physical_inventory(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], UUID[], BOOLEAN, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prepare_physical_inventory(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_physical_inventory_count(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_physical_inventory_counts(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_physical_inventory_count(UUID, BOOLEAN, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_physical_inventory_reconciliation(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_physical_inventory_item(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_physical_inventory_authorization(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_adjustments_from_physical_inventory(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_physical_inventory(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_physical_inventory(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_physical_inventory_count_lines(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_physical_inventory_reconciliation(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_physical_inventory_sheet(UUID, TEXT, INTEGER, JSONB, UUID) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
