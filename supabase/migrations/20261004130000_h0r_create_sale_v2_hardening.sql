-- ============================================================================
-- H0-R IMPLEMENTATION — FASE H1–H6 · ENDURECIMIENTO CONTRACTUAL DE create_sale_v2
-- ============================================================================
-- Contrato: audit-evidence/FASE-H0-R/CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md
-- (versión final H0-R-FINAL — PR #1354 — READY FOR IMPLEMENTATION).
--
-- Esta migración implementa §17.1 + §17.2 del spec (UNA migración para el RPC):
--   §3.1  Reorden canónico: advisory-lock → AUTH → SELLER → fecha → IDEMPOTENCIA
--         (antes: idempotencia corría ANTES de auth — T-H1-003/T-H2-001)
--   §4    Seller binding: p_seller_id == actor resuelto (ERR_SELLER_REQUIRED /
--         ERR_SELLER_MISMATCH) — sin excepciones
--   §5.4  Impuestos: validación + REEMPLAZO server-side desde tax_configurations
--         (ERR_APPLIED_TAX_INVALID) — el JSONB cliente deja de ser autoridad
--   §6.1  Tasa: resolución server-side (store → BCC seg3 → elToque → fail-closed)
--         + D-EXR-01: MAX_EXCHANGE_RATE_AGE = 45 días → ERR_RATE_STALE
--   §6.2  D-EXR-02: la tasa del cliente es informational-only (nunca autoridad,
--         nunca bloquea por desviación); auditoría client/server/source
--   §7    Idempotencia: identidad (clave, actor, tienda, param_hash exhaustivo)
--         + ERR_IDEMPOTENCY_KEY_REUSE en conflicto (sin transaction_id)
--   §8    ERR_INVALID_DISCOUNT (descuento negativo rechazado)
--   §17.2 ACL: REVOKE PUBLIC/anon + grants explícitos authenticated/service_role
--
-- Sin cambio de firma: /24 idéntica (compatibilidad PostgREST/rutas/sync).
-- Mecánica de inventario (advisory-lock + FOR UPDATE + register_stock_movement),
-- gate de supervisor E-SEC-FINAL D1–D5, split de pagos e invariante PT011: SIN
-- CAMBIO (regresión protegida T-INV-001..005 / T-FIN-001..012).
-- ============================================================================

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
  -- H0-R §6: resolución server-side de la tasa efectiva (D-EXR-01 / D-EXR-02)
  v_server_rate numeric;
  v_rate_source text;
  v_rate_effective_date timestamptz;
  v_client_rate numeric := p_sale_exchange_rate;  -- propuesta cliente: SOLO auditoría/UX (§6.2)
  -- H0-R §5.4: impuestos validados y reconstruidos desde tax_configurations
  v_applied_taxes_canonical jsonb := '[]'::jsonb;
  v_tax_entry jsonb;
  v_tc record;
  v_tax_ids text[] := '{}';
  -- H0-R §7: identidad de idempotencia (param_hash exhaustivo, patrón V2.26)
  v_param_hash text;
  v_idem_result jsonb;
  v_idem_hash text;
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes) — sin cambio
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. AUTH (§3.1 paso 2 — ANTES de idempotencia; cierra el oráculo de claves)
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. SELLER BINDING (§4 — Opción B): p_seller_id == actor autenticado, sin
  --    excepciones. El rechazo es temprano y determinista (transactions.seller_id
  --    es NOT NULL: el NULL explícito hoy fallaba tarde, en el INSERT).
  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SELLER_REQUIRED: p_seller_id es obligatorio y debe coincidir con el actor autenticado';
  END IF;
  IF p_seller_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'ERR_SELLER_MISMATCH: p_seller_id=% no coincide con el actor autenticado=%', p_seller_id, v_uid;
  END IF;

  -- 4. Operation date validation — sin cambio
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. IDEMPOTENCIA (§7 — DESPUÉS de auth/seller; identidad = clave + actor +
  --    tienda + param_hash exhaustivo). El registro idempotency_registry
  --    (patrón V2.26, UNIQUE (key, operation)) da la semántica de precedencia:
  --    la misma identidad → MISMA transacción; identidad distinta con la misma
  --    clave → conflicto limpio SIN fuga de transaction_id (fail-closed).
  IF p_idempotency_key IS NOT NULL THEN
    -- §7.2: campos del hash (orden determinista; lo que el cliente ENVÍA)
    v_param_hash := md5(
      'store=' || COALESCE(p_store_id::text, '') ||
      '|actor=' || COALESCE(v_uid::text, '') ||
      '|items=' || COALESCE((
        SELECT string_agg(
          COALESCE(t.value->>'product_id', '') || ':' ||
          COALESCE(t.value->>'variant_id', '') || ':' ||
          COALESCE(t.value->>'quantity', '') || ':' ||
          COALESCE(NULLIF(t.value->>'price_at_sale', ''), t.value->>'price', ''),
          ',' ORDER BY t.value->>'product_id', t.ord)
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      ), '') ||
      '|payment_method=' || COALESCE(p_payment_method, '') ||
      '|cash=' || COALESCE(p_cash_amount::text, '') ||
      '|transfer=' || COALESCE(p_transfer_amount::text, '') ||
      '|zelle=' || COALESCE(p_zelle_amount::text, '') ||
      '|discount_type=' || COALESCE(p_discount_type, '') ||
      '|discount_value=' || COALESCE(p_discount_value::text, '') ||
      '|applied_taxes=' || COALESCE(p_applied_taxes::text, '') ||
      '|sale_currency=' || COALESCE(p_sale_currency, '') ||
      '|sale_exchange_rate=' || COALESCE(p_sale_exchange_rate::text, '') ||
      '|customer_id=' || COALESCE(p_customer_id::text, '') ||
      '|customer_name=' || COALESCE(p_customer_name, '') ||
      '|operation_date=' || COALESCE(NULLIF(FLOOR(EXTRACT(EPOCH FROM p_operation_date))::text, ''), '') ||
      '|total_amount=' || COALESCE(p_total_amount::text, '') ||
      '|subtotal=' || COALESCE(p_subtotal::text, '') ||
      '|tax_amount=' || COALESCE(p_tax_amount::text, '')
    );

    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (p_idempotency_key, 'create_sale_v2', v_tx_id, v_param_hash,
            jsonb_build_object('status', 'pending'))
    ON CONFLICT (idempotency_key, operation) DO NOTHING;

    IF NOT FOUND THEN
      -- Registro preexistente: verificar identidad completa
      SELECT result, param_hash INTO v_idem_result, v_idem_hash
        FROM public.idempotency_registry
        WHERE idempotency_key = p_idempotency_key AND operation = 'create_sale_v2'
        LIMIT 1;

      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        -- §7.1: misma clave + payload/actor/tienda distinto → conflicto SIN
        -- transaction_id (jamás retorno silencioso de la venta previa)
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la clave % ya está ligada a otra identidad de venta (payload/actor/tienda)', p_idempotency_key;
      END IF;

      -- Misma identidad → MISMA transacción (0 duplicados)
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
      END IF;

      -- Hash coincide pero la transacción no aparece (creación concurrente en
      -- curso en otra sesión): esperar brevemente y reintentar la lectura.
      PERFORM pg_sleep(0.1);
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
      END IF;
      RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — operación previa con la clave % aún en curso', p_idempotency_key;
    ELSE
      -- Registro recién insertado por esta llamada. Compatibilidad con
      -- transacciones pre-hardening creadas sin registro de identidad: si la
      -- clave ya existe en transactions (índice único global), rechazo limpio
      -- fail-closed en lugar de chocar el índice con un 500 con fuga (§7.3).
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la clave % pertenece a una venta previa sin registro de identidad; utilice una clave nueva', p_idempotency_key;
      END IF;
    END IF;
  END IF;

  -- 6. Auto-promote to mixed — sin cambio
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND p_payment_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
    v_zelle_amt := p_total_amount;
  END IF;

  -- E-SEC-FINAL (D2): normalización del motivo (obligatoriedad solo si el gate dispara)
  v_reason := btrim(COALESCE(p_discount_reason, ''));
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_DISCOUNT_REASON_INVALID: max 500 caracteres';
  END IF;

  -- 7. Primera pasada — orden determinista por product_id (doctrina W62-05 §2.3):
  --    FOR UPDATE de la fila del producto (serializa stock+WAC) + validaciones.
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

    -- E-SEC (R-SEC-1): precio inválido rechazado EN EL SERVIDOR
    IF v_price IS NULL OR v_price <> v_price
       OR v_price >= 'Infinity'::numeric OR v_price <= '-Infinity'::numeric
       OR v_price < 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale=% product=%', v_price, v_pid;
    END IF;

    -- E-SEC-FINAL (D5): precio monetario de línea → 2 decimales
    v_price := ROUND(v_price, 2);

    -- E-SEC (R-SEC-1): precio de referencia del SERVIDOR para evaluar el desvío
    IF v_variant_id IS NOT NULL THEN
      SELECT price INTO v_reference_price
        FROM public.product_variants WHERE id = v_variant_id;
      v_reference_price := COALESCE(v_reference_price, v_catalog_price);
    ELSE
      v_reference_price := v_catalog_price;
    END IF;

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
      IF v_line_pct > v_max_line_pct THEN
        v_max_line_pct := v_line_pct;
      END IF;
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

    v_calculated_subtotal := v_calculated_subtotal + ROUND((v_price * v_qty), 2);
  END LOOP;

  -- 8. Recalcular descuento (§8: el descuento NEGATIVO queda estructuralmente
  --    imposibilitado — hoy LEAST(-100, subtotal) inflaba el total, T-FIN-007)
  IF p_discount_value IS NULL OR p_discount_value < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_DISCOUNT: %', p_discount_value;
  END IF;
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 9. Impuestos (§5.4): el cliente PROPONE (ids); el servidor VALIDA contra el
  --    catálogo autorizado (tax_configurations: global + tienda) y REEMPLAZA con
  --    la entrada canónica reconstruida desde la fila. El JSONB cliente JAMÁS se
  --    persiste tal cual. Entradas sin id / id desconocido / inactivo / de otra
  --    tienda / duplicado → ERR_APPLIED_TAX_INVALID (mensaje uniforme, sin
  --    revelar si el id existe).
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  v_applied_taxes_canonical := '[]'::jsonb;
  v_tax_ids := '{}';
  IF p_applied_taxes IS NULL OR jsonb_typeof(p_applied_taxes) <> 'array' THEN
    RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: p_applied_taxes debe ser un array de {id}';
  END IF;
  FOR v_tax_entry IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax_entry->>'id' IS NULL OR btrim(v_tax_entry->>'id') = ''
       OR v_tax_entry->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: entrada sin id de configuración';
    END IF;
    SELECT id, name, type, value, min_exempt INTO v_tc
      FROM public.tax_configurations
      WHERE id = (v_tax_entry->>'id')::uuid
        AND is_active = true
        AND (store_id IS NULL OR store_id = p_store_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID';
    END IF;
    IF v_tc.id::text = ANY(v_tax_ids) THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: impuesto duplicado';
    END IF;
    v_tax_ids := array_append(v_tax_ids, v_tc.id::text);
    v_applied_taxes_canonical := v_applied_taxes_canonical || jsonb_build_object(
      'id', v_tc.id, 'name', v_tc.name, 'type', v_tc.type,
      'value', v_tc.value, 'min_exempt', v_tc.min_exempt);
    IF v_tc.type = 'percentage' THEN
      v_tax_value := GREATEST(0, v_taxable_base - COALESCE(v_tc.min_exempt, 0)) * v_tc.value / 100;
    ELSE
      v_tax_value := v_tc.value;
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 10. Tasa de cambio (§6.1): resolución SERVER-SIDE exclusiva. Jerarquía:
  --     store_exchange_rates (updated_at) → exchange_rates BCC seg 3 (rate_date)
  --     → exchange_rates elToque (rate_date) → fail-closed. D-EXR-01: la tasa
  --     que gana por precedencia y tiene fecha efectiva > 45 días → ERR_RATE_STALE
  --     (FAIL CLOSED, sin salto silencioso a fuente inferior, sin sustitución por
  --     la tasa del cliente). D-EXR-02: p_sale_exchange_rate queda como dato
  --     recibido SIN autoridad financiera (0/−5/680/1000000 → mismo destino:
  --     ignorados; la desviación NUNCA bloquea).
  v_server_rate := NULL;
  v_rate_source := NULL;
  v_rate_effective_date := NULL;
  IF p_sale_currency = 'CUP' THEN
    v_server_rate := 1;  -- CUP = 1 por definición (sin fuente, sin staleness)
  ELSE
    SELECT ser.rate, 'store', ser.updated_at
      INTO v_server_rate, v_rate_source, v_rate_effective_date
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = p_sale_currency;
    IF v_server_rate IS NULL THEN
      SELECT er.rate, 'global_bcc_seg3', er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_server_rate IS NULL THEN
      SELECT er.rate, 'global_eltoque', er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_server_rate IS NULL OR v_server_rate <= 0 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: currency=%, store=%', p_sale_currency, p_store_id;
    END IF;
    IF v_rate_effective_date < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: currency=%, store=%, source=%, effective=%',
        p_sale_currency, p_store_id, v_rate_source, v_rate_effective_date;
    END IF;
  END IF;

  -- 11. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 12. Validar total vs cliente (tolerancia 0.01)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 13. Validar supervisor auth (gate D1–D5 E-SEC-FINAL — SIN CAMBIO)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;
  IF v_catalog_subtotal > 0 THEN
    v_item_discount_pct := (v_item_discount_total / v_catalog_subtotal) * 100;
  END IF;

  IF v_effective_discount_pct >= 15 OR v_max_line_pct >= 15 THEN
    v_gate_triggered := true;
  END IF;

  IF v_gate_triggered THEN
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: global_pct=%, max_line_pct=%', v_effective_discount_pct, v_max_line_pct;
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'ERR_DISCOUNT_REASON_REQUIRED: motivo obligatorio para descuento autorizado';
    END IF;
    IF auth.role() <> 'service_role'
       AND p_supervisor_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;

    IF auth.role() = 'service_role' THEN
      v_supervisor_path := 'token';
      IF p_supervisor_token_jti IS NULL OR btrim(p_supervisor_token_jti) = '' THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REQUIRED: token de supervisor requerido';
      END IF;
      INSERT INTO public.supervisor_token_usages
        (jti, supervisor_user_id, operator_user_id, store_id, transaction_id)
      VALUES
        (btrim(p_supervisor_token_jti), p_supervisor_user_id, v_uid, p_store_id, v_tx_id)
      ON CONFLICT (jti) DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REUSED: jti ya consumido';
      END IF;

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
      v_supervisor_path := 'self_session';
    END IF;
  END IF;

  -- 14. Validar/setear payment split — sin cambio
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

  -- 15. INSERT transactions — §6.3/§4/§5.4: tasa servidor, seller = v_uid,
  --     impuestos = snapshot canónico del catálogo
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name
  ) VALUES (
    v_tx_id, p_store_id, v_uid, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, v_applied_taxes_canonical,
    p_sale_currency, v_server_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name
  );

  -- 16. Segunda pasada: stock movement + transaction_items — MISMA autoridad de costo
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
    v_price := ROUND(v_price, 2);

    SELECT e INTO v_snap FROM jsonb_array_elements(v_line_snapshot) AS e
      WHERE (e->>'ord')::bigint = v_ord;

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
      v_price * v_server_rate,
      (v_snap->>'catalog_price')::numeric,
      COALESCE((v_snap->>'discount_value')::numeric, 0),
      COALESCE((v_snap->>'discount_pct')::numeric, 0)
    );
  END LOOP;

  -- 17. payment_transactions (fuente autoritativa de pagos) — §6.3: zelle
  --     siempre con la tasa servidor
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
    IF p_sale_currency = 'CUP' OR v_server_rate IS NULL OR v_server_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and server_exchange_rate > 1. Got: currency=%, rate=%',
        p_sale_currency, v_server_rate USING ERRCODE = 'PT009';
    END IF;
    IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
        p_sale_currency USING ERRCODE = 'PT004';
    END IF;
    v_zelle_original_amount := v_zelle_amt / v_server_rate;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_zelle_original_amount, 'zelle', p_sale_currency, v_server_rate,
      v_eff, v_uid, 'pay-zelle-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 18. Validación post-INSERT: I1b (POS exige pago completo) — sin cambio
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_tx_id;

  IF ABS(v_sum_payments - v_calculated_total) > 0.01 THEN
    RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
      v_sum_payments, v_calculated_total USING ERRCODE = 'PT011';
  END IF;

  -- 19. Cerrar el registro de idempotencia con el resultado definitivo
  --     (patrón V2.26: el retry posterior lee el resultado del registry)
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_registry
      SET result = jsonb_build_object('status', 'success', 'transaction_id', v_tx_id)
      WHERE idempotency_key = p_idempotency_key AND operation = 'create_sale_v2';
  END IF;

  -- 20. Audit log completo — §6.2/§7: auditoría ampliada con tasa cliente/servidor
  --     (observabilidad NO autoritativa de la divergencia, D-EXR-02) y param_hash
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
      'discount_reason', v_reason,
      'supervisor_path', v_supervisor_path,
      'supervisor_token_jti', CASE WHEN v_supervisor_path = 'token' THEN btrim(p_supervisor_token_jti) END,
      'lines', v_line_snapshot,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true,
      'payment_transactions_created', true,
      'cogs_authority', 'server_side_wac_df02',
      'policy_version', 'E-SEC-FINAL',
      -- H0-R §6.2 (D-EXR-02): trazabilidad no-autoritativa de la tasa
      'client_rate', v_client_rate,
      'server_rate', v_server_rate,
      'rate_source', v_rate_source,
      'rate_authority', 'server_side_h0r_d_exr',
      -- H0-R §7: identidad de idempotencia auditada
      'idempotency_param_hash', v_param_hash,
      -- H0-R §5.4: autoridad fiscal del snapshot
      'tax_authority', 'tax_configurations_server_side'
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

-- ============================================================================
-- §17.2 — ACL: EXECUTE solo para authenticated y service_role.
-- PUBLIC/anon = PROHIBIDO (§2.1): cierra el oráculo de existencia de claves en
-- la capa ACL (T-H1-001/002/003/004). REVOKE FROM PUBLIC es el que cierra de
-- verdad (anon hereda de PUBLIC); el REVOKE FROM anon adicional normaliza
-- cualquier entrada explícita residual.
-- NOTA §12.3: los GRANTs a authenticated/service_role viven en archivos ACL
-- dedicados sin cuerpos de función (20260927000002_f4 y
-- 20261004130004_h0r_acl_reconciler) — patrón requerido por el census CI de
-- anti-resurrección (T-AR-003). CREATE OR REPLACE preserva el ACL existente,
-- por lo que el estado de la cadena se mantiene: {postgres, authenticated,
-- service_role} — nunca PUBLIC.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) FROM PUBLIC, anon;
