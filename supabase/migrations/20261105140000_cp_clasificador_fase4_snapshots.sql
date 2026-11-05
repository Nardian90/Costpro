-- ============================================================================
-- MISIÓN CLASIFICADOR MAESTRO — FASE 4 · INTEGRACIÓN OPERATIVA (snapshots)
-- ============================================================================
-- VERSIONADO del estado vigente de producción (sesión CLASIFICATOR-PARTIES
-- 2026-11-04 aplicada fuera del control de versiones; auditada en FASE 1):
--  1) Columnas snapshot ADITIVAS (nulables; históricos intactos):
--     · transactions.customer_address / customer_code — COMPRADOR congelado
--       al momento de la venta (Factura SC-2-12: Nombre/Dirección/Código).
--       REGLA DE LA MISIÓN: históricos JAMÁS resuelven el maestro dinámicamente.
--     · receipts.supplier_code / supplier_address / supplier_phone /
--       supplier_tax_id — PROVEEDOR congelado al momento de la recepción.
--  2) Definiciones VERBATIM de create_sale_v2 (34 params, con
--     p_customer_address/p_customer_code) y register_reception (11 params,
--     con p_supplier_code/address/phone/tax_id) extraídas de producción con
--     pg_get_functiondef. Sin cambios de comportamiento.
-- REVERSIBILIDAD: ALTER TABLE ... DROP COLUMN; re-aplicar las definiciones
--    previas de las funciones restaura el estado anterior.
-- ============================================================================

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS customer_code TEXT;

COMMENT ON COLUMN public.transactions.customer_address IS
  'Snapshot de la dirección del COMPRADOR al momento de la venta (Clasificador Maestro, FASE 4). NULL = venta sin dirección registrada. JAMÁS se resuelve dinámicamente desde el maestro para documentos históricos.';
COMMENT ON COLUMN public.transactions.customer_code IS
  'Snapshot del código del COMPRADOR al momento de la venta (Clasificador Maestro, FASE 4). NULL = venta sin código registrado.';

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS supplier_code TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS supplier_address TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS supplier_phone TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS supplier_tax_id TEXT;

COMMENT ON COLUMN public.receipts.supplier_code IS
  'Snapshot del código del proveedor al momento de la recepción (Clasificador Maestro, FASE 4). NULL = recepción sin código.';
COMMENT ON COLUMN public.receipts.supplier_address IS
  'Snapshot de la dirección del proveedor al momento de la recepción (FASE 4).';
COMMENT ON COLUMN public.receipts.supplier_phone IS
  'Snapshot del teléfono del proveedor al momento de la recepción (FASE 4).';
COMMENT ON COLUMN public.receipts.supplier_tax_id IS
  'Snapshot del NIT/identificación fiscal del proveedor al momento de la recepción (FASE 4).';

-- Verificación
DO $guard$
DECLARE v_cols INTEGER;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public'
     AND ((table_name='transactions' AND column_name IN ('customer_address','customer_code'))
       OR (table_name='receipts' AND column_name IN ('supplier_code','supplier_address','supplier_phone','supplier_tax_id')));
  IF v_cols <> 6 THEN
    RAISE EXCEPTION 'GUARD FASE 4: columnas snapshot=% (esperado 6)', v_cols;
  END IF;
END
$guard$;


-- ─── create_sale_v2 (definición vigente de producción, verbatim) ───
-- Disciplina CP-E2E-RECONCILE-004: la firma nueva (/34, con snapshot del
-- comprador) exige DROP sin calificar para dejar UNA sola firma viva.
DROP FUNCTION IF EXISTS public.create_sale_v2;

CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_supervisor_token_jti text DEFAULT NULL::text, p_supervisor_scope jsonb DEFAULT NULL::jsonb, p_discount_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_payment_incidents jsonb DEFAULT NULL::jsonb, p_cash_received_cup numeric DEFAULT NULL::numeric, p_cash_received_usd numeric DEFAULT NULL::numeric, p_change_given_cup numeric DEFAULT NULL::numeric, p_change_given_usd numeric DEFAULT NULL::numeric, p_change_currency text DEFAULT NULL::text, p_payment_components jsonb DEFAULT NULL::jsonb, p_customer_code text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text)
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
  -- FIX-USD-CUP-RATE (2026-10-14): conversión por item a la moneda común CUP
  v_item_rate numeric := 1.0;
  v_item_currency text;
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
  -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro (vuelto multimoneda)
  v_settlement_present boolean := false;
  v_chg_rate numeric := NULL;
  v_chg_rate_src text := NULL;
  v_settle_net_cup numeric := 0;
  v_settle_net_usd numeric := 0;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  v_pt_id uuid;
  v_zelle_original_amount numeric;
  -- MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24): componentes de pago por
  -- moneda REAL — importe efectivamente cobrado en CUP y en USD por método.
  v_comp jsonb;
  v_comp_method text;
  v_comp_cur text;
  v_comp_amt numeric;
  v_components_ok boolean := false;
  v_usd_rate numeric := NULL;
  v_usd_rate_source text := NULL;
  v_usd_rate_eff timestamptz := NULL;
  v_comp_cash_cup numeric := 0;
  v_comp_cash_usd numeric := 0;
  v_comp_transfer_cup numeric := 0;
  v_comp_transfer_usd numeric := 0;
  v_comp_zelle_usd numeric := 0;
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
  -- MISIÓN-FLEX (2026-10-17): incidencias de pago (flexibilización temporal)
  v_incidents jsonb;
  v_payment_diff numeric := 0;
  v_has_payment_incident boolean := false;
  v_incidence_note text;
  v_notes_final text;
  v_it jsonb;
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
      '|customer_code=' || COALESCE(p_customer_code, '') ||
      '|customer_address=' || COALESCE(p_customer_address, '') ||
      '|customer_name=' || COALESCE(p_customer_name, '') ||
      '|operation_date=' || COALESCE(NULLIF(FLOOR(EXTRACT(EPOCH FROM p_operation_date))::text, ''), '') ||
      '|total_amount=' || COALESCE(p_total_amount::text, '') ||
      '|subtotal=' || COALESCE(p_subtotal::text, '') ||
      '|tax_amount=' || COALESCE(p_tax_amount::text, '') ||
      -- MISIÓN-FLEX: notas e incidencias forman parte de la identidad
      '|notes=' || COALESCE(p_notes, '') ||
      '|payment_incidents=' || COALESCE(p_payment_incidents::text, '') ||
      -- MISIÓN CAJA 2026-10-23: la liquidación del cobro es parte de la
      -- identidad de la venta (misma clave + liquidación distinta = conflicto)
      '|cash_settlement=' || COALESCE(p_cash_received_cup::text, '') || '/' ||
      COALESCE(p_cash_received_usd::text, '') || '/' ||
      COALESCE(p_change_given_cup::text, '') || '/' ||
      COALESCE(p_change_given_usd::text, '') || '/' ||
      COALESCE(p_change_currency, '') ||
      -- MISIÓN PAGOS MIXTOS (2026-10-24): los componentes por moneda forman
      -- parte de la identidad de idempotencia (misma clave + componentes
      -- distintos = conflicto limpio, sin duplicar filas del ledger).
      '|payment_components=' || COALESCE(p_payment_components::text, '')
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
  -- MISIÓN-FLEX: con incidencias de pago NO se infla el importe Zelle al total
  -- (un Transf. Exterior parcial debe registrarse como lo reportado).
  IF p_payment_incidents IS NULL AND p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
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

    -- FIX-USD-CUP-RATE (2026-10-14): conversión del item a la moneda común CUP.
    -- La tasa del item (client-sent, persistida en transaction_items.exchange_rate)
    -- aplica SOLO a items no-CUP; CUP = 1 por definición. Fail-safe: tasa nula o
    -- <= 0 -> 1.0 (la venta CUP pura NO cambia; regresión cero).
    v_item_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'CUP');
    IF v_item_currency = 'CUP' THEN
      v_item_rate := 1.0;
    ELSE
      v_item_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::numeric, 1.0);
      IF v_item_rate <= 0 THEN
        v_item_rate := 1.0;
      END IF;
    END IF;

    SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    IF v_stock IS NULL THEN
      -- CP-CATALOGO (2026-10-28): cierre del fallback legacy sin filtro de tienda
      -- (hallazgo CICLO 2 / E2E-POS-007). products.store_id es NOT NULL, de modo
      -- que no existe el caso legitimo «producto sin tienda»: si la fila
      -- (id, store_id) no existe, el producto pertenece a otra tienda o no
      -- existe. Fail-closed con error explicito; ninguna venta puede tomar
      -- precio/costo/existencia de una fila ajena a la tienda.
      IF EXISTS (SELECT 1 FROM public.products WHERE id = v_pid) THEN
        RAISE EXCEPTION 'ERR_STORE_MISMATCH: el producto % pertenece a otra tienda (solicitada: %)', v_pid, p_store_id;
      END IF;
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: el producto % no existe', v_pid;
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
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid AND store_id = p_store_id;
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

    -- FIX-USD-CUP-RATE: el total de la venta es CUP = Σ precio nativo × tasa del item × qty
    v_calculated_subtotal := v_calculated_subtotal + ROUND((v_price * v_item_rate * v_qty), 2);
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
  --     → exchange_rates Diviza informal (rate_date) → fail-closed. D-EXR-01: la tasa
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
      SELECT er.rate, 'global_' || lower(er.source), er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'Diviza'
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

  -- 11.5 REGLA INNEGOCIABLE (MISIÓN 2026-10-17): una venta ordinaria con
  --     total NEGATIVO jamás se aprueba. Estructuralmente el recálculo ya lo
  --     impide (precio >= 0, descuento LEAST(subtotal), impuestos >= 0); este
  --     guard explícito es defensa en profundidad y produce un error
  --     tipado que la API registra en Auditoría (sale_negative_rejected).
  IF v_calculated_total < 0 THEN
    RAISE EXCEPTION 'ERR_NEGATIVE_SALE: total=% — una venta con total negativo no puede aprobarse', v_calculated_total;
  END IF;

  -- 11.6 MISIÓN-FLEX: normalización de incidencias de pago (flexibilización
  --     TEMPORAL de diferencias de pago). Solo el flujo del cliente que
  --     documentó la incidencia puede registrar una venta descuadrada; un
  --     cliente sin soporte sigue recibiendo el rechazo canónico.
  v_incidents := NULL;
  IF p_payment_incidents IS NOT NULL
     AND jsonb_typeof(p_payment_incidents) = 'array'
     AND jsonb_array_length(p_payment_incidents) > 0 THEN
    -- Guardrail de integridad financiera: sin tasa REAL para USD/EUR las
    -- diferencias NO son validables (fail-closed, ERR_RATE_REQUIRED_FOR_INCIDENT).
    FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_item_currency := COALESCE(NULLIF(v_it->>'currency', ''), 'CUP');
      IF v_item_currency IN ('USD', 'EUR') THEN
        v_item_rate := COALESCE(NULLIF(v_it->>'exchange_rate', '')::numeric, 1.0);
        IF v_item_rate <= 1.0 THEN
          RAISE EXCEPTION 'ERR_RATE_REQUIRED_FOR_INCIDENT: currency=%, rate=% — configure la tasa de la tienda antes de registrar incidencias de pago', v_item_currency, v_item_rate;
        END IF;
      END IF;
    END LOOP;
    v_incidents := p_payment_incidents;
  END IF;

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

  -- 13.7 MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24): COMPONENTES DE PAGO
  --      POR MONEDA REAL. El cliente declara lo efectivamente cobrado en cada
  --      moneda: [{method, currency, amount}] con importes ORIGINALES (sin
  --      convertir). El servidor:
  --        1. Valida la estructura (método ∈ cash|transfer|zelle, moneda ∈
  --           CUP|USD, importe > 0; zelle es riel USD por diseño).
  --        2. Resuelve la TASA USD de la operación con la jerarquía autoritaria
  --           (tienda → BCC seg3 → Diviza informal, fail-closed, staleness 45 días) —
  --           la MISMA fuente del §10; para venta USD reutiliza v_server_rate.
  --        3. DERIVA los pools canónicos (v_cash_amt/v_transfer_amt/
  --           v_zelle_amt) desde los componentes a la tasa servidor — el
  --           desglose por moneda del cliente deja de tener autoridad
  --           financiera (paridad con D-EXR-02).
  --      Sin componentes (p_payment_components NULL): flujo previo IDÉNTICO
  --      (compatibilidad con /api/sync/batch y clientes legados).
  v_components_ok := false;
  IF p_payment_components IS NOT NULL THEN
    IF jsonb_typeof(p_payment_components) <> 'array' THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: p_payment_components debe ser un array [{method, currency, amount}]';
    END IF;
    IF jsonb_array_length(p_payment_components) > 20 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: máximo 20 componentes por venta';
    END IF;
    v_comp_cash_cup := 0; v_comp_cash_usd := 0;
    v_comp_transfer_cup := 0; v_comp_transfer_usd := 0;
    v_comp_zelle_usd := 0;
    FOR v_comp IN SELECT * FROM jsonb_array_elements(p_payment_components) LOOP
      v_comp_method := lower(btrim(COALESCE(v_comp->>'method', '')));
      v_comp_cur := upper(btrim(COALESCE(v_comp->>'currency', '')));
      v_comp_amt := COALESCE(NULLIF(v_comp->>'amount', '')::numeric, NULL);
      IF v_comp_method NOT IN ('cash', 'transfer', 'zelle')
         OR v_comp_cur NOT IN ('CUP', 'USD')
         OR v_comp_amt IS NULL OR v_comp_amt <= 0 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componente inválido (method=%, currency=%, amount=%)',
          v_comp_method, v_comp_cur, COALESCE(v_comp->>'amount', 'NULL');
      END IF;
      IF v_comp_method = 'zelle' AND v_comp_cur <> 'USD' THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: zelle es un riel USD (currency=%)', v_comp_cur;
      END IF;
      IF v_comp_method = 'cash' THEN
        IF v_comp_cur = 'CUP' THEN
          v_comp_cash_cup := v_comp_cash_cup + v_comp_amt;
        ELSE
          v_comp_cash_usd := v_comp_cash_usd + v_comp_amt;
        END IF;
      ELSIF v_comp_method = 'transfer' THEN
        IF v_comp_cur = 'CUP' THEN
          v_comp_transfer_cup := v_comp_transfer_cup + v_comp_amt;
        ELSE
          v_comp_transfer_usd := v_comp_transfer_usd + v_comp_amt;
        END IF;
      ELSE
        v_comp_zelle_usd := v_comp_zelle_usd + v_comp_amt;
      END IF;
    END LOOP;

    -- CP-MONEY-002 (D3, posmerge #1467): UNICIDAD de (método, moneda). El
    -- cliente AGRUPA por (método, moneda) (buildPaymentComponents); un payload
    -- con duplicados solo puede venir de un cliente no estándar y §17
    -- insertaría DOS filas del ledger con la MISMA idempotency_key
    -- 'pay-<method>-<currency>-<tx>' — payment_transactions no tiene
    -- UNIQUE(idempotency_key) (verificado contra la BD viva 2026-10-24: solo
    -- PK) → filas duplicadas en la fuente autoritativa del Reporte Entrega.
    -- Fail-closed coherente con la regla de la misión (Fase B: «Rechaza
    -- componentes duplicados») y con la agregación previa de pools (§13.7).
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payment_components) c
      GROUP BY lower(btrim(c->>'method')), upper(btrim(c->>'currency'))
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componentes duplicados — agrupa los importes del mismo método y moneda en un solo componente [{method, currency, amount}]';
    END IF;

    -- Tasa USD de la operación (jerarquía §6.1 — misma fuente que v_server_rate)
    IF upper(COALESCE(p_sale_currency, 'CUP')) = 'USD' AND v_server_rate > 1 THEN
      v_usd_rate := v_server_rate;  -- venta USD: la tasa ya resuelta ES la tasa USD
    END IF;
    IF (v_comp_cash_usd + v_comp_transfer_usd + v_comp_zelle_usd) > 0
       AND (v_usd_rate IS NULL OR v_usd_rate <= 1) THEN
      SELECT ser.rate, 'store_exchange_rates', ser.updated_at
        INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
        FROM public.store_exchange_rates ser
        WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
      IF v_usd_rate IS NULL THEN
        SELECT er.rate, 'global_bcc_seg3', er.rate_date
          INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_usd_rate IS NULL THEN
        SELECT er.rate, 'global_' || lower(er.source), er.rate_date
          INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'Diviza'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: componentes en USD exigen tasa USD (jerarquía tienda→BCC→Diviza) — tienda %', p_store_id;
      END IF;
      IF v_usd_rate_eff < now() - INTERVAL '45 days' THEN
        RAISE EXCEPTION 'ERR_RATE_STALE: currency=USD, store=%, source=%, effective=%',
          p_store_id, v_usd_rate_source, v_usd_rate_eff;
      END IF;
    END IF;

    -- Pools canónicos DERIVADOS (autoridad servidor, fail-closed): la suma de
    -- componentes convertidos a la tasa de la operación.
    v_cash_amt := v_comp_cash_cup + v_comp_cash_usd * COALESCE(v_usd_rate, 1);
    v_transfer_amt := v_comp_transfer_cup + v_comp_transfer_usd * COALESCE(v_usd_rate, 1);
    v_zelle_amt := v_comp_zelle_usd * COALESCE(v_usd_rate, 1);
    v_components_ok := true;
  END IF;

  -- 14. Validar/setear payment split
  --     MISIÓN-FLEX (2026-10-17): con incidencias documentadas por el cliente
  --     (v_incidents) se permiten faltante/sobrepago/desglose descuadrado y
  --     se registran los importes REALMENTE recibidos. Sin incidencias el
  --     comportamiento canónico anterior queda intacto (fail-closed).
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 1.00 THEN
      IF v_incidents IS NULL THEN
        RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
          v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
      END IF;
      -- flexibilizado: la diferencia se documenta en nota + auditoría
    END IF;
  ELSIF v_components_ok THEN
    -- MISIÓN PAGOS MIXTOS (2026-10-24): los pools DERIVADOS de los
    -- componentes (§13.7) son la autoridad — el importe realmente recibido
    -- por moneda ya está validado contra la tasa servidor. Las sobreescritas
    -- por método (total canónico / pool del cliente) NO aplican: destruirían
    -- el desglose por moneda. La suma sigue validándose abajo (14.5/14.9/18)
    -- con las mismas reglas e incidencias MISIÓN-FLEX.
    NULL;
  ELSIF v_effective_method = 'cash' THEN
    IF v_incidents IS NOT NULL AND p_cash_amount IS NOT NULL AND p_cash_amount >= 0 THEN
      v_cash_amt := p_cash_amount;  -- lo realmente recibido (puede faltar/sobrar)
    ELSE
      v_cash_amt := v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'transfer' THEN
    IF v_incidents IS NOT NULL AND p_transfer_amount IS NOT NULL AND p_transfer_amount >= 0 THEN
      v_transfer_amt := p_transfer_amount;
    ELSE
      v_transfer_amt := v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'zelle' THEN
    IF v_incidents IS NOT NULL AND p_zelle_amount IS NOT NULL AND p_zelle_amount >= 0 THEN
      v_zelle_amt := p_zelle_amount;
    ELSE
      v_zelle_amt := v_calculated_total;
    END IF;
  END IF;

  -- 14.5 MISIÓN-FLEX: diferencia de pago + nota automática de incidencia.
  --     La nota respeta la nota manual (p_notes) SIN sobrescribirla: se
  --     antepone y la incidencia se añade en línea nueva.
  v_payment_diff := ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total, 2);
  v_has_payment_incident := (v_incidents IS NOT NULL)
    AND (abs(v_payment_diff) > 0.01 OR jsonb_array_length(v_incidents) > 0);
  v_incidence_note := NULL;
  IF v_has_payment_incident THEN
    IF v_payment_diff < 0 THEN
      v_incidence_note := 'INCIDENCIA DE PAGO: venta registrada con pago insuficiente. Total: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. Importe recibido: '
        || to_char(v_cash_amt + v_transfer_amt + v_zelle_amt, 'FM999999990.00')
        || ' CUP. Pendiente: ' || to_char(abs(v_payment_diff), 'FM999999990.00') || ' CUP.';
    ELSIF v_payment_diff > 0 THEN
      v_incidence_note := 'INCIDENCIA DE PAGO: sobrepago detectado. Total de venta: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. Importe recibido: '
        || to_char(v_cash_amt + v_transfer_amt + v_zelle_amt, 'FM999999990.00')
        || ' CUP. Diferencia: ' || to_char(v_payment_diff, 'FM999999990.00')
        || ' CUP. Revisar el tratamiento del vuelto según los medios de pago utilizados.';
    ELSE
      v_incidence_note := 'INCIDENCIA DE PAGO: descuadre en el desglose de medios de pago. Total de venta: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. El desglose por línea se conserva documentado en la venta.';
    END IF;
    v_incidence_note := v_incidence_note
      || ' Validación temporal autorizada por la configuración del sistema. ['
      || to_char(v_eff AT TIME ZONE 'America/Havana', 'YYYY-MM-DD HH24:MI')
      || ' HV] usuario=' || COALESCE(v_uid::text, 'desconocido');
  END IF;
  v_notes_final := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF v_notes_final IS NOT NULL AND v_incidence_note IS NOT NULL THEN
    v_notes_final := v_notes_final || E'\n' || v_incidence_note;
  ELSIF v_incidence_note IS NOT NULL THEN
    v_notes_final := v_incidence_note;
  END IF;

  -- 14.7 MISIÓN CAJA 2026-10-23 (D6): LIQUIDACIÓN DEL COBRO — vuelto por
  --      moneda, ENLAZADO a la venta. El efecto en caja sigue siendo UNO
  --      (cash_amount neto canónico): NO se crea fila de caja aparte para el
  --      vuelto (prohibido duplicar — misión §8). Validación server-side:
  --        · importes no negativos; vuelto ≤ recibido POR MONEDA;
  --        · moneda de vuelto ∈ (CUP, USD);
  --        · cobro/vuelto en USD ⇒ tasa SERVIDOR obligatoria (jerarquía de
  --          ventas, fail-closed) con fuente registrada — sin tasas ocultas;
  --        · (recibido CUP − vuelto CUP) + (recibido USD − vuelto USD)×tasa =
  --          componente cash de la venta (±0.01) ⇒ sin diferencias contables.
  --      Sin liquidación (ventas legacy/transfer/zelle) el flujo queda
  --      IDÉNTICO a v2.23.0 (columnas NULL).
  v_settlement_present := (p_cash_received_cup IS NOT NULL OR p_cash_received_usd IS NOT NULL
    OR p_change_given_cup IS NOT NULL OR p_change_given_usd IS NOT NULL);
  IF v_settlement_present THEN
    IF COALESCE(p_cash_received_cup, 0) < 0 OR COALESCE(p_cash_received_usd, 0) < 0
       OR COALESCE(p_change_given_cup, 0) < 0 OR COALESCE(p_change_given_usd, 0) < 0 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_INVALID: los importes de la liquidación no pueden ser negativos';
    END IF;
    IF p_change_currency IS NOT NULL AND upper(btrim(p_change_currency)) NOT IN ('CUP', 'USD') THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_INVALID: moneda de vuelto no admitida (%)', p_change_currency;
    END IF;
    IF COALESCE(p_cash_received_cup, 0) + COALESCE(p_cash_received_usd, 0)
       + COALESCE(p_change_given_cup, 0) + COALESCE(p_change_given_usd, 0) > 0
       AND v_cash_amt <= 0 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_NOT_APPLICABLE: la venta no tiene componente en efectivo';
    END IF;
    -- NOTA: NO se exige «vuelto ≤ recibido POR MONEDA»: el vuelto puede darse
    -- en una moneda NO recibida (misión §8: paga 60.000 CUP → recibe 80 USD de
    -- vuelto — el cajón USD puede quedar momentáneamente negativo si no había
    -- billetes; el LIBRO por moneda lo refleja y la ENTREGA valida contra el
    -- saldo acumulado). La restricción real es CANÓNICA y se valida abajo:
    -- recibido − vuelto (a tasa servidor) = cash de la venta ≥ 0.
    IF COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0 THEN
      SELECT ser.rate, 'store_exchange_rates' INTO v_chg_rate, v_chg_rate_src
        FROM public.store_exchange_rates ser
        WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
      IF v_chg_rate IS NULL THEN
        SELECT er.rate, 'global_bcc_seg3' INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL THEN
        SELECT er.rate, 'global_' || lower(er.source) INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'Diviza'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL OR v_chg_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: el cobro/vuelto en USD exige tasa USD de la tienda (jerarquía tienda→BCC→Diviza) — sin tasa no se completa la operación (tienda %)', p_store_id;
      END IF;
    END IF;
    v_settle_net_cup := COALESCE(p_cash_received_cup, 0) - COALESCE(p_change_given_cup, 0);
    v_settle_net_usd := COALESCE(p_cash_received_usd, 0) - COALESCE(p_change_given_usd, 0);
    IF abs((v_settle_net_cup + v_settle_net_usd * COALESCE(v_chg_rate, v_server_rate)) - v_cash_amt) > 0.01 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_MISMATCH: la liquidación (%) no cuadra con el efectivo de la venta (%)',
        round(v_settle_net_cup + v_settle_net_usd * COALESCE(v_chg_rate, v_server_rate), 2), round(v_cash_amt, 2);
    END IF;
  END IF;

  -- 14.9 REVISIÓN FINAL v2.24.1 (F4) — bloqueo preventivo del vuelto NO
  --     registrable (cobros mixtos / sobrepagos sin liquidación). Un cobro
  --     cuyo importe recibido excede el total debido exige entregar vuelto
  --     físico. Sin liquidación (cash_received_*/change_given_*), ese vuelto
  --     no queda registrado en NINGUNA moneda y el libro sobreestima el
  --     efectivo disponible (defecto medio del escenario C de la auditoría).
  --     La venta se RECHAZA: el cajero debe (a) ajustar el desglose a
  --     importes exactos, (b) registrar el cobro con la liquidación de
  --     vuelto (identidad recibido − vuelto = cash de la venta, ya soportada
  --     para cualquier método), o (c) cobrar el faltante como incidencia —
  --     el pago insuficiente NO se toca: no exige salida física de caja.
  --     Ventas históricas: intactas (el gate solo aplica a INSERT nuevos).
  IF NOT v_settlement_present AND v_payment_diff > 0.01 THEN
    RAISE EXCEPTION 'ERR_OVERPAYMENT_UNREGISTERED_CHANGE: recibido (%) > total (%) sin liquidación de vuelto — el vuelto físico no sería registrable por el backend; ajuste el desglose o registre la liquidación',
      ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt, 2), ROUND(v_calculated_total, 2);
  END IF;

  -- 15. INSERT transactions — §6.3/§4/§5.4: tasa servidor, seller = v_uid,
  --     impuestos = snapshot canónico del catálogo
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name,
    -- CLASIFICATOR-PARTIES (2026-11-04): snapshot histórico del comprador
    customer_code, customer_address,
    -- MISIÓN-FLEX: nota (manual + incidencia) e incidencias estructuradas
    notes, payment_incidents,
    -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro (vuelto multimoneda)
    cash_received_cup, cash_received_usd, change_given_cup, change_given_usd,
    change_currency, change_exchange_rate, change_rate_source
  ) VALUES (
    v_tx_id, p_store_id, v_uid, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, v_applied_taxes_canonical,
    p_sale_currency, v_server_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name,
    p_customer_code, p_customer_address,
    v_notes_final, v_incidents,
    p_cash_received_cup, p_cash_received_usd, p_change_given_cup, p_change_given_usd,
    CASE WHEN v_settlement_present THEN COALESCE(upper(btrim(p_change_currency)),
      CASE WHEN COALESCE(p_change_given_usd, 0) > 0 THEN 'USD' ELSE 'CUP' END) END,
    CASE WHEN v_settlement_present AND (COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0)
      THEN v_chg_rate END,
    CASE WHEN v_settlement_present AND (COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0)
      THEN v_chg_rate_src END
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
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid AND store_id = p_store_id;
      v_price := COALESCE(v_product_price, 0);
    END IF;
    v_price := ROUND(v_price, 2);

    -- FIX-USD-CUP-RATE (2026-10-14): conversión del item a la moneda común CUP.
    -- La tasa del item (client-sent, persistida en transaction_items.exchange_rate)
    -- aplica SOLO a items no-CUP; CUP = 1 por definición. Fail-safe: tasa nula o
    -- <= 0 -> 1.0 (la venta CUP pura NO cambia; regresión cero).
    v_item_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'CUP');
    IF v_item_currency = 'CUP' THEN
      v_item_rate := 1.0;
    ELSE
      v_item_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::numeric, 1.0);
      IF v_item_rate <= 0 THEN
        v_item_rate := 1.0;
      END IF;
    END IF;

    SELECT e INTO v_snap FROM jsonb_array_elements(v_line_snapshot) AS e
      WHERE (e->>'ord')::bigint = v_ord;

    SELECT cost_average INTO v_cost
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;
    -- CP-CATALOGO (2026-10-28): fallback legacy eliminado (leía el costo por id
    -- sin filtro de tienda). Fail-closed con la misma semántica del bloque 1.
    IF v_cost IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.products WHERE id = v_pid) THEN
        RAISE EXCEPTION 'ERR_STORE_MISMATCH: el producto % pertenece a otra tienda (solicitada: %)', v_pid, p_store_id;
      END IF;
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: el producto % no existe', v_pid;
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
      -- FIX-USD-CUP-RATE: precio CUP del item con SU tasa (antes v_server_rate,
      -- que es la tasa de la VENTA y es 1 en ventas CUP: un item USD quedaba
      -- registrado con su precio nativo como si fuera CUP).
      v_price * v_item_rate,
      (v_snap->>'catalog_price')::numeric,
      COALESCE((v_snap->>'discount_value')::numeric, 0),
      COALESCE((v_snap->>'discount_pct')::numeric, 0)
    );
  END LOOP;

  -- 17. payment_transactions (fuente autoritativa de pagos) — §6.3: zelle
  --     siempre con la tasa servidor
  -- MISIÓN PAGOS MIXTOS (2026-10-24): con componentes, el ledger registra
  -- UNA FILA POR COMPONENTE con su MONEDA REAL y la TASA DE LA OPERACIÓN
  -- persistida (exchange_rate de la fila USD = tasa servidor §13.7). El
  -- invariante PT011 (Σ amount_cup = total) se preserva EXACTO porque los
  -- pools del INSERT de la venta se derivaron de estos mismos componentes a
  -- esta misma tasa. Sin componentes: flujo previo (pool canónico CUP).
  IF v_components_ok THEN
    FOR v_comp IN SELECT * FROM jsonb_array_elements(p_payment_components) LOOP
      v_comp_method := lower(btrim(COALESCE(v_comp->>'method', '')));
      v_comp_cur := upper(btrim(COALESCE(v_comp->>'currency', '')));
      v_comp_amt := COALESCE(NULLIF(v_comp->>'amount', '')::numeric, NULL);
      IF v_comp_method = 'zelle' THEN
        -- Zelle: mismas reglas canónicas del flujo previo (riel USD, tasa > 1,
        -- moneda de venta USD/EUR/MLC).
        IF p_sale_currency = 'CUP' OR v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
          RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and server_exchange_rate > 1. Got: currency=%, rate=%',
            p_sale_currency, v_usd_rate USING ERRCODE = 'PT009';
        END IF;
        IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
          RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
            p_sale_currency USING ERRCODE = 'PT004';
        END IF;
      END IF;
      INSERT INTO public.payment_transactions (
        store_id, ref_type, ref_id, transaction_id,
        amount, payment_method, currency, exchange_rate,
        payment_date, paid_by, idempotency_key
      ) VALUES (
        p_store_id, 'sale', v_tx_id, v_tx_id,
        v_comp_amt, v_comp_method, v_comp_cur,
        CASE WHEN v_comp_cur = 'USD' THEN v_usd_rate ELSE 1.0 END,
        v_eff, v_uid, 'pay-' || v_comp_method || '-' || v_comp_cur || '-' || v_tx_id::text
      ) RETURNING id INTO v_pt_id;
    END LOOP;
  ELSIF v_cash_amt > 0 THEN
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

  IF NOT v_components_ok AND v_zelle_amt > 0 THEN
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
    IF v_incidents IS NULL THEN
      RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
        v_sum_payments, v_calculated_total USING ERRCODE = 'PT011';
    END IF;
    -- MISIÓN-FLEX: venta con incidencia de pago documentada — la diferencia
    -- entre lo recibido y el total queda registrada en notes +
    -- payment_incidents + evento SALE_PAYMENT_INCIDENT (trazabilidad).
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
      'tax_authority', 'tax_configurations_server_side',
      -- MISIÓN-FLEX (2026-10-17): incidencias de pago y nota de la venta
      'has_payment_incident', v_has_payment_incident,
      'payment_diff_cup', v_payment_diff,
      'payment_incidents', COALESCE(v_incidents, '[]'::jsonb),
      'sale_notes', v_notes_final,
      -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro auditada
      'cash_settlement_present', v_settlement_present,
      'cash_received_cup', p_cash_received_cup,
      'cash_received_usd', p_cash_received_usd,
      'change_given_cup', p_change_given_cup,
      'change_given_usd', p_change_given_usd,
      'change_rate', v_chg_rate,
      'change_rate_source', v_chg_rate_src,
      -- MISIÓN PAGOS MIXTOS (2026-10-24): desglose por moneda auditado
      'payment_components', COALESCE(p_payment_components, 'null'::jsonb),
      'usd_operation_rate', v_usd_rate,
      'usd_operation_rate_source', v_usd_rate_source
    ));

  -- 20.5 MISIÓN-FLEX: evento de auditoría dedicado por venta con incidencia
  --     de pago (visible y filtrable en Inicio → OPERACIÓN → Auditoría).
  --     Vive en la MISMA transacción de la venta: sin duplicados en reintentos
  --     (idempotencia §5) y jamás se registra si la venta no se persiste.
  IF v_has_payment_incident THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('SALE_PAYMENT_INCIDENT', 'transactions', v_tx_id, p_store_id, v_uid,
      jsonb_build_object(
        'transaction_id', v_tx_id,
        'total_amount', v_calculated_total,
        'received_amount_cup', ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt, 2),
        'difference_cup', v_payment_diff,
        'incidents', v_incidents,
        'note', v_notes_final,
        'payment_method', v_effective_method,
        'flexibilization', 'temporal_payment_validation',
        'policy_version', 'MISION-FLEX-2026-10-17'
      ));
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END $function$;

-- ─── register_reception (definición vigente de producción, verbatim) ───
-- Misma disciplina: la firma se amplió (7→11 params) con snapshot del proveedor.
DROP FUNCTION IF EXISTS public.register_reception;

CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid, p_supplier_code text DEFAULT NULL::text, p_supplier_address text DEFAULT NULL::text, p_supplier_phone text DEFAULT NULL::text, p_supplier_tax_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor NUMERIC := 1;
  v_units_to_add NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
  v_uc_base NUMERIC;
  -- MISIÓN RECEPCIONES (2026-10-27): alta transaccional de productos nuevos
  v_new_product JSONB;
  v_new_sku TEXT;
  v_new_tenant_id UUID;
  v_created_skus TEXT[] := '{}';
  v_new_products_count INTEGER := 0;
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- B2 (v2.23.0): Supplier is required
  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  -- B3 (v2.23.0): Items array must not be empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  -- D1 (misión recepciones 2026-10-27): factura duplicada → error accionable.
  -- Antes este caso reventaba como 23505 crudo (idx_receipts_store_reference_doc)
  -- y el frontend lo clasificaba erróneamente como "SKU ya existe".
  IF p_invoice_number IS NOT NULL AND btrim(p_invoice_number) <> '' AND EXISTS (
    SELECT 1 FROM public.receipts
    WHERE store_id = p_store_id
      AND reference_doc IS NOT NULL
      AND reference_doc = btrim(p_invoice_number)
  ) THEN
    RAISE EXCEPTION 'ERR_INVOICE_DUPLICATE: el número de factura "%" ya existe en esta tienda. Usa un número distinto.', btrim(p_invoice_number);
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id,
    -- CLASIFICATOR-PARTIES (2026-11-04): snapshot identificativo del proveedor
    supplier_code, supplier_address, supplier_phone, supplier_tax_id
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id,
    p_supplier_code, p_supplier_address, p_supplier_phone, p_supplier_tax_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    -- B4 (v2.23.0): Reject items with unit_cost <= 0
    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;

    -- D2 (misión recepciones 2026-10-27): alta transaccional del producto
    -- nuevo. Un item SIN product_id pero CON objeto new_product crea el
    -- producto DENTRO de esta transacción: si cualquier paso posterior de la
    -- recepción falla, el producto se revierte con todo lo demás (sin
    -- huérfanos). La ambigüedad product_id + new_product se rechaza.
    IF v_item ? 'new_product' THEN
      IF v_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_AMBIGUOUS_ITEM: el item trae product_id y new_product a la vez';
      END IF;
      v_new_product := v_item->'new_product';
      v_new_sku := btrim(COALESCE(v_new_product->>'sku', ''));
      IF v_new_sku = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo requiere sku';
      END IF;
      IF btrim(COALESCE(v_new_product->>'name', '')) = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre', v_new_sku;
      END IF;
      IF v_new_sku = ANY (v_created_skus) THEN
        RAISE EXCEPTION 'ERR_SKU_DUPLICATE_PAYLOAD: el SKU "%" aparece más de una vez entre los productos nuevos de la recepción', v_new_sku;
      END IF;
      -- Unicidad REAL contra el catálogo de la tienda (mismo modelo que
      -- products_sku_store_unique). Mensión misión: si ya existe, el usuario
      -- debe SELECCIONARLO como existente, no crearlo de nuevo.
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE store_id = p_store_id AND sku = v_new_sku
      ) THEN
        RAISE EXCEPTION 'ERR_SKU_EXISTS: el SKU "%" ya existe en el catálogo de esta tienda. Selecciona el producto existente en lugar de crearlo de nuevo.', v_new_sku;
      END IF;
      -- tenant fail-closed (paridad products_tenant_insert / RLS-FIX cliente)
      IF v_new_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;
      INSERT INTO public.products (
        store_id, tenant_id, sku, name, cost_price, price,
        unit_of_measure, is_active, is_complete, stock_current
      ) VALUES (
        p_store_id, v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'),
        COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
        COALESCE((v_new_product->>'price')::NUMERIC, 0),
        COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
        TRUE,
        COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
        0
      ) RETURNING id INTO v_product_id;
      v_created_skus := array_append(v_created_skus, v_new_sku);
      v_new_products_count := v_new_products_count + 1;
    END IF;

    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    -- C1 (v2.23.0): Validate exchange rate is within reasonable range
    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

    -- C2 (v2.23.0): Warning if product has expired lots (non-blocking)
    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id AND store_id = p_store_id
        AND expiration_date IS NOT NULL
        AND expiration_date < v_effective_date
        AND quantity_remaining > 0
    ) THEN
      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    -- B5 (v2.23.0): Product must exist in store — RAISE EXCEPTION (not CONTINUE)
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- REM-F4-04 (gate 20260908-rem-f4-04): el camino real de recepción termina
    -- en el escritor canónico. El trigger trg_update_product_wac (referenciado
    -- por el comentario A1 v2.22.0) NO existe en la BD viva y
    -- register_stock_movement ya no escribe WAC (A2 v2.22.0).
    -- Orden doctrina W62-01 §6 (idéntico a confirm_pending_reception):
    -- WAC primero → movimiento después (kardex ve ca_new).
    -- Costo por unidad BASE para el blend canónico:
    --   q·uc = units_to_add · (unit_cost_cup/factor) = unit_cost_cup · quantity
    v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                      THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                      ELSE v_unit_cost_cup END;
    PERFORM public.fn_recalc_wac(
      p_store_id   := p_store_id,
      p_product_id := v_product_id,
      p_event      := 'reception_in',
      p_qty_in     := v_units_to_add,
      p_uc_in      := v_uc_base,
      p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );


    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object(
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id,
      'new_products_created', v_new_products_count
    ));

  RETURN v_receipt_id;
END
$function$;
