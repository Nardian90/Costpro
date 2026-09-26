-- ============================================================================
-- Migration: 20260927000001_esec_final_definitive_policy.sql
-- FASE E-SEC-FINAL — política definitiva de precio, descuento y autorización
-- (D1–D5 decididas por el responsable funcional; cierra E-SEC-R-DECISION-REQUIRED.md)
--
-- BASELINE: b5b48491 (HEAD == origin/main). La implementación E-SEC
-- (20260926000001_esec_price_integrity.sql, verificada == LIVE en E-SEC-R)
-- se EXTINDE, no se reescribe: todas las validaciones previas se conservan.
--
-- D1 — Umbral POR LÍNEA (>=15%): el desvío se evalúa por línea
--      (v_max_line_pct); el agregado NO puede diluir una línea >=15%.
--      El gate del descuento global (v_effective_discount_pct) se conserva.
-- D2 — discount_reason obligatorio cuando hay autorización (server-side,
--      texto controlado 1..500 tras trim; no se exige bajo el umbral).
-- D3 — Token de supervisor SINGLE-USE: consumo atómico del jti dentro de la
--      transacción (supervisor_token_usages) + scope firmado por línea
--      (pid/vid/px): cada línea con desvío >=15% debe estar cubierta por el
--      scope y no exceder el descuento autorizado. El camino de sesión propia
--      (sync/offline, RC-1: sup==auth.uid()) no usa tokens y queda intacto.
-- D4 — Snapshot histórico por línea: catalog_price_at_sale, item_discount_value,
--      item_discount_pct (price_at_sale ya existe). La venta histórica NO
--      depende del precio actual del catálogo.
-- D5 — Redondeo monetario explícito: precio de línea y subtotal de línea a 2
--      decimales; total = suma de subtotales de línea ya redondeados. Misma
--      semántica en cliente y servidor.
--
-- REGLA CRÍTICA PRESERVADA: el precio editable legítimo sigue funcionando —
-- 500→490 (2%), 500→450 (10%), 500→600 (sobrecarga), servicios sin precio de
-- referencia, multi-moneda, idempotencia, oversell protection, WAC server-side.
-- ============================================================================

-- ─── (A) D4: snapshot del precio por línea ──────────────────────────────────

ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS catalog_price_at_sale NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS item_discount_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_discount_pct     NUMERIC(9,2)  NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transaction_items.catalog_price_at_sale IS
  'E-SEC-FINAL D4: precio de referencia del catálogo (variante o base) al momento de la venta (2dp). NULL = sin referencia evaluable (p.ej. servicios).';
COMMENT ON COLUMN public.transaction_items.item_discount_value IS
  'E-SEC-FINAL D4: descuento comercial de la línea = GREATEST(0, catalog_price_at_sale - price_at_sale) * quantity (2dp).';
COMMENT ON COLUMN public.transaction_items.item_discount_pct IS
  'E-SEC-FINAL D4: desvío % de la línea respecto del catálogo (2dp). >=15 ⇒ requirió autorización (ver audit_logs.metadata).';

-- ─── (B) D3: registro de consumo single-use del token de supervisor ─────────

CREATE TABLE IF NOT EXISTS public.supervisor_token_usages (
  jti text PRIMARY KEY,
  supervisor_user_id uuid NOT NULL,
  operator_user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  transaction_id uuid,
  used_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supervisor_token_usages IS
  'E-SEC-FINAL D3: consumo single-use del token de supervisor (jti). Insertado por create_sale_v2 dentro de la transacción de la venta; ON CONFLICT DO NOTHING + NOT FOUND = replay rechazado (ERR_SUPERVISOR_TOKEN_REUSED). Deny-by-default: solo service_role y el RPC SECURITY DEFINER.';

REVOKE ALL PRIVILEGES ON TABLE public.supervisor_token_usages
  FROM anon, authenticated, PUBLIC;
ALTER TABLE public.supervisor_token_usages ENABLE ROW LEVEL SECURITY;

-- ─── (C) create_sale_v2 — política definitiva D1–D5 ─────────────────────────

-- IMPORTANTE (overload): la política definitiva amplía la firma (3 params
-- nuevos con DEFAULT). CREATE OR REPLACE con firma distinta crearía un
-- OVERLOAD y dejarían coexistir DOS verdades (la vieja 21-params sin D1–D5
-- sería una superficie de bypass para llamadas con la firma antigua).
-- Se elimina la firma previa y queda UNA sola función canónica.
DROP FUNCTION IF EXISTS public.create_sale_v2(uuid, uuid, jsonb, text, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, numeric, uuid, text, uuid, text, timestamp with time zone, uuid);

CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_supervisor_token_jti text DEFAULT NULL::text, p_supervisor_scope jsonb DEFAULT NULL::jsonb, p_discount_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx_id uuid := gen_random_uuid();
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units numeric;
  v_stock numeric;
  v_existing uuid;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
  v_calculated_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_taxable_base numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_total numeric := 0;
  v_tax jsonb;
  v_tax_value numeric;
  v_effective_discount_pct numeric := 0;
  v_cash_amt numeric := p_cash_amount;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  v_pt_id uuid;
  v_zelle_original_amount numeric;
  v_sum_payments numeric;
  v_wac_prev numeric;
  -- E-SEC (R-SEC-1): precio de referencia server-side y desvío comercial por ítem
  v_catalog_price numeric;
  v_reference_price numeric;
  v_catalog_subtotal numeric := 0;
  v_item_discount_total numeric := 0;
  v_item_discount_pct numeric := 0;
  -- E-SEC-FINAL (D1-D5): umbral por línea, single-use, motivo, snapshot, redondeo
  v_ord bigint;
  v_line_pct numeric := 0;
  v_max_line_pct numeric := 0;
  v_gate_triggered boolean := false;
  v_supervisor_path text := 'none';
  v_reason text;
  v_line_snapshot jsonb := '[]'::jsonb;
  v_snap jsonb;
  v_scope_entry jsonb;
  v_scope_ok boolean := false;
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions
      WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
    END IF;
  END IF;

  -- 3. Auth
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 4. Operation date validation
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. Auto-promote to mixed
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND p_payment_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
    v_zelle_amt := p_total_amount;
  END IF;

  -- E-SEC-FINAL (D2): normalización del motivo; la OBLIGATORIEDAD se evalúa
  -- solo cuando el gate dispara (nada se exige bajo el umbral).
  v_reason := btrim(COALESCE(p_discount_reason, ''));
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_DISCOUNT_REASON_INVALID: max 500 caracteres';
  END IF;

  -- 6. Primera pasada — orden determinista por product_id (doctrina W62-05 §2.3):
  --    FOR UPDATE de la fila del producto (serializa stock+WAC) + validaciones.
  --    WITH ORDINALITY: posición determinista de cada línea (clave del snapshot D4).
  FOR v_item, v_ord IN SELECT t.value, t.ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
      ORDER BY (t.value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    IF v_stock IS NULL THEN
      -- fallback legacy: producto sin tienda (servicios globales)
      SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
        FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);

    -- DF-02: costo SIEMPRE del servidor (WAC_prev bajo lock)
    IF v_wac_prev IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;
    IF v_wac_prev = 0 THEN
      IF NOT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                     WHERE store_id = p_store_id AND product_id = v_pid AND scope = 'sale') THEN
        RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_pid;
      END IF;
    END IF;

    -- Saltar validación de stock para servicios
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      IF v_stock < v_units THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units;
      END IF;
    END IF;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    -- DF-02: claves cost_at_sale/cost del request IGNORADAS (no error)
    v_cost := v_wac_prev;

    -- E-SEC (R-SEC-1): precio inválido rechazado EN EL SERVIDOR (defensa contra
    -- llamadas RPC directas que saltan la validación Zod del route). NaN se
    -- detecta por auto-desigualdad; ±Infinity por comparación explícita
    -- (numeric acepta ambos literales); negativo rechazado siempre. Cero NO se
    -- rechaza aquí: es 100% de desvío y cae al gate de supervisor.
    IF v_price IS NULL OR v_price <> v_price
       OR v_price >= 'Infinity'::numeric OR v_price <= '-Infinity'::numeric
       OR v_price < 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale=% product=%', v_price, v_pid;
    END IF;

    -- E-SEC-FINAL (D5): precio monetario de línea → 2 decimales. Todo el
    -- cálculo (desvío, subtotal, INSERT) usa el valor redondeado.
    v_price := ROUND(v_price, 2);

    -- E-SEC (R-SEC-1): precio de referencia del SERVIDOR para evaluar el desvío.
    -- Variante → product_variants.price (precio por modalidad es legítimo y NO
    -- se computa como desvío); base → products.price. Sin referencia (NULL/0)
    -- no hay desvío evaluable (compatibilidad con servicios sin precio).
    IF v_variant_id IS NOT NULL THEN
      SELECT price INTO v_reference_price
        FROM public.product_variants WHERE id = v_variant_id;
      v_reference_price := COALESCE(v_reference_price, v_catalog_price);
    ELSE
      v_reference_price := v_catalog_price;
    END IF;

    -- E-SEC-FINAL (D5): el precio de catálogo de referencia también es monetario (2dp)
    IF v_reference_price IS NOT NULL THEN
      v_reference_price := ROUND(v_reference_price, 2);
    END IF;

    IF v_reference_price IS NOT NULL AND v_reference_price > 0 THEN
      v_catalog_subtotal := v_catalog_subtotal + (v_reference_price * v_qty);
      v_line_pct := 0;
      IF v_price < v_reference_price THEN
        v_item_discount_total := v_item_discount_total
          + ((v_reference_price - v_price) * v_qty);
        v_line_pct := ((v_reference_price - v_price) / v_reference_price) * 100;
      END IF;
      -- E-SEC-FINAL (D1): umbral POR LÍNEA — ninguna línea queda exenta por los
      -- precios normales de otras líneas; el máximo de desvío gobierna el gate.
      IF v_line_pct > v_max_line_pct THEN
        v_max_line_pct := v_line_pct;
      END IF;
      -- E-SEC-FINAL (D4): snapshot por línea (clave 'ord' = posición
      -- determinista; lo consume la segunda pasada y la auditoría).
      v_line_snapshot := v_line_snapshot || jsonb_build_object(
        'ord', v_ord,
        'product_id', v_pid,
        'variant_id', v_variant_id,
        'catalog_price', v_reference_price,
        'price_at_sale', v_price,
        'discount_value', ROUND(GREATEST(0, v_reference_price - v_price) * v_qty, 2),
        'discount_pct', ROUND(v_line_pct, 2)
      );
    END IF;

    -- E-SEC-FINAL (D5): subtotal de LÍNEA redondeado a 2 decimales; el total de
    -- la venta es la suma de los subtotales de línea ya redondeados.
    v_calculated_subtotal := v_calculated_subtotal + ROUND((v_price * v_qty), 2);
  END LOOP;

  -- 7. Recalcular descuento
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 8. Recalcular tax
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  FOR v_tax IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax->>'type' = 'percentage' THEN
      v_tax_value := (v_taxable_base * COALESCE((v_tax->>'value')::numeric, 0)) / 100;
      IF v_tax ? 'min_exempt' THEN
        v_tax_value := GREATEST(0, v_taxable_base - COALESCE((v_tax->>'min_exempt')::numeric, 0)) * COALESCE((v_tax->>'value')::numeric, 0) / 100;
      END IF;
    ELSE
      v_tax_value := COALESCE((v_tax->>'value')::numeric, 0);
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 9. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 10. Validar total vs cliente (tolerancia 0.01 CUP)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 11. Validar supervisor auth (si descuento global >= 15%)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;

  -- E-SEC (R-SEC-1): el desvío de precio por ítem ES un descuento comercial.
  -- El agregado se conserva SOLO como metadato de auditoría (continuidad).
  IF v_catalog_subtotal > 0 THEN
    v_item_discount_pct := (v_item_discount_total / v_catalog_subtotal) * 100;
  END IF;

  -- ============================================================================
  -- E-SEC-FINAL — gate definitivo D1-D3 (decisión del responsable funcional;
  -- cierra E-SEC-R-DECISION-REQUIRED.md):
  --   D1: el gate se evalúa POR LÍNEA (v_max_line_pct >= 15). El agregado NO
  --       puede convertir {20% en una línea + 0% en otras} en una operación
  --       autorizable sin supervisor. Se conserva el gate del descuento global
  --       (v_effective_discount_pct >= 15, mecanismo preexistente).
  --   D2: discount_reason obligatorio cuando hay autorización (validado aquí,
  --       server-side, única regla canónica).
  --   D3: token single-use (consumo atómico del jti) + scope firmado por línea.
  -- ============================================================================
  IF v_effective_discount_pct >= 15 OR v_max_line_pct >= 15 THEN
    v_gate_triggered := true;
  END IF;

  IF v_gate_triggered THEN
    -- Orden de denegación: PRIMERO la exigencia de supervisor (política
    -- primaria), DESPUÉS el motivo (atributo de la autorización). Así una
    -- llamada sin supervisor recibe ERR_SUPERVISOR_REQUIRED aunque tampoco
    -- traiga motivo, y una llamada con supervisor válido pero sin motivo
    -- recibe ERR_DISCOUNT_REASON_REQUIRED.
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: global_pct=%, max_line_pct=%', v_effective_discount_pct, v_max_line_pct;
    END IF;

    -- D2: motivo obligatorio (server-side; no se exige bajo el umbral)
    IF v_reason = '' THEN
      RAISE EXCEPTION 'ERR_DISCOUNT_REASON_REQUIRED: motivo obligatorio para descuento autorizado';
    END IF;

    -- RC-1 (REM-INV-4A-R): a client-supplied supervisor UUID is NOT proof of
    -- authorization. Under authenticated, the ONLY server-verifiable supervisor
    -- identity is the caller itself (auth.uid(), from the platform-signed JWT).
    -- A foreign supervisor identity requires the trusted server route
    -- (auth.role() = 'service_role'), which enforces the supervisor credential
    -- proof (supervisor-check -> signed token -> checkout route) before RPC.
    IF auth.role() <> 'service_role'
       AND p_supervisor_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;

    IF auth.role() = 'service_role' THEN
      -- Camino delegado (route con token HMAC verificado). E-SEC-FINAL (D3):
      -- la autorización es de UN SOLO USO y está ligada a la operación.
      v_supervisor_path := 'token';
      IF p_supervisor_token_jti IS NULL OR btrim(p_supervisor_token_jti) = '' THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REQUIRED: token de supervisor requerido';
      END IF;
      -- Consumo atómico del jti DENTRO de esta transacción: una venta fallida
      -- revierte el consumo (el token no se quema); una venta confirmada lo
      -- quema de forma irreversible. El replay —aunque el atacante conozca el
      -- token y llame por HTTP directo— choca con el PRIMARY KEY: 0 filas
      -- insertadas ⇒ ERR_SUPERVISOR_TOKEN_REUSED.
      INSERT INTO public.supervisor_token_usages
        (jti, supervisor_user_id, operator_user_id, store_id, transaction_id)
      VALUES
        (btrim(p_supervisor_token_jti), p_supervisor_user_id, v_uid, p_store_id, v_tx_id)
      ON CONFLICT (jti) DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REUSED: jti ya consumido';
      END IF;

      -- D3: scope firmado en la emisión. CADA línea con desvío >=15% debe estar
      -- cubierta por una entrada (pid, vid) con px <= precio real (el descuento
      -- aplicado no excede el autorizado). Evita: otro producto, otra línea no
      -- autorizada, o un descuento mayor que el visto por el supervisor.
      IF v_max_line_pct >= 15 THEN
        IF p_supervisor_scope IS NULL OR jsonb_typeof(p_supervisor_scope) <> 'array' THEN
          RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: scope ausente para lineas >=15%%';
        END IF;
        IF jsonb_array_length(p_supervisor_scope) = 0 THEN
          RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: scope vacio para lineas >=15%%';
        END IF;
        FOR v_snap IN SELECT * FROM jsonb_array_elements(v_line_snapshot) LOOP
          IF COALESCE((v_snap->>'discount_pct')::numeric, 0) >= 15 THEN
            v_scope_ok := false;
            FOR v_scope_entry IN SELECT * FROM jsonb_array_elements(p_supervisor_scope) LOOP
              IF v_scope_entry->>'pid' IS NOT NULL
                 AND v_scope_entry->>'pid' = v_snap->>'product_id'
                 AND COALESCE(v_scope_entry->>'vid', '') = COALESCE(v_snap->>'variant_id', '')
                 AND ROUND(COALESCE((v_scope_entry->>'px')::numeric, -1), 2)
                     <= ROUND((v_snap->>'price_at_sale')::numeric, 2) THEN
                v_scope_ok := true;
                EXIT;
              END IF;
            END LOOP;
            IF NOT v_scope_ok THEN
              RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: product=%, price=% no cubierto por el scope autorizado', v_snap->>'product_id', v_snap->>'price_at_sale';
            END IF;
          END IF;
        END LOOP;
      END IF;
    ELSE
      -- Camino de sesión propia (RC-1: p_supervisor_user_id = auth.uid(),
      -- admin/manager de la tienda; usado por sync/offline). Sin token por
      -- diseño: la sesión firmada del supervisor ES la prueba de identidad y
      -- no existe token reutilizable. Política preexistente, sin cambios.
      v_supervisor_path := 'self_session';
    END IF;
  END IF;

  -- 12. Validar/setear payment split
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 1.00 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
        v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'cash' THEN
    v_cash_amt := v_calculated_total;
  ELSIF v_effective_method = 'transfer' THEN
    v_transfer_amt := v_calculated_total;
  ELSIF v_effective_method = 'zelle' THEN
    v_zelle_amt := v_calculated_total;
  END IF;

  -- 13. INSERT transactions
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name
  );

  -- 14. Segunda pasada: stock movement + transaction_items — MISMA autoridad de costo
  FOR v_item, v_ord IN SELECT t.value, t.ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
      ORDER BY (t.value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    -- E-SEC-FINAL (D5): misma semántica de redondeo que la primera pasada
    v_price := ROUND(v_price, 2);

    -- E-SEC-FINAL (D4): snapshot de esta línea calculado en la primera pasada
    -- (misma transacción, mismo lock; la clave 'ord' es determinista).
    SELECT e INTO v_snap FROM jsonb_array_elements(v_line_snapshot) AS e
      WHERE (e->>'ord')::bigint = v_ord;

    -- DF-02: re-lectura bajo FOR UPDATE (misma TX; sin ventana TOCTOU)
    SELECT cost_average INTO v_cost
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;
    IF v_cost IS NULL THEN
      SELECT cost_average INTO v_cost FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    IF v_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;

    -- Stock movement (solo si NO es servicio)
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
        p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
        p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
      cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
      cash_currency, transfer_currency, zelle_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      zelle_discount_type, zelle_discount_value, zelle_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup,
      catalog_price_at_sale, item_discount_value, item_discount_pct
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum,
      v_discount_amount,
      p_sale_currency,
      v_price * p_sale_exchange_rate,
      -- E-SEC-FINAL (D4): snapshot histórico del precio por línea
      (v_snap->>'catalog_price')::numeric,
      COALESCE((v_snap->>'discount_value')::numeric, 0),
      COALESCE((v_snap->>'discount_pct')::numeric, 0)
    );
  END LOOP;

  -- 15. payment_transactions (fuente autoritativa de pagos)
  IF v_cash_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_cash_amt, 'cash', 'CUP', 1.0,
      v_eff, v_uid, 'pay-cash-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_transfer_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_transfer_amt, 'transfer', 'CUP', 1.0,
      v_eff, v_uid, 'pay-transfer-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_zelle_amt > 0 THEN
    IF p_sale_currency = 'CUP' OR p_sale_exchange_rate IS NULL OR p_sale_exchange_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and p_sale_exchange_rate > 1. Got: currency=%, rate=%',
        p_sale_currency, p_sale_exchange_rate USING ERRCODE = 'PT009';
    END IF;
    IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
        p_sale_currency USING ERRCODE = 'PT004';
    END IF;
    v_zelle_original_amount := v_zelle_amt / p_sale_exchange_rate;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_zelle_original_amount, 'zelle', p_sale_currency, p_sale_exchange_rate,
      v_eff, v_uid, 'pay-zelle-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 16. Validación post-INSERT: I1b (POS exige pago completo)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
  FROM public.payment_transactions WHERE transaction_id = v_tx_id;

  IF ABS(v_sum_payments - v_calculated_total) > 0.01 THEN
    RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
      v_sum_payments, v_calculated_total USING ERRCODE = 'PT011';
  END IF;

  -- 17. Audit log completo
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object(
      'total_amount', v_calculated_total,
      'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount,
      'discount_pct', v_effective_discount_pct,
      'catalog_subtotal', v_catalog_subtotal,
      'item_discount_total', v_item_discount_total,
      'item_discount_pct', v_item_discount_pct,
      'max_line_discount_pct', v_max_line_pct,
      'tax_amount', v_calculated_tax,
      'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id,
      'supervisor_id', p_supervisor_user_id,
      -- E-SEC-FINAL (D2/D3/D4): auditoría reconstruible de la autorización
      'discount_reason', v_reason,
      'supervisor_path', v_supervisor_path,
      'supervisor_token_jti', CASE WHEN v_supervisor_path = 'token' THEN btrim(p_supervisor_token_jti) END,
      'lines', v_line_snapshot,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true,
      'payment_transactions_created', true,
      'cogs_authority', 'server_side_wac_df02',
      'policy_version', 'E-SEC-FINAL'
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END $function$;

-- ─── Recarga segura del schema cache de PostgREST (canal estándar Supabase) ──
NOTIFY pgrst, 'reload schema';
