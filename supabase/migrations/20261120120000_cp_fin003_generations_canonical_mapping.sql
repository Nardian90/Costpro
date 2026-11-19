-- ============================================================================
-- CP-FIN-003 — GENERACIONES CONTABLES + MAPEO CANÓNICO DE CUENTAS FINANCIERAS
-- Misión: CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
--         + ANEXO VINCULANTE (universalización del registro de medios de pago)
-- Expediente: docs/audits/CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-001/
--
-- Contenido (idempotente):
--   1. Nuevas categorías: ACT_TRANSF_EXTERIOR, ACT_EFECTIVO_EUR, ACT_EFECTIVO_MLC
--   2. fin_account_mapping — mapeo canónico (medio × moneda → cuenta) único
--      para los tres orígenes (VENTA cobros, SERVICIO/RECEPCIÓN pagos, UI)
--   3. fin_posting_generations — generaciones contables versionadas +
--      fin_entries.generation_id + GEN-0 legado por tienda + trigger default
--   4. fin_active_generation() — resolución de la generación activa
--   5. fin_post_document / _safe / _annulment — conscientes de generación
--
-- Reglas de oro (misión §2): la generación anterior NUNCA se borra; la nueva
-- se construye aislada (status building/candidate), se valida, se activa
-- ATÓMICAMENTE y es reversible (rollback). Nunca dos activas por tienda.
-- ============================================================================
-- NOTA: sin BEGIN/COMMIT global (convención del canal canónico de despliegue
-- por lotes; cada sentencia es idempotente por sí misma).

-- ══════════════════════════════════════════════════════════════════════════
-- 1. CATEGORÍAS NUEVAS (catálogo global del sistema)
--    Mandato §4: Transf. Exterior → cuenta de transferencia exterior;
--    Efectivo EUR/MLC → su propia caja (matriz completa del carrito).
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_categories (code, name, clase, grupo, is_system, sort_order, description) VALUES
  ('ACT_TRANSF_EXTERIOR', 'Transferencias del exterior', 'activo', 'activo_corriente', true, 13,
   'Transferencias recibidas/enviadas desde el exterior (Zelle y similares)'),
  ('ACT_EFECTIVO_EUR', 'Efectivo en caja (EUR)', 'activo', 'activo_corriente', true, 12,
   'Billetes EUR disponibles en caja'),
  ('ACT_EFECTIVO_MLC', 'Efectivo en caja (MLC)', 'activo', 'activo_corriente', true, 12,
   'Saldo MLC disponible en caja')
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. MAPEO CANÓNICO — el medio de pago determina la cuenta financiera y la
--    moneda determina la denominación (misión §4 y anexo §2/§6). UNA sola
--    tabla consultada por el motor (reglas v3/v2), por la UI de configuración
--    y por cualquier escritor futuro. La moneda NUNCA sustituye al medio.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_account_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method text NOT NULL
    CONSTRAINT fin_map_method_check CHECK (payment_method IN ('cash', 'transfer', 'zelle')),
  currency text NOT NULL
    CONSTRAINT fin_map_currency_check CHECK (currency IN ('CUP', 'USD', 'EUR', 'MLC')),
  category_code text NOT NULL REFERENCES public.fin_categories (code),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid REFERENCES public.profiles (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_account_mapping_key UNIQUE (payment_method, currency)
);

COMMENT ON TABLE public.fin_account_mapping IS
  'CP-FIN-003: mapeo canónico (medio de pago × moneda) → cuenta financiera. '
  'Única fuente de verdad para clasificar cobros y pagos. El medio determina '
  'la cuenta; la moneda determina la denominación. Nunca USD=Zelle por defecto.';

INSERT INTO public.fin_account_mapping (payment_method, currency, category_code, notes) VALUES
  ('cash',     'CUP', 'ACT_EFECTIVO_CUP',     'Efectivo en caja CUP'),
  ('cash',     'USD', 'ACT_EFECTIVO_USD',     'Efectivo en caja USD'),
  ('cash',     'EUR', 'ACT_EFECTIVO_EUR',     'Efectivo en caja EUR'),
  ('cash',     'MLC', 'ACT_EFECTIVO_MLC',     'Efectivo en caja MLC'),
  ('transfer', 'CUP', 'ACT_BANCOS',           'Transferencia nacional'),
  ('transfer', 'USD', 'ACT_BANCOS',           'Transferencia nacional en USD'),
  ('transfer', 'EUR', 'ACT_BANCOS',           'Transferencia nacional en EUR'),
  ('transfer', 'MLC', 'ACT_BANCOS',           'Transferencia nacional en MLC'),
  ('zelle',    'USD', 'ACT_TRANSF_EXTERIOR',  'Transferencia exterior (Zelle) USD'),
  ('zelle',    'EUR', 'ACT_TRANSF_EXTERIOR',  'Transferencia exterior (Zelle) EUR')
ON CONFLICT (payment_method, currency) DO UPDATE
  SET category_code = EXCLUDED.category_code, updated_at = now();

-- Resolución canónica (fail-closed): combinación sin mapeo activo → excepción.
CREATE OR REPLACE FUNCTION public.fin_resolve_financial_account(
  p_method text, p_currency text
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
DECLARE v_cat text;
BEGIN
  IF p_method IS NULL OR p_currency IS NULL THEN
    RAISE EXCEPTION 'ERR_METODO_MONEDA_REQUERIDOS: medio=% moneda=%', p_method, p_currency;
  END IF;
  SELECT category_code INTO v_cat FROM public.fin_account_mapping
  WHERE payment_method = p_method AND currency = p_currency AND is_active;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'ERR_COMBINACION_NO_SOPORTADA: medio % + moneda % sin cuenta financiera configurada',
      p_method, p_currency;
  END IF;
  RETURN v_cat;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. GENERACIONES CONTABLES (misión §2/§7.1: reinicio controlado, no borrado)
--    building → candidate → active → superseded / rolled_back.
--    Una sola activa por tienda (índice único parcial).
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_posting_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'building'
    CONSTRAINT fin_gen_status_check
    CHECK (status IN ('building', 'candidate', 'active', 'superseded', 'rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  activated_at timestamptz,
  activated_by uuid REFERENCES public.profiles (id),
  superseded_at timestamptz,
  snapshot jsonb,
  stats jsonb,
  notes text,
  CONSTRAINT fin_posting_generations_code_key UNIQUE (store_id, code)
);

COMMENT ON TABLE public.fin_posting_generations IS
  'CP-FIN-003: generaciones del libro contable por tienda. La activa es la '
  'única que ven los informes; las sustituidas se conservan para auditoría. '
  'Los asientos históricos NUNCA se borran (fin_entries.generation_id).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_gen_one_active
  ON public.fin_posting_generations (store_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fin_gen_store
  ON public.fin_posting_generations (store_id, created_at DESC);

ALTER TABLE public.fin_entries ADD COLUMN IF NOT EXISTS generation_id uuid
  REFERENCES public.fin_posting_generations (id);

CREATE INDEX IF NOT EXISTS idx_fin_entries_generation
  ON public.fin_entries (generation_id) WHERE generation_id IS NOT NULL;

COMMENT ON COLUMN public.fin_entries.generation_id IS
  'CP-FIN-003: generación contable del asiento. NULL = legado de tienda sin generaciones.';

-- Idempotencia POR GENERACIÓN: un documento no puede contabilizarse dos veces
-- por el mismo evento/pago dentro de la MISMA generación. Sentinel ffff… para
-- la generación NULL (tiendas sin generaciones conservan el comportamiento
-- anterior). Se sustituye el índice original (misma garantía + dimensión gen).
DROP INDEX IF EXISTS uq_fin_entries_doc_event;
CREATE UNIQUE INDEX uq_fin_entries_doc_event
  ON public.fin_entries (
    document_type, document_id, event,
    COALESCE(payment_ref, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(generation_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  WHERE document_id IS NOT NULL;

-- Generación ACTIVA de una tienda (NULL si no tiene generaciones: legado puro).
CREATE OR REPLACE FUNCTION public.fin_active_generation(p_store_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
  SELECT g.id FROM public.fin_posting_generations g
  WHERE g.store_id = p_store_id AND g.status = 'active'
  LIMIT 1
$$;

-- GEN-0 legado: toda tienda con asientos existentes recibe SU generación
-- inicial activa que los agrupa. Idempotente y multitienda (Puerto Padre y
-- tiendas de prueba incluidas: el mecanismo es común; la RECONSTRUCCIÓN solo
-- se ejecuta donde el propietario autoriza — ENERVIDA).
DO $$
DECLARE r record; v_gen uuid;
BEGIN
  -- Solo tiendas REALES (JOIN stores): la BD aislada de E2E conserva
  -- asientos de artefactos de prueba con store_id huérfano que no deben
  -- (ni pueden, por FK) recibir generación. Producción: 0 huérfanos
  -- (verificado 2026-11-20: 1122 asientos, 3 tiendas).
  FOR r IN SELECT DISTINCT e.store_id, count(*) AS n
           FROM public.fin_entries e
           JOIN public.stores s ON s.id = e.store_id
           WHERE e.generation_id IS NULL
           GROUP BY e.store_id
  LOOP
    INSERT INTO public.fin_posting_generations (store_id, code, status, notes, snapshot)
    VALUES (r.store_id, 'GEN-0', 'active',
            'Generación legado: asientos existentes agrupados por la migración CP-FIN-003 (sin cambios de contenido).',
            jsonb_build_object('entries', r.n, 'origen', 'migracion-cp-fin-003'))
    ON CONFLICT (store_id, code) DO NOTHING
    RETURNING id INTO v_gen;
    IF v_gen IS NULL THEN
      SELECT id INTO v_gen FROM public.fin_posting_generations
      WHERE store_id = r.store_id AND code = 'GEN-0';
    END IF;
    UPDATE public.fin_entries SET generation_id = v_gen
    WHERE store_id = r.store_id AND generation_id IS NULL;
  END LOOP;
END $$;

-- Default de escritura: TODO asiento nuevo sin generación explícita cae en la
-- generación ACTIVA de su tienda (los escritores históricos no cambian).
CREATE OR REPLACE FUNCTION public.fin_trg_entries_generation_default()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
DECLARE v_gen uuid;
BEGIN
  IF NEW.generation_id IS NULL THEN
    SELECT id INTO v_gen FROM public.fin_posting_generations
    WHERE store_id = NEW.store_id AND status = 'active' LIMIT 1;
    NEW.generation_id := v_gen; -- NULL permitido (tienda sin generaciones)
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fin_trg_entries_generation ON public.fin_entries;
CREATE TRIGGER fin_trg_entries_generation
  BEFORE INSERT ON public.fin_entries
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_entries_generation_default();

-- ══════════════════════════════════════════════════════════════════════════
-- 4. MOTOR CONSCIENTE DE GENERACIÓN
--    BASE = cuerpo LIVE verificado (migración 20261118130000 §3, con
--    amount_origin). Cambios: parámetro p_generation_id (NULL → activa de la
--    tienda) aplicado a idempotencia e INSERT.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_post_document(
  p_doctype text, p_document_id uuid, p_event text,
  p_payment_ref uuid DEFAULT NULL, p_actor uuid DEFAULT NULL,
  p_generation_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_rule public.fin_rule_versions%ROWTYPE;
  v_metrics jsonb; v_movs jsonb; t jsonb;
  v_entry_id uuid; v_debit numeric := 0; v_credit numeric := 0;
  v_store uuid; v_docnum text; v_date date;
  v_gen uuid;
BEGIN
  IF p_document_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_DOCUMENT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));

  v_metrics := public.fin_compute_metrics(p_doctype, p_document_id, p_event, p_payment_ref);
  v_store := (v_metrics ->> 'store_id')::uuid;
  v_docnum := v_metrics ->> 'doc_number';
  v_date := (v_metrics ->> 'economic_date')::date;

  -- Generación destino: explícita (construcción de candidata) o la ACTIVA.
  v_gen := coalesce(p_generation_id, public.fin_active_generation(v_store));

  -- Idempotencia (doble clic, reintento, concurrencia) DENTRO de la generación
  IF EXISTS (
    SELECT 1 FROM public.fin_entries e
    WHERE e.document_type = p_doctype AND e.document_id = p_document_id
      AND e.event = p_event AND e.payment_ref IS NOT DISTINCT FROM p_payment_ref
      AND e.generation_id IS NOT DISTINCT FROM v_gen
  ) THEN
    RETURN NULL;
  END IF;

  v_rule := public.fin_resolve_rule(p_doctype, v_store);
  IF v_rule.id IS NULL THEN RETURN NULL; END IF;               -- sin regla activa: no contabiliza

  v_movs := public.fin_apply_templates(v_rule.movements, p_event, v_metrics);
  IF v_movs = '[]'::jsonb THEN RETURN NULL; END IF;            -- regla sin efectos para este doc

  SELECT coalesce(sum(CASE WHEN m ->> 'sentido' = 'debito' THEN (m ->> 'amount')::numeric ELSE 0 END), 0),
         coalesce(sum(CASE WHEN m ->> 'sentido' = 'credito' THEN (m ->> 'amount')::numeric ELSE 0 END), 0)
    INTO v_debit, v_credit
  FROM jsonb_array_elements(v_movs) m;

  IF p_event NOT IN ('apertura', 'ajuste_manual') AND abs(v_debit - v_credit) > 0.01 THEN
    RAISE EXCEPTION 'ERR_UNBALANCED: débitos=% créditos=% (tipo=% doc=%)',
      v_debit, v_credit, p_doctype, p_document_id;
  END IF;

  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, rule_version_id, movements_snapshot, description, created_by,
    generation_id)
  VALUES (
    v_store, p_doctype, p_document_id, v_docnum, p_event, p_payment_ref,
    v_date, v_rule.id, v_movs,
    v_metrics ->> 'descripcion_documento', p_actor, v_gen)
  RETURNING id INTO v_entry_id;

  FOR t IN SELECT * FROM jsonb_array_elements(v_movs) LOOP
    INSERT INTO public.fin_movements (
      entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
      economic_date, document_number, description, currency_origin, amount_origin, traza)
    VALUES (
      v_entry_id, v_store, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
      'CUP', 1, v_date, v_docnum, v_metrics ->> 'descripcion_documento',
      t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, t -> 'traza');
  END LOOP;

  RETURN v_entry_id;
END $function$;

-- CP-FIN-003: la firma ampliada (6 params) NO sustituye la vieja (5 params):
-- CREATE OR REPLACE con distinto número de parámetros crea una SOBRECARGA y
-- las llamadas de los triggers (3 args implícitos) quedan ambiguas. Se elimina
-- la firma anterior explícitamente.
DROP FUNCTION IF EXISTS public.fin_post_document(text, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fin_post_document_safe(
  p_doctype text, p_document_id uuid, p_event text, p_payment_ref uuid DEFAULT NULL,
  p_generation_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry uuid;
BEGIN
  BEGIN
    v_entry := public.fin_post_document(p_doctype, p_document_id, p_event, p_payment_ref,
                                        NULL, p_generation_id);
    RETURN v_entry;
  EXCEPTION WHEN others THEN
    INSERT INTO public.fin_posting_errors (store_id, document_type, document_id, event, error_code, error_detail)
    VALUES (
      (SELECT CASE p_doctype
         WHEN 'VENTA' THEN (SELECT store_id FROM public.transactions WHERE id = p_document_id)
         WHEN 'DEVOLUCION_VENTA' THEN (SELECT store_id FROM public.devolutions WHERE id = p_document_id)
         WHEN 'RECEPCION' THEN (SELECT store_id FROM public.receipts WHERE id = p_document_id)
         WHEN 'SERVICIO_RECIBIDO' THEN (SELECT store_id FROM public.received_services WHERE id = p_document_id)
         WHEN 'VALE_SALIDA' THEN (SELECT store_id FROM public.issue_slips WHERE id = p_document_id)
         WHEN 'AJUSTE_INVENTARIO' THEN (SELECT store_id FROM public.inventory_adjustments WHERE id = p_document_id)
         WHEN 'COMISION' THEN (SELECT store_id FROM public.commission_payments WHERE id = p_document_id)
         WHEN 'NOMINA' THEN (SELECT store_id FROM public.payrolls WHERE id = p_document_id)
         WHEN 'FLUJO_CAJA' THEN (SELECT store_id FROM public.cash_flow_documents WHERE id = p_document_id)
         ELSE NULL END),
      p_doctype, p_document_id, p_event,
      substr(SQLERRM, 1, 80), substr(SQLERRM || ' | ' || coalesce(SQLSTATE, ''), 1, 2000));
    RETURN NULL;
  END;
END $function$;

DROP FUNCTION IF EXISTS public.fin_post_document_safe(text, uuid, text, uuid);

-- Anulación compensatoria consciente de generación.
-- BASE = cuerpo LIVE (20261118130000 §4, guard T12 de reversión parcial).
-- Cambios: p_generation_id (NULL → activa de la tienda del documento);
-- compensa SOLO asientos de esa generación y marca los nuevos con ella.
CREATE OR REPLACE FUNCTION public.fin_post_document_annulment(
  p_doctype text, p_document_id uuid,
  p_generation_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  e record; m record; v_new uuid; v_count integer := 0;
  v_residual numeric;
  v_store uuid; v_gen uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));

  v_store := (SELECT store_id FROM public.fin_entries
              WHERE document_type = p_doctype AND document_id = p_document_id
              ORDER BY posted_at LIMIT 1);
  IF v_store IS NULL THEN RETURN 0; END IF;
  v_gen := coalesce(p_generation_id, public.fin_active_generation(v_store));

  FOR e IN
    SELECT * FROM public.fin_entries
    WHERE document_type = p_doctype AND document_id = p_document_id
      AND status = 'posted' AND event IN ('reconocimiento', 'pago')
      AND generation_id IS NOT DISTINCT FROM v_gen
    ORDER BY posted_at
  LOOP
    -- ¿ya tiene anulación? (idempotencia dentro de la generación)
    IF EXISTS (SELECT 1 FROM public.fin_entries x
               WHERE x.reversal_of = e.id) THEN
      v_residual := public.fin_entry_reversal_residual(e.id);
      IF v_residual <= 0.01 THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: el asiento % (doc % %) tiene reversiones parciales enlazadas y un residual de % CUP sin compensar. Regularice primero el residual contable (asiento explícito documentado, p. ej. runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario. El canal _safe registra este intento en fin_posting_errors.',
        e.id, p_doctype, p_document_id, v_residual;
    END IF;
    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, payment_ref,
      economic_date, rule_version_id, movements_snapshot, reversal_of, description, created_by,
      generation_id)
    VALUES (
      e.store_id, e.document_type, e.document_id, e.document_number, 'anulacion',
      e.payment_ref, e.economic_date, e.rule_version_id, e.movements_snapshot, e.id,
      'Anulación: ' || coalesce(e.description, ''), e.created_by, v_gen)
    RETURNING id INTO v_new;
    FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = e.id LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, amount_origin, traza)
      VALUES (
        v_new, m.store_id, m.category_code,
        CASE WHEN m.sense = 'debito' THEN 'credito' ELSE 'debito' END,
        m.amount, m.currency, m.exchange_rate, m.economic_date, m.document_number,
        'Anulación: ' || coalesce(m.description, ''), m.currency_origin,
        m.amount_origin,
        m.traza || jsonb_build_object('anulacion_de', m.id));
    END LOOP;
    UPDATE public.fin_entries SET status = 'reversed' WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;

DROP FUNCTION IF EXISTS public.fin_post_document_annulment(text, uuid);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. MÉTRICAS v4 — BASE = cuerpo LIVE (migración 20261119120000, verificado
--    por contract-surface 212). Únicos cambios (anexo §2/§8): el evento pago
--    de SERVICIO_RECIBIDO y RECEPCIÓN expone la MONEDA del pago y su importe
--    ORIGINAL, para que la regla resuelva la cuenta financiera por
--    (medio × moneda) y conserve el nominal entregado.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_compute_metrics(
  p_doctype text, p_document_id uuid,
  p_event text DEFAULT 'reconocimiento',
  p_payment_ref uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  v_store uuid; v_docnum text; v_date date; v_status text;
  v_cur text; v_rate numeric; v_amt numeric;
  v_total_cup numeric; v_cogs numeric; v_missing int;
  v_txt text; v_num numeric;
  v_missing_txt text;
  v_id uuid; v_total_origin numeric;
  v_fb_usd_settle numeric; v_fb_settle_cup numeric;
  v_fb_usd_items numeric; v_fb_carve_cup numeric;
  v_fb_cash_amount numeric; v_fb_usd_nom numeric;
  v_fb_usd_cup numeric; v_fb_cup_cash numeric;
  v_fb_otras_cob numeric;
  v_total_cob numeric;
  v_ts timestamptz;
  v_pt public.payment_transactions%ROWTYPE;
  r record;
BEGIN
  CASE p_doctype

  WHEN 'VENTA' THEN
    SELECT t.store_id, t.invoice_number, t.created_at::date, t.status,
           t.sale_currency, t.sale_exchange_rate, t.total_amount, t.id
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt, v_id
    FROM public.transactions t WHERE t.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: transacción %', p_document_id; END IF;
    v_total_cup := round(coalesce(v_amt, 0), 2);
    v_total_origin := NULL;
    IF coalesce(v_cur, 'CUP') <> 'CUP' THEN
      SELECT coalesce(sum(ti.quantity * ti.price_at_sale), 0) INTO v_total_origin
      FROM public.transaction_items ti
      WHERE ti.transaction_id = p_document_id
        AND ti.price_currency = v_cur;
      IF coalesce(v_total_origin, 0) <= 0 THEN v_total_origin := NULL; END IF;
    END IF;
    SELECT coalesce(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 0),
           count(*) FILTER (WHERE coalesce(ti.cost_at_sale, 0) = 0)
      INTO v_cogs, v_missing
    FROM public.transaction_items ti
    LEFT JOIN public.products p ON p.id = ti.product_id
    WHERE ti.transaction_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Venta ' || coalesce(v_docnum, substr(v_id::text, 1, 8)),
      'total_cup', v_total_cup, 'costo_productos_cup', round(v_cogs, 2),
      'lineas_sin_costo', v_missing,
      'total_cup_origin', v_total_origin,
      'tasa_documento', CASE WHEN coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_rate, 0) > 0
                             THEN v_rate ELSE NULL END,
      'cob_cash_cup', 0, 'cob_cash_usd_cup', 0,
      'cob_transfer_cup', 0, 'cob_transfer_usd_cup', 0, 'cob_zelle_usd_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup,
             sum(pt.amount) FILTER (WHERE pt.currency <> 'CUP') AS origin
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'sale' AND pt.ref_id = p_document_id
        AND coalesce(pt.direction, 'in') = 'in'
      GROUP BY 1, 2
    LOOP
      v := jsonb_set(v, ARRAY['cob_' || r.metodo ||
                     CASE WHEN lower(coalesce(r.moneda, 'cup')) = 'cup' THEN ''
                          ELSE '_' || lower(r.moneda) END || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
      IF lower(coalesce(r.moneda, 'cup')) <> 'cup' AND coalesce(r.origin, 0) > 0 THEN
        v := jsonb_set(v, ARRAY['cob_' || r.metodo || '_' || lower(r.moneda) || '_cup_origin'],
                       to_jsonb(round(r.origin, 2)));
      END IF;
    END LOOP;

    IF coalesce((v ->> 'cob_cash_usd_cup')::numeric, 0) = 0 THEN
      SELECT coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0),
             coalesce(t.cash_received_cup, 0) - coalesce(t.change_given_cup, 0),
             coalesce(t.cash_amount, 0)
        INTO v_fb_usd_settle, v_fb_settle_cup, v_fb_cash_amount
      FROM public.transactions t WHERE t.id = p_document_id;
      SELECT coalesce(sum(ti.cash_paid), 0),
             coalesce(sum(ti.cash_paid * ti.exchange_rate), 0)
        INTO v_fb_usd_items, v_fb_carve_cup
      FROM public.transaction_items ti
      WHERE ti.transaction_id = p_document_id
        AND ti.cash_currency = 'USD' AND ti.currency = 'USD'
        AND coalesce(ti.cash_paid, 0) > 0;
      IF coalesce(v_fb_usd_settle, 0) > 0 THEN
        v_fb_usd_nom := v_fb_usd_settle;
        v_fb_otras_cob := round(coalesce((v ->> 'cob_transfer_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_transfer_usd_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_zelle_usd_cup')::numeric, 0), 2);
        v_fb_usd_cup := round(v_total_cup - coalesce(v_fb_settle_cup, 0) - v_fb_otras_cob, 2);
        v_fb_cup_cash := round(coalesce(v_fb_settle_cup, 0), 2);
      ELSIF coalesce(v_fb_usd_items, 0) > 0 THEN
        v_fb_usd_nom := v_fb_usd_items;
        v_fb_usd_cup := round(coalesce(v_fb_carve_cup, 0), 2);
        v_fb_cup_cash := greatest(round(coalesce(v_fb_cash_amount, v_total_cup), 2) - v_fb_usd_cup, 0);
      END IF;
      IF coalesce(v_fb_usd_nom, 0) > 0 THEN
        v := jsonb_set(v, ARRAY['cob_cash_cup'], to_jsonb(coalesce(v_fb_cup_cash, 0)));
        v := jsonb_set(v, ARRAY['cob_cash_usd_cup'], to_jsonb(coalesce(v_fb_usd_cup, 0)));
        v := v || jsonb_build_object(
          'efectivo_fisico_usd', coalesce(v_fb_usd_nom, 0),
          'fuente_efectivo', CASE WHEN coalesce(v_fb_usd_settle, 0) > 0
                                  THEN 'settlement' ELSE 'carve_items' END);
      END IF;
    END IF;

    v_total_cob := round(coalesce((v ->> 'cob_cash_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_cash_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_zelle_usd_cup')::numeric, 0), 2);
    v := v || jsonb_build_object(
      'cob_total_cup', v_total_cob,
      'diferencia_cobro_debe_cup', round(greatest(v_total_cup - v_total_cob, 0), 2),
      'diferencia_cobro_haber_cup', round(greatest(v_total_cob - v_total_cup, 0), 2));

  WHEN 'DEVOLUCION_VENTA' THEN
    SELECT d.store_id, d.devolution_number, d.processed_at::date, d.status,
           d.currency, d.exchange_rate, d.total_amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt
    FROM public.devolutions d WHERE d.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: devolución %', p_document_id; END IF;
    v_total_cup := round(coalesce(v_amt, 0), 2);
    SELECT coalesce(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0)), 0)
      INTO v_cogs
    FROM public.devolution_items di
    JOIN public.devolutions dd ON dd.id = di.devolution_id
    LEFT JOIN public.transaction_items oti
      ON oti.transaction_id = dd.original_transaction_id AND oti.product_id = di.product_id
    LEFT JOIN public.products p ON p.id = di.product_id
    WHERE di.devolution_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Devolución ' || coalesce(v_docnum, ''),
      'total_cup', v_total_cup, 'costo_devuelto_cup', round(v_cogs, 2),
      'reembolso_cash_cup', 0, 'reembolso_cash_usd_cup', 0,
      'reembolso_transfer_cup', 0, 'reembolso_transfer_usd_cup', 0,
      'reembolso_zelle_usd_cup', 0, 'store_credit_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_document_id
        AND pt.direction = 'refund'
      GROUP BY 1, 2
    LOOP
      v := jsonb_set(v, ARRAY['reembolso_' || r.metodo ||
                     CASE WHEN lower(coalesce(r.moneda, 'cup')) = 'cup' THEN ''
                          ELSE '_' || lower(r.moneda) END || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
    END LOOP;
    SELECT coalesce(sum(scl.amount), 0)
      INTO v_amt
    FROM public.store_credit_ledger scl WHERE scl.devolution_id = p_document_id;
    v := jsonb_set(v, ARRAY['store_credit_cup'], to_jsonb(round(v_amt, 2)));

  WHEN 'RECEPCION' THEN
    SELECT rc.store_id, rc.document_number, rc.reception_date::date, rc.status
      INTO v_store, v_docnum, v_date, v_status
    FROM public.receipts rc WHERE rc.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: recepción %', p_document_id; END IF;
    SELECT coalesce(sum(ri.quantity * ri.unit_cost
                 * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0) INTO v_total_cup
    FROM public.receipt_items ri WHERE ri.receipt_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', 'CUP',
      'descripcion_documento', 'Entrada de almacén ' || coalesce(v_docnum, ''),
      'total_cup', round(v_total_cup, 2), 'importe_pago_cup', 0, 'metodo_pago', '',
      'pendiente_cup', 0);
    SELECT coalesce(sum(pt.amount_cup), 0) INTO v_amt
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'receipt' AND pt.ref_id = p_document_id
      AND coalesce(pt.direction, 'in') = 'in';
    v := jsonb_set(v, ARRAY['pendiente_cup'], to_jsonb(round(v_total_cup - v_amt, 2)));
    IF p_event = 'pago' AND p_payment_ref IS NOT NULL THEN
      SELECT * INTO v_pt FROM public.payment_transactions pt WHERE pt.id = p_payment_ref;
      -- CP-FIN-003 (anexo §2): el pago expone MEDIO y MONEDA reales + nominal
      -- original, para que la regla resuelva la cuenta canónica
      -- (medio × moneda) y el movimiento conserve el importe entregado.
      v := jsonb_set(v, ARRAY['importe_pago_cup'], to_jsonb(round(coalesce(v_pt.amount_cup, 0), 2)))
          || jsonb_build_object(
               'metodo_pago', v_pt.payment_method,
               'moneda_pago', coalesce(v_pt.currency, 'CUP'),
               'importe_pago_cup_origin',
                 CASE WHEN coalesce(v_pt.currency, 'CUP') = 'CUP' THEN NULL
                      ELSE round(coalesce(v_pt.amount, 0), 2) END);
    END IF;

  WHEN 'SERVICIO_RECIBIDO' THEN
    SELECT s.store_id, s.service_number, s.service_date, s.status,
           s.currency, s.exchange_rate, s.total_amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt
    FROM public.received_services s WHERE s.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: servicio %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN v_cur = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Servicio recibido ' || coalesce(v_docnum, ''),
      'total_cup', v_total_cup, 'importe_pago_cup', 0, 'metodo_pago', '',
      'pendiente_cup', 0);
    SELECT coalesce(sum(pt.amount_cup), 0) INTO v_amt
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'service' AND pt.ref_id = p_document_id
      AND coalesce(pt.direction, 'in') = 'in';
    v := jsonb_set(v, ARRAY['pendiente_cup'], to_jsonb(round(v_total_cup - v_amt, 2)));
    IF p_event = 'pago' AND p_payment_ref IS NOT NULL THEN
      SELECT * INTO v_pt FROM public.payment_transactions pt WHERE pt.id = p_payment_ref;
      v := jsonb_set(v, ARRAY['importe_pago_cup'], to_jsonb(round(coalesce(v_pt.amount_cup, 0), 2)))
          || jsonb_build_object(
               'metodo_pago', v_pt.payment_method,
               'moneda_pago', coalesce(v_pt.currency, 'CUP'),
               'importe_pago_cup_origin',
                 CASE WHEN coalesce(v_pt.currency, 'CUP') = 'CUP' THEN NULL
                      ELSE round(coalesce(v_pt.amount, 0), 2) END);
    END IF;

  WHEN 'VALE_SALIDA' THEN
    SELECT i.store_id, i.slip_number, i.created_at::date, i.status, i.total_cost
      INTO v_store, v_docnum, v_date, v_status, v_total_cup
    FROM public.issue_slips i WHERE i.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: vale %', p_document_id; END IF;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', 'CUP',
      'descripcion_documento', 'Vale de salida ' || coalesce(v_docnum, ''),
      'costo_cup', round(coalesce(v_total_cup, 0), 2));

  WHEN 'AJUSTE_INVENTARIO' THEN
    SELECT a.store_id, a.id::text, a.confirmed_at::date, a.status, a.reason, a.confirmed_at
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_ts
    FROM public.inventory_adjustments a WHERE a.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: ajuste %', p_document_id; END IF;
    SELECT
      coalesce(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 0),
      coalesce(sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0), 0)
      INTO v_cogs, v_total_cup
    FROM public.inventory_adjustment_items i
    JOIN public.products p ON p.id = i.product_id
    LEFT JOIN LATERAL (
      SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
      WHERE wcl.product_id = i.product_id AND wcl.store_id = v_store
        AND wcl.created_at <= v_ts
      ORDER BY wcl.created_at DESC LIMIT 1
    ) w ON true
    WHERE i.adjustment_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', 'CUP',
      'descripcion_documento', 'Ajuste de inventario (' || coalesce(v_cur, '') || ')',
      'valor_faltante_cup', round(v_cogs, 2), 'valor_sobrante_cup', round(v_total_cup, 2),
      'motivo', v_cur);

  WHEN 'COMISION' THEN
    SELECT c.store_id, c.id::text, c.paid_at::date, c.status,
           c.currency, c.exchange_rate, c.final_amount, c.payment_method
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt, v_missing_txt
    FROM public.commission_payments c WHERE c.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: comisión %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN v_cur IS NULL OR v_cur = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', coalesce(v_cur, 'CUP'),
      'descripcion_documento', 'Pago de comisión',
      'total_cup', v_total_cup, 'metodo_pago', v_missing_txt,
      'moneda_comision', coalesce(v_cur, 'CUP'));

  WHEN 'NOMINA' THEN
    SELECT n.store_id, n.payroll_number, n.period_end, n.status, n.currency,
           n.total_gross, n.total_net, n.total_deductions, n.total_social_security,
           n.payment_method
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_amt, v_total_cup, v_cogs, v_num, v_missing_txt
    FROM public.payrolls n WHERE n.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: nómina %', p_document_id; END IF;
    IF v_cur IS NULL OR v_cur = 'CUP' THEN
      v := jsonb_build_object(
        'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
        'estado_documento', v_status, 'moneda_documento', 'CUP',
        'descripcion_documento', 'Nómina ' || coalesce(v_docnum, ''),
        'total_gross_cup', round(coalesce(v_amt, 0), 2),
        'total_net_cup', round(coalesce(v_total_cup, 0), 2),
        'total_deducciones_cup', round(coalesce(v_cogs, 0), 2),
        'total_social_cup', round(coalesce(v_num, 0), 2),
        'metodo_pago', v_missing_txt);
    ELSE
      RAISE EXCEPTION 'ERR_PAYROLL_CURRENCY_NOT_SUPPORTED: nómina % en % (solo CUP soportado; documentado en el expediente)', p_document_id, v_cur;
    END IF;

  WHEN 'FLUJO_CAJA' THEN
    SELECT f.store_id, f.id::text, f.operation_date::date, f.status,
           f.currency, f.doc_type, f.concept, f.amount_cup, f.amount, f.exchange_rate
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_missing_txt, v_txt, v_total_cup, v_amt, v_rate
    FROM public.cash_flow_documents f WHERE f.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: flujo de caja %', p_document_id; END IF;
    v_total_origin := NULL;
    IF coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_amt, 0) > 0 THEN
      v_total_origin := round(v_amt, 2);
    END IF;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Movimiento de caja (' || coalesce(v_missing_txt, '') || ')',
      'importe_cup', round(coalesce(v_total_cup, 0), 2),
      'importe_cup_origin', v_total_origin,
      'tasa_documento', CASE WHEN coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_rate, 0) > 0
                             THEN v_rate ELSE NULL END,
      'tipo_documento', v_missing_txt, 'concepto', v_txt);

  ELSE
    RAISE EXCEPTION 'ERR_DOCTYPE_NOT_SUPPORTED: %', p_doctype;
  END CASE;

  IF (v ->> 'store_id') IS NULL OR (v ->> 'economic_date') IS NULL THEN
    RAISE EXCEPTION 'ERR_METRICS_INCOMPLETE: % %', p_doctype, p_document_id;
  END IF;
  RETURN v;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. fin_apply_templates v2 — BASE = cuerpo LIVE (20261118130000 §2).
--    NUEVO: origen.tipo = 'cuenta_financiera' → la categoría NO está en la
--    plantilla: la resuelve el MAPEO CANÓNICO (medio × moneda) del pago.
--    Importe = métrica indicada; moneda_original = moneda del pago;
--    amount_origin = contraparte <metrica>_origin. Fail-closed si el mapeo
--    no soporta la combinación (anexo §2: nunca moneda en lugar del medio).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_apply_templates(p_templates jsonb, p_event text, p_metrics jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t jsonb; c jsonb;
  v_out jsonb := '[]'::jsonb;
  v_pass boolean;
  v_origen jsonb; v_amount numeric;
  v_categoria text; v_currency_origin text;
BEGIN
  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_templates, '[]'::jsonb)) LOOP
    IF coalesce(t ->> 'evento', 'reconocimiento') <> p_event THEN CONTINUE; END IF;
    -- condición: null | objeto | array (AND)
    v_pass := true;
    IF t -> 'condicion' IS NOT NULL AND jsonb_typeof(t -> 'condicion') <> 'null' THEN
      IF jsonb_typeof(t -> 'condicion') = 'array' THEN
        FOR c IN SELECT * FROM jsonb_array_elements(t -> 'condicion') LOOP
          IF NOT public.fin_eval_condition(c, p_metrics) THEN v_pass := false; EXIT; END IF;
        END LOOP;
      ELSE
        v_pass := public.fin_eval_condition(t -> 'condicion', p_metrics);
      END IF;
    END IF;
    IF NOT v_pass THEN CONTINUE; END IF;
    -- importe
    v_origen := t -> 'origen';
    IF v_origen IS NULL THEN CONTINUE; END IF;
    IF v_origen ->> 'tipo' = 'constante' THEN
      v_amount := coalesce((v_origen ->> 'valor')::numeric, 0);
    ELSE
      v_amount := coalesce((p_metrics ->> (v_origen ->> 'metrica'))::numeric, 0);
    END IF;
    v_amount := round(v_amount, 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;

    -- Cuenta y moneda original del movimiento
    IF v_origen ->> 'tipo' = 'cuenta_financiera' THEN
      -- CP-FIN-003: resolución CANÓNICA (medio de pago × moneda del pago).
      v_categoria := public.fin_resolve_financial_account(
        p_metrics ->> 'metodo_pago', coalesce(p_metrics ->> 'moneda_pago', 'CUP'));
      v_currency_origin := coalesce(p_metrics ->> 'moneda_pago', p_metrics ->> 'moneda_documento');
    ELSE
      v_categoria := t ->> 'categoria';
      v_currency_origin := p_metrics ->> 'moneda_documento';
    END IF;

    v_out := v_out || jsonb_build_object(
      'categoria', v_categoria,
      'sentido', t ->> 'sentido',
      'amount', v_amount,
      'currency', 'CUP', 'exchange_rate', 1,
      'currency_origin', v_currency_origin,
      'amount_origin', p_metrics ->> ((v_origen ->> 'metrica') || '_origin'),
      'traza', jsonb_build_object(
        'template', t ->> 'id',
        'metrica', v_origen ->> 'metrica',
        'regla', 'motor-cp-fin'));
  END LOOP;
  RETURN v_out;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. REGLAS — nueva generación de reglas con el mapeo canónico.
--    Patrón ROBUSTO e IDEMPOTENTE (la BD aislada conserva reglas de prueba
--    con versiones propias: la versión se asigna dinámicamente y el guard por
--    marcador de notas evita duplicar en re-ejecuciones):
--      1. Si YA existe una regla CP-FIN-003 para el tipo → no hacer nada.
--      2. Si no: desactivar la activa vigente (cualquier versión) e insertar
--         la nueva con version = max(version)+1 del ámbito global.
--    Los asientos históricos conservan su rule_version_id (nunca se reescriben).
-- ══════════════════════════════════════════════════════════════════════════

-- 7.1 VENTA v3 — cobros por (medio × moneda) con el mapeo canónico:
--     zelle → ACT_TRANSF_EXTERIOR (misión §4); efectivo EUR/MLC → su caja;
--     transferencias (cualquier moneda) → ACT_BANCOS. Diferencias de cobro
--     M-015 conservadas. Misma estructura, cuentas del mapeo canónico.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'VENTA' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-003%') THEN
    RAISE NOTICE 'VENTA: regla CP-FIN-003 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por la regla CP-FIN-003 (mapeo canónico medio×moneda).'
      WHERE document_type = 'VENTA' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'VENTA', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"v-cash-cup","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_cup"},"condicion":{"campo":"cob_cash_cup","op":">","valor":0},"orden":1},
      {"id":"v-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_usd_cup"},"condicion":{"campo":"cob_cash_usd_cup","op":">","valor":0},"orden":2},
      {"id":"v-cash-eur","evento":"reconocimiento","categoria":"ACT_EFECTIVO_EUR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_eur_cup"},"condicion":{"campo":"cob_cash_eur_cup","op":">","valor":0},"orden":3},
      {"id":"v-cash-mlc","evento":"reconocimiento","categoria":"ACT_EFECTIVO_MLC","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_mlc_cup"},"condicion":{"campo":"cob_cash_mlc_cup","op":">","valor":0},"orden":4},
      {"id":"v-transf-cup","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_cup"},"condicion":{"campo":"cob_transfer_cup","op":">","valor":0},"orden":5},
      {"id":"v-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_usd_cup"},"condicion":{"campo":"cob_transfer_usd_cup","op":">","valor":0},"orden":6},
      {"id":"v-transf-eur","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_eur_cup"},"condicion":{"campo":"cob_transfer_eur_cup","op":">","valor":0},"orden":7},
      {"id":"v-transf-mlc","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_mlc_cup"},"condicion":{"campo":"cob_transfer_mlc_cup","op":">","valor":0},"orden":8},
      {"id":"v-zelle","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_zelle_usd_cup"},"condicion":{"campo":"cob_zelle_usd_cup","op":">","valor":0},"orden":9},
      {"id":"v-zelle-eur","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_zelle_eur_cup"},"condicion":{"campo":"cob_zelle_eur_cup","op":">","valor":0},"orden":10},
      {"id":"v-ingreso","evento":"reconocimiento","categoria":"ING_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":11},
      {"id":"v-cogs-d","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":12},
      {"id":"v-cogs-c","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":13},
      {"id":"v-desc-debe","evento":"reconocimiento","categoria":"ING_DESCUENTOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"diferencia_cobro_debe_cup"},"condicion":{"campo":"diferencia_cobro_debe_cup","op":">","valor":0},"orden":14},
      {"id":"v-desc-haber","evento":"reconocimiento","categoria":"ING_DESCUENTOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"diferencia_cobro_haber_cup"},"condicion":{"campo":"diferencia_cobro_haber_cup","op":">","valor":0},"orden":15}
    ]'::jsonb, '2026-11-20',
      'CP-FIN-003: cobros por (medio × moneda) según el mapeo canónico fin_account_mapping. Transf. Exterior (zelle) → ACT_TRANSF_EXTERIOR. Efectivo EUR/MLC → su propia caja. Diferencias de cobro M-015 conservadas.'
    FROM public.fin_rule_versions WHERE document_type = 'VENTA' AND store_id IS NULL;
  END IF;
END $$;

-- 7.2 SERVICIO_RECIBIDO — gasto + obligación al confirmar; el PAGO usa la
--     cuenta financiera CANÓNICA del (medio × moneda) real del desembolso
--     (anexo §3.2/§6): efectivo CUP → caja CUP, efectivo USD → caja USD,
--     transferencia → bancos, exterior → cuenta exterior. El nominal original
--     del pago se conserva (importe_pago_cup_origin).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'SERVICIO_RECIBIDO' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-003%') THEN
    RAISE NOTICE 'SERVICIO_RECIBIDO: regla CP-FIN-003 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por la regla CP-FIN-003 (pago por cuenta canónica medio×moneda).'
      WHERE document_type = 'SERVICIO_RECIBIDO' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'SERVICIO_RECIBIDO', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"s-gasto-d","evento":"reconocimiento","categoria":"GAS_SERVICIOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":1},
      {"id":"s-cxp-c","evento":"reconocimiento","categoria":"PAS_SERV_PEND","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":2},
      {"id":"sp-fin-c","evento":"pago","categoria":"@cuenta_financiera","sentido":"credito","origen":{"tipo":"cuenta_financiera","metrica":"importe_pago_cup"},"condicion":null,"orden":3},
      {"id":"sp-cxp-d","evento":"pago","categoria":"PAS_SERV_PEND","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":null,"orden":4}
    ]'::jsonb, '2026-11-20',
      'CP-FIN-003/anexo: reconocimiento = gasto + obligación (sin mover efectivo). Cada pago cancela la obligación y sale por la CUENTA CANÓNICA del (medio × moneda) real del desembolso.'
    FROM public.fin_rule_versions WHERE document_type = 'SERVICIO_RECIBIDO' AND store_id IS NULL;
  END IF;
END $$;

-- 7.3 RECEPCION — inventario + deuda al activar; pagos por cuenta canónica.
--     Recibir mercancía ≠ pagar al proveedor (anexo §4).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'RECEPCION' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-003%') THEN
    RAISE NOTICE 'RECEPCION: regla CP-FIN-003 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por la regla CP-FIN-003 (pago por cuenta canónica medio×moneda).'
      WHERE document_type = 'RECEPCION' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'RECEPCION', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"r-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":1},
      {"id":"r-cxp-c","evento":"reconocimiento","categoria":"PAS_CXP_PROV","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":2},
      {"id":"rp-fin-c","evento":"pago","categoria":"@cuenta_financiera","sentido":"credito","origen":{"tipo":"cuenta_financiera","metrica":"importe_pago_cup"},"condicion":null,"orden":3},
      {"id":"rp-cxp-d","evento":"pago","categoria":"PAS_CXP_PROV","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":null,"orden":4}
    ]'::jsonb, '2026-11-20',
      'CP-FIN-003/anexo: recibir mercancía ≠ pagar al proveedor. La deuda nace al activar; cada liquidación registra el (medio × moneda) real y sale por la cuenta canónica.'
    FROM public.fin_rule_versions WHERE document_type = 'RECEPCION' AND store_id IS NULL;
  END IF;
END $$;

-- 7.4 DEVOLUCION_VENTA — reembolsos con el mapeo canónico (zelle → exterior).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-003%') THEN
    RAISE NOTICE 'DEVOLUCION_VENTA: regla CP-FIN-003 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por la regla CP-FIN-003 (reembolso exterior a su propia cuenta).'
      WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'DEVOLUCION_VENTA', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"d-ref-cash-cup","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_cup"},"condicion":{"campo":"reembolso_cash_cup","op":">","valor":0},"orden":1},
      {"id":"d-ref-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_usd_cup"},"condicion":{"campo":"reembolso_cash_usd_cup","op":">","valor":0},"orden":2},
      {"id":"d-ref-cash-eur","evento":"reconocimiento","categoria":"ACT_EFECTIVO_EUR","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_eur_cup"},"condicion":{"campo":"reembolso_cash_eur_cup","op":">","valor":0},"orden":3},
      {"id":"d-ref-cash-mlc","evento":"reconocimiento","categoria":"ACT_EFECTIVO_MLC","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_mlc_cup"},"condicion":{"campo":"reembolso_cash_mlc_cup","op":">","valor":0},"orden":4},
      {"id":"d-ref-transf-cup","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_cup"},"condicion":{"campo":"reembolso_transfer_cup","op":">","valor":0},"orden":5},
      {"id":"d-ref-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_usd_cup"},"condicion":{"campo":"reembolso_transfer_usd_cup","op":">","valor":0},"orden":6},
      {"id":"d-ref-zelle","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_zelle_usd_cup"},"condicion":{"campo":"reembolso_zelle_usd_cup","op":">","valor":0},"orden":7},
      {"id":"d-store-credit","evento":"reconocimiento","categoria":"PAS_ANTICIPOS_CLI","sentido":"credito","origen":{"tipo":"metrica","metrica":"store_credit_cup"},"condicion":{"campo":"store_credit_cup","op":">","valor":0},"orden":8},
      {"id":"d-dev-ingreso","evento":"reconocimiento","categoria":"ING_DEVOLUCIONES","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":9},
      {"id":"d-cogs-c","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":10},
      {"id":"d-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":11}
    ]'::jsonb, '2026-11-20',
      'CP-FIN-003: reembolsos según el mapeo canónico; exterior (zelle) → ACT_TRANSF_EXTERIOR.'
    FROM public.fin_rule_versions WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL;
  END IF;
END $$;

-- 7.5 Catálogo de métricas nuevas (constructor Vista A + reglas v3).
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event) VALUES
  ('VENTA','cob_cash_eur_cup','Cobrado en efectivo EUR (valor CUP)','CUP','reconocimiento'),
  ('VENTA','cob_cash_mlc_cup','Cobrado en efectivo MLC (valor CUP)','CUP','reconocimiento'),
  ('VENTA','cob_transfer_eur_cup','Cobrado por transferencia EUR (valor CUP)','CUP','reconocimiento'),
  ('VENTA','cob_transfer_mlc_cup','Cobrado por transferencia MLC (valor CUP)','CUP','reconocimiento'),
  ('SERVICIO_RECIBIDO','moneda_pago','Moneda del pago','texto','pago'),
  ('SERVICIO_RECIBIDO','importe_pago_cup_origin','Importe original del pago','texto','pago'),
  ('RECEPCION','moneda_pago','Moneda del pago','texto','pago'),
  ('RECEPCION','importe_pago_cup_origin','Importe original del pago','texto','pago')
ON CONFLICT (document_type, metric) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. register_supplier_payment v3 — BASE = cuerpo LIVE (20261113120800 §3).
--    NUEVO (anexo §2/§7): en moneda distinta de CUP la tasa de conversión es
--    OBLIGATORIA y > 1. Si el llamante no la trae (> 1), se resuelve de las
--    tasas manuales de la tienda (store_exchange_rates); sin tasa disponible
--    → fail-closed. Jamás se computa un pago USD/EUR/MLC a tasa 1.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_doc_currency text;
  v_doc_rate numeric;
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_rate numeric := p_exchange_rate;
  v_store_rate numeric;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- CP-FIN-003: monedas y medios del catálogo canónico solamente.
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'Moneda de pago no soportada: %', p_currency;
  END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'zelle') THEN
    RAISE EXCEPTION 'Medio de pago no soportado: %', p_payment_method;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1)
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- CP-FIN-003 (anexo §2): tasa de conversión REAL para moneda ≠ CUP.
  -- El equivalente contable (amount_cup) es columna GENERATED: la tasa debe
  -- llegar correcta a la INSERT. Sin tasa del llamante → tasa manual de la
  -- tienda; sin ninguna → fail-closed (jamás tasa 1 para divisa).
  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION
          'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1). Configúrela en Tasas o envíela con el pago.',
          p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  -- Monto en CUP (para payment_transactions.amount_cup — invariante)
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE round(p_amount * v_rate, 2)
  END;

  -- R3: Validar overpay — todo en la MONEDA DEL DOCUMENTO (20261113120800).
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_amount_in_doc_currency := CASE
    WHEN p_currency = v_doc_currency THEN p_amount
    ELSE v_amount_cup / v_doc_rate
  END;

  v_balance := v_total - v_paid;
  IF v_amount_in_doc_currency > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_in_doc_currency, v_balance;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, v_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. INFORMES — SOLO la generación ACTIVA de la tienda (misión §2: «No
--    permitas que las dos generaciones se sumen simultáneamente»). Las
--    sustituidas quedan excluidas de los informes vigentes pero se conservan
--    para auditoría. BASE = cuerpos LIVE verificados; cambio = filtro de
--    generación (IS NOT DISTINCT FROM v_gen, que además preserva a las
--    tiendas sin generaciones: v_gen NULL = asientos legados NULL).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_get_balance_sheet(
  p_store_id uuid, p_as_of date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_activos numeric := 0; v_pasivos numeric := 0; v_patrim numeric := 0;
  v_ing numeric := 0; v_gas numeric := 0;
  v_primer_doc date; v_primera_apertura date; v_resultado numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'activo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'pasivo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'patrimonio'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'gasto'), 0)
    INTO v_rows, v_activos, v_pasivos, v_patrim, v_ing, v_gas
  FROM (
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) AS saldo,
           count(DISTINCT m.entry_id) AS movimientos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date <= p_as_of
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order
    HAVING round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) <> 0
  ) s;

  v_resultado := round(v_ing - v_gas, 2);
  SELECT min(economic_date) INTO v_primer_doc
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event <> 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;
  SELECT min(economic_date) INTO v_primera_apertura
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event = 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'categorias', v_rows,
    'total_activos', round(v_activos, 2),
    'total_pasivos', round(v_pasivos, 2),
    'patrimonio_movimientos', round(v_patrim, 2),
    'resultado_acumulado', v_resultado,
    'patrimonio_total', round(v_patrim + v_resultado, 2),
    'ecuacion', jsonb_build_object(
      'activos', round(v_activos, 2),
      'pasivos_mas_patrimonio', round(v_pasivos + v_patrim + v_resultado, 2),
      'diferencia', round(v_activos - (v_pasivos + v_patrim + v_resultado), 2),
      'equilibrado', abs(v_activos - (v_pasivos + v_patrim + v_resultado)) <= 0.01),
    'completitud', jsonb_build_object(
      'sin_apertura', v_primer_doc IS NOT NULL AND v_primera_apertura IS NULL,
      'apertura_tardia', v_primer_doc IS NOT NULL AND v_primera_apertura IS NOT NULL
                         AND v_primer_doc < v_primera_apertura,
      'primer_documento', v_primer_doc,
      'primera_apertura', v_primera_apertura));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_get_income_statement(
  p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb;
  v_ing_op numeric := 0; v_ing_aj numeric := 0; v_costo numeric := 0;
  v_gastos numeric := 0; v_ing_noop numeric := 0; v_gas_noop numeric := 0;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ajuste_ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'costo_venta'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_no_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_no_operacional'), 0)
    INTO v_rows, v_ing_op, v_ing_aj, v_costo, v_gastos, v_ing_noop, v_gas_noop
  FROM (
    SELECT c.code, c.name, c.grupo, c.sort_order,
           round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo,
           count(DISTINCT m.entry_id) AS documentos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase IN ('ingreso', 'gasto')
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.grupo, c.sort_order
    HAVING round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) <> 0
  ) s;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'categorias', v_rows,
    'ingresos_operacionales', round(v_ing_op, 2),
    'ajustes_ingresos', round(v_ing_aj, 2),
    'ingresos_netos', round(v_ing_op + v_ing_aj, 2),
    'costo_ventas', round(v_costo, 2),
    'utilidad_bruta', round(v_ing_op + v_ing_aj + v_costo, 2),
    'gastos_operacionales', round(v_gastos, 2),
    'resultado_operativo', round(v_ing_op + v_ing_aj + v_costo + v_gastos, 2),
    'ingresos_no_operacionales', round(v_ing_noop, 2),
    'gastos_no_operacionales', round(v_gas_noop, 2),
    'resultado_neto', round(v_ing_op + v_ing_aj + v_costo + v_gastos + v_ing_noop + v_gas_noop, 2));
END $function$;

-- Dashboard v3 = v2 (identidad pura, CP-FIN-002) + filtro de generación +
-- KPI de transferencias exteriores + transparencia de generación activa.
CREATE OR REPLACE FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ings numeric := 0; v_costo numeric := 0; v_gastos numeric := 0;
  v_efectivo_cup numeric := 0; v_efectivo_usd numeric := 0; v_bancos numeric := 0;
  v_exterior numeric := 0;
  v_cxc numeric := 0; v_cxp numeric := 0; v_nomina numeric := 0; v_retenc numeric := 0;
  v_inv numeric := 0; v_series jsonb; v_top jsonb;
  v_sin_cfg int; v_errores int; v_desbalance numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Resultado del período
  SELECT
    coalesce(sum(CASE WHEN c.clase = 'ingreso'
      THEN CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.grupo = 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.clase = 'gasto' AND c.grupo <> 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_ings, v_costo, v_gastos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Saldos de balance a la fecha final
  SELECT
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_CUP' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_USD' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_BANCOS' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_TRANSF_EXTERIOR' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_CXC' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code IN ('PAS_CXP_PROV', 'PAS_SERV_PEND') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_NOMINA_PEND' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_RETENCIONES' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_efectivo_cup, v_efectivo_usd, v_bancos, v_exterior, v_cxc, v_cxp, v_nomina, v_retenc
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Valor de inventario (en vivo, del motor de valoración real)
  SELECT coalesce(round(sum(p.stock_current * coalesce(p.cost_average, 0)), 2), 0) INTO v_inv
  FROM public.products p WHERE p.store_id = p_store_id;

  -- Series mensuales
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb) INTO v_series
  FROM (
    SELECT to_char(date_trunc('month', m.economic_date), 'YYYY-MM') AS mes,
           round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS ingresos,
           round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS gastos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY 1
  ) s;

  -- Top gastos
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb) INTO v_top
  FROM (
    SELECT c.code, c.name, round(sum(m.amount_cup), 2) AS total
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase = 'gasto' AND m.sense = 'debito'
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name
    HAVING sum(m.amount_cup) > 0
    LIMIT 8
  ) s;

  SELECT count(*) INTO v_sin_cfg
  FROM public.fin_document_types dt
  WHERE dt.is_postable AND dt.is_active AND NOT EXISTS (
    SELECT 1 FROM public.fin_rule_versions rv
    WHERE rv.document_type = dt.code AND rv.status = 'active'
      AND (rv.store_id = p_store_id OR rv.store_id IS NULL));
  SELECT count(*) INTO v_errores
  FROM public.fin_posting_errors WHERE store_id = p_store_id AND resolved_at IS NULL;

  -- Identidad pura de partida doble (CP-FIN-002) sobre la generación activa
  SELECT coalesce(round(sum(
    CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END), 0), 0)
    INTO v_desbalance
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'kpis', jsonb_build_object(
      'ingresos', round(v_ings, 2), 'costo_ventas', round(v_costo, 2),
      'gastos', round(v_gastos, 2),
      'utilidad_bruta', round(v_ings - v_costo, 2),
      'resultado_neto', round(v_ings - v_costo - v_gastos, 2),
      'efectivo_cup', round(v_efectivo_cup, 2), 'efectivo_usd', round(v_efectivo_usd, 2),
      'bancos', round(v_bancos, 2),
      'transfer_exterior', round(v_exterior, 2),
      'cuentas_por_cobrar', round(v_cxc, 2), 'cuentas_por_pagar', round(v_cxp, 2),
      'nomina_pendiente', round(v_nomina, 2), 'retenciones_pendientes', round(v_retenc, 2),
      'inventario_valor', v_inv),
    'series_mensuales', v_series,
    'top_gastos', v_top,
    'alertas', jsonb_build_object(
      'gastos_mayores_que_ingresos', v_gastos + v_costo > v_ings AND v_ings > 0,
      'desequilibrio_balance', abs(v_desbalance) > 0.01,
      'desequilibrio_monto', round(v_desbalance, 2),
      'tipos_sin_configurar', v_sin_cfg,
      'errores_contabilizacion', v_errores));
END $function$;

-- Drilldown: solo movimientos de la generación activa.
CREATE OR REPLACE FUNCTION public.fin_get_category_detail(
  p_store_id uuid, p_category text, p_from date, p_to date,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_total int;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  SELECT count(*) INTO v_total
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.economic_date DESC, s.posted_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT m.id, m.entry_id, e.document_type, e.document_id, m.document_number,
           m.economic_date, e.event, m.sense, m.amount, m.amount_cup,
           m.currency, m.currency_origin, m.amount_origin, m.description, e.posted_at
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    WHERE m.store_id = p_store_id AND m.category_code = p_category
      AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    ORDER BY m.economic_date DESC, e.posted_at DESC
    LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0)
  ) s;
  RETURN jsonb_build_object('categoria', p_category, 'total', v_total,
                            'desde', p_from, 'hasta', p_to, 'movimientos', v_rows);
END $function$;

-- Estado por tipo documental: conteo de asientos de la generación activa.
CREATE OR REPLACE FUNCTION public.fin_get_document_types_status(
  p_store_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(s) ORDER BY s.sort_order)
    FROM (
      SELECT dt.code, dt.name, dt.module, dt.source_table, dt.description,
             dt.trigger_status, dt.is_postable, dt.sort_order,
             (rv.id IS NOT NULL) AS configurado,
             rv.id AS rule_version_id, rv.version, rv.movements, rv.effective_from,
             (SELECT count(*) FROM public.fin_entries e
              WHERE e.document_type = dt.code AND e.store_id = p_store_id
                AND e.generation_id IS NOT DISTINCT FROM v_gen) AS asientos,
             (SELECT count(*) FROM public.fin_posting_errors pe
              WHERE pe.document_type = dt.code AND pe.store_id = p_store_id
                AND pe.resolved_at IS NULL) AS errores
      FROM public.fin_document_types dt
      LEFT JOIN public.fin_rule_versions rv
        ON rv.document_type = dt.code AND rv.status = 'active'
       AND rv.effective_from <= CURRENT_DATE
       AND (rv.store_id = p_store_id
            OR (rv.store_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM public.fin_rule_versions x
                  WHERE x.document_type = dt.code AND x.status = 'active'
                    AND x.store_id = p_store_id)))
      WHERE dt.is_active
    ) s
  ), '[]'::jsonb);
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. CICLO DE VIDA DE GENERACIONES (misión §7.1)
--     create → build → validate → activate ⇄ rollback.
--     ACL: service_role (canal canónico) o admin de la tienda.
--     La generación activa NUNCA se modifica: la candidata se construye
--     aislada y se activa ATÓMICAMENTE; la anterior queda superseded.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_generation_create(
  p_store_id uuid, p_code text, p_notes text DEFAULT NULL, p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_id uuid; v_active uuid; v_snap jsonb;
BEGIN
  -- ACL pura (patrón fin_rectify_*): ejecución SOLO por service_role
  -- (canal canónico). v_caller queda como atribución (puede ser NULL).
  IF p_code IS NULL OR length(trim(p_code)) < 3 THEN
    RAISE EXCEPTION 'ERR_CODIGO_REQUERIDO';
  END IF;

  -- Snapshot de la generación ACTIVA (punto de comparación, misión §11)
  v_active := public.fin_active_generation(p_store_id);
  IF v_active IS NOT NULL THEN
    SELECT jsonb_build_object(
             'generacion', g.code,
             'entries', (SELECT count(*) FROM public.fin_entries e WHERE e.generation_id = g.id),
             'movimientos', (SELECT count(*) FROM public.fin_movements m
                             JOIN public.fin_entries e ON e.id = m.entry_id
                             WHERE e.generation_id = g.id),
             'por_categoria', (
               SELECT coalesce(jsonb_object_agg(t.code, t.saldo), '{}'::jsonb)
               FROM (
                 SELECT m.category_code AS code,
                        round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo
                 FROM public.fin_movements m
                 JOIN public.fin_entries e ON e.id = m.entry_id
                 WHERE e.generation_id = g.id
                 GROUP BY 1
               ) t))
    INTO v_snap
    FROM public.fin_posting_generations g WHERE g.id = v_active;
  END IF;

  INSERT INTO public.fin_posting_generations (store_id, code, status, notes, snapshot, created_by)
  VALUES (p_store_id, trim(p_code), 'building', p_notes, v_snap, v_caller)
  ON CONFLICT (store_id, code) DO UPDATE
    SET notes = EXCLUDED.notes, snapshot = EXCLUDED.snapshot
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- Construcción de la candidata: re-deriva TODOS los asientos de la generación
-- activa con las REGLAS VIGENTES (documentos y pagos actuales como fuente),
-- copia aperturas/ajustes manuales y completa la cobertura documental.
-- Re-ejecutable (idempotente por generación): cada pase solo añade lo faltante.
CREATE OR REPLACE FUNCTION public.fin_generation_build(
  p_store_id uuid, p_generation_id uuid,
  p_include_rectifications boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  g record; m record; r record;
  v_active uuid; v_new uuid;
  v_e record;
  v_ok int := 0; v_err int := 0; v_ann int := 0; v_copied int := 0; v_rect_skipped jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_entry uuid;
BEGIN
  -- ACL pura (patrón fin_rectify_*): ejecución SOLO por service_role
  -- (canal canónico). v_caller queda como atribución (puede ser NULL).

  SELECT * INTO g FROM public.fin_posting_generations
  WHERE id = p_generation_id AND store_id = p_store_id;
  IF g.id IS NULL THEN RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA'; END IF;
  IF g.status NOT IN ('building', 'candidate') THEN
    RAISE EXCEPTION 'ERR_GENERACION_NO_CONSTRUIBLE (estado: %)', g.status;
  END IF;

  v_active := public.fin_active_generation(p_store_id);
  v_new := p_generation_id;

  -- PASE 1: re-contabilizar reconocimiento/pago de la generación activa
  -- (misma cobertura documental; importes y cuentas según reglas vigentes).
  IF v_active IS NOT NULL THEN
    FOR r IN
      SELECT fe.document_type, fe.document_id, fe.event, fe.payment_ref
      FROM public.fin_entries fe
      WHERE fe.generation_id = v_active
        AND fe.document_id IS NOT NULL
        AND fe.event IN ('reconocimiento', 'pago')
      ORDER BY fe.document_type, fe.economic_date, fe.posted_at
    LOOP
      BEGIN
        PERFORM public.fin_post_document(r.document_type, r.document_id, r.event,
                                         r.payment_ref, v_caller, v_new);
        v_ok := v_ok + 1;
      EXCEPTION WHEN others THEN
        v_err := v_err + 1;
        v_errors := v_errors || jsonb_build_object('pase', 1, 'doc', r.document_id,
          'tipo', r.document_type, 'evento', r.event, 'error', substr(SQLERRM, 1, 200));
      END;
    END LOOP;

    -- PASE 2: anulaciones de la generación activa → compensar en la candidata.
    FOR r IN
      SELECT DISTINCT fe.document_type, fe.document_id
      FROM public.fin_entries fe
      WHERE fe.generation_id = v_active AND fe.event = 'anulacion'
        AND fe.document_id IS NOT NULL
    LOOP
      BEGIN
        v_ann := v_ann + public.fin_post_document_annulment(r.document_type, r.document_id, v_new);
      EXCEPTION WHEN others THEN
        v_err := v_err + 1;
        v_errors := v_errors || jsonb_build_object('pase', 2, 'doc', r.document_id,
          'tipo', r.document_type, 'evento', 'anulacion', 'error', substr(SQLERRM, 1, 200));
      END;
    END LOOP;

    -- PASE 3: aperturas (saldos iniciales autorizados) → copia literal.
    FOR v_e IN
      SELECT fe.* FROM public.fin_entries fe
      WHERE fe.generation_id = v_active AND fe.event = 'apertura'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fin_entries x
                     WHERE x.generation_id = v_new AND x.event = 'apertura'
                       AND x.document_type = v_e.document_type
                       AND x.document_number IS NOT DISTINCT FROM v_e.document_number
                       AND x.economic_date = v_e.economic_date
                       AND x.description IS NOT DISTINCT FROM v_e.description) THEN
        INSERT INTO public.fin_entries (
          store_id, document_type, document_id, document_number, event, payment_ref,
          economic_date, rule_version_id, movements_snapshot, reversal_of, status,
          description, created_by, generation_id)
        VALUES (v_e.store_id, v_e.document_type, v_e.document_id, v_e.document_number, v_e.event,
                v_e.payment_ref, v_e.economic_date, v_e.rule_version_id, v_e.movements_snapshot,
                v_e.reversal_of, v_e.status, v_e.description, v_e.created_by, v_new)
        RETURNING id INTO v_entry;
        FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = v_e.id LOOP
          INSERT INTO public.fin_movements (
            entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
            economic_date, document_number, description, currency_origin, amount_origin,
            worker_id, product_id, customer_id, traza)
          VALUES (v_entry, m.store_id, m.category_code, m.sense, m.amount, m.currency,
                  m.exchange_rate, m.economic_date, m.document_number, m.description,
                  m.currency_origin, m.amount_origin, m.worker_id, m.product_id,
                  m.customer_id, m.traza);
        END LOOP;
        v_copied := v_copied + 1;
      END IF;
    END LOOP;

    -- PASE 4: ajustes manuales no-rectificatorios → copia literal (hechos
    -- autorizados, no derivables de documentos). RECTIFICACION_FIN se OMITE
    -- por defecto: su efecto ya está en los DATOS corregidos que la candidata
    -- re-deriva; duplicarla aplicaría la corrección dos veces. Quedan
    -- registradas en stats para decisión documentada del expediente.
    FOR v_e IN
      SELECT fe.* FROM public.fin_entries fe
      WHERE fe.generation_id = v_active AND fe.event = 'ajuste_manual'
        AND (p_include_rectifications OR fe.document_type <> 'RECTIFICACION_FIN')
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fin_entries x
                     WHERE x.generation_id = v_new AND x.event = 'ajuste_manual'
                       AND x.document_type = v_e.document_type
                       AND x.document_number IS NOT DISTINCT FROM v_e.document_number
                       AND x.economic_date = v_e.economic_date
                       AND x.description IS NOT DISTINCT FROM v_e.description
                       AND x.posted_at::date = v_e.posted_at::date) THEN
        INSERT INTO public.fin_entries (
          store_id, document_type, document_id, document_number, event, payment_ref,
          economic_date, rule_version_id, movements_snapshot, reversal_of, status,
          description, created_by, generation_id)
        VALUES (v_e.store_id, v_e.document_type, v_e.document_id, v_e.document_number, v_e.event,
                v_e.payment_ref, v_e.economic_date, v_e.rule_version_id, v_e.movements_snapshot,
                v_e.reversal_of, v_e.status, v_e.description, v_e.created_by, v_new)
        RETURNING id INTO v_entry;
        FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = v_e.id LOOP
          INSERT INTO public.fin_movements (
            entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
            economic_date, document_number, description, currency_origin, amount_origin,
            worker_id, product_id, customer_id, traza)
          VALUES (v_entry, m.store_id, m.category_code, m.sense, m.amount, m.currency,
                  m.exchange_rate, m.economic_date, m.document_number, m.description,
                  m.currency_origin, m.amount_origin, m.worker_id, m.product_id,
                  m.customer_id, m.traza);
        END LOOP;
        v_copied := v_copied + 1;
      END IF;
    END LOOP;

    IF NOT p_include_rectifications THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'entry_id', fe.id, 'document_number', fe.document_number,
               'descripcion', fe.description, 'economic_date', fe.economic_date)), '[]'::jsonb)
      INTO v_rect_skipped
      FROM public.fin_entries fe
      WHERE fe.generation_id = v_active AND fe.event = 'ajuste_manual'
        AND fe.document_type = 'RECTIFICACION_FIN';
    END IF;
  END IF;

  -- PASE 5: cobertura documental COMPLETA (misión §5/§7): todo documento
  -- operativo que deba contabilizarse y no tenga asiento en la candidata.
  FOR r IN
    SELECT 'VENTA' AS dt, t.id AS doc, 'reconocimiento'::text AS ev, NULL::uuid AS pref
    FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'VENTA' AND e.document_id = t.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', d.id, 'reconocimiento', NULL
    FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'DEVOLUCION_VENTA' AND e.document_id = d.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'RECEPCION', rc.id, 'reconocimiento', NULL
    FROM public.receipts rc
    WHERE rc.store_id = p_store_id AND rc.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'RECEPCION' AND e.document_id = rc.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', s.id, 'reconocimiento', NULL
    FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'SERVICIO_RECIBIDO' AND e.document_id = s.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'VALE_SALIDA', i.id, 'reconocimiento', NULL
    FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'VALE_SALIDA' AND e.document_id = i.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', a.id, 'reconocimiento', NULL
    FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'AJUSTE_INVENTARIO' AND e.document_id = a.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'COMISION', c.id, 'pago', NULL
    FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'COMISION' AND e.document_id = c.id
                        AND e.event = 'pago' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'NOMINA', n.id, 'reconocimiento', NULL
    FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'NOMINA' AND e.document_id = n.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'NOMINA', n.id, 'pago', NULL
    FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'NOMINA' AND e.document_id = n.id
                        AND e.event = 'pago' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'FLUJO_CAJA', f.id, 'reconocimiento', NULL
    FROM public.cash_flow_documents f
    WHERE f.store_id = p_store_id AND f.status = 'confirmado'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'FLUJO_CAJA' AND e.document_id = f.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'RECEPCION', pt.ref_id, 'pago', pt.id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type = 'receipt'
      AND coalesce(pt.direction, 'in') = 'in'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'RECEPCION' AND e.document_id = pt.ref_id
                        AND e.event = 'pago' AND e.payment_ref = pt.id
                        AND e.generation_id = v_new)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', pt.ref_id, 'pago', pt.id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type = 'service'
      AND coalesce(pt.direction, 'in') = 'in'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'SERVICIO_RECIBIDO' AND e.document_id = pt.ref_id
                        AND e.event = 'pago' AND e.payment_ref = pt.id
                        AND e.generation_id = v_new)
  LOOP
    BEGIN
      PERFORM public.fin_post_document(r.dt, r.doc, r.ev, r.pref, v_caller, v_new);
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('pase', 5, 'doc', r.doc,
        'tipo', r.dt, 'evento', r.ev, 'error', substr(SQLERRM, 1, 200));
    END;
  END LOOP;

  UPDATE public.fin_posting_generations
  SET status = 'candidate',
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
        'build', jsonb_build_object(
          'repostados', v_ok, 'anulaciones', v_ann, 'copiados', v_copied,
          'errores', v_err, 'detalle_errores', v_errors,
          'rectificaciones_omitidas', v_rect_skipped,
          'generacion_origen', v_active,
          'construida_en', now()))
  WHERE id = v_new;

  RETURN jsonb_build_object('status', 'candidate', 'repostados', v_ok,
    'anulaciones', v_ann, 'copiados', v_copied, 'errores', v_err,
    'detalle_errores', v_errors, 'rectificaciones_omitidas', v_rect_skipped);
END $function$;

-- Validación de la candidata (misión §11): equilibrio por asiento y global,
-- identidad contable, duplicados, cobertura y comparación por categoría
-- (puente de conciliación). ok=true es precondición de activación.
CREATE OR REPLACE FUNCTION public.fin_generation_validate(
  p_store_id uuid, p_generation_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_active uuid; v_gen uuid; v_status text;
  v_desb int; v_global numeric; v_dup int; v_identidad numeric;
  v_coverage jsonb; v_comparacion jsonb;
  v_result jsonb; v_ok boolean;
  v_build_err int;
BEGIN
  -- ACL pura (patrón fin_rectify_*): ejecución SOLO por service_role
  -- (canal canónico). v_caller queda como atribución (puede ser NULL).
  SELECT id, status INTO v_gen, v_status FROM public.fin_posting_generations
  WHERE id = p_generation_id AND store_id = p_store_id;
  IF v_gen IS NULL THEN RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA'; END IF;
  IF v_status NOT IN ('building', 'candidate', 'active', 'superseded') THEN
    RAISE EXCEPTION 'ERR_GENERACION_ESTADO_INVALIDO: %', v_status;
  END IF;
  v_active := public.fin_active_generation(p_store_id);

  -- 1. Asientos desequilibrados (excluye apertura/ajuste_manual que pueden
  --    ser unilaterales por diseño).
  SELECT count(*) INTO v_desb
  FROM (
    SELECT e.id, round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS d
    FROM public.fin_entries e
    JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.generation_id = p_generation_id
      AND e.event NOT IN ('apertura', 'ajuste_manual')
    GROUP BY e.id
  ) t WHERE abs(t.d) > 0.01;

  -- 2. Identidad pura global (Σ débitos − Σ créditos de TODA la generación,
  --    incluidos aperturas/ajustes).
  SELECT coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
    INTO v_global
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.generation_id = p_generation_id;

  -- 3. Duplicados (documento+evento+pago repetidos dentro de la generación).
  SELECT count(*) INTO v_dup
  FROM (
    SELECT document_type, document_id, event, payment_ref, count(*) AS n
    FROM public.fin_entries
    WHERE generation_id = p_generation_id AND document_id IS NOT NULL
    GROUP BY 1, 2, 3, 4 HAVING count(*) > 1
  ) d;

  -- 4. Cobertura documental vs generación activa (por tipo).
  SELECT coalesce(jsonb_object_agg(t.document_type, jsonb_build_object('activa', t.n_old, 'candidata', t.n_new)), '{}'::jsonb)
  INTO v_coverage
  FROM (
    SELECT coalesce(o.document_type, n.document_type) AS document_type,
           coalesce(o.n, 0) AS n_old, coalesce(n.n, 0) AS n_new
    FROM (
      SELECT document_type, count(DISTINCT document_id) AS n
      FROM public.fin_entries
      WHERE generation_id = v_active AND document_id IS NOT NULL
      GROUP BY 1
    ) o
    FULL JOIN (
      SELECT document_type, count(DISTINCT document_id) AS n
      FROM public.fin_entries
      WHERE generation_id = p_generation_id AND document_id IS NOT NULL
      GROUP BY 1
    ) n ON n.document_type = o.document_type
  ) t;

  -- 5. Comparación por categoría (puente viejo → nuevo).
  SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.code), '[]'::jsonb)
  INTO v_comparacion
  FROM (
    SELECT cat.code, cat.name,
           coalesce(o.saldo, 0) AS generacion_anterior,
           coalesce(n.saldo, 0) AS generacion_nueva,
           round(coalesce(n.saldo, 0) - coalesce(o.saldo, 0), 2) AS delta
    FROM public.fin_categories cat
    LEFT JOIN (
      SELECT m.category_code AS code,
             round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo
      FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
      WHERE e.generation_id = v_active GROUP BY 1
    ) o ON o.code = cat.code
    LEFT JOIN (
      SELECT m.category_code AS code,
             round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo
      FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
      WHERE e.generation_id = p_generation_id GROUP BY 1
    ) n ON n.code = cat.code
    WHERE coalesce(o.saldo, 0) <> 0 OR coalesce(n.saldo, 0) <> 0
  ) c;

  -- Errores de construcción registrados por el pase build.
  SELECT coalesce((stats -> 'build' ->> 'errores')::int, 0) INTO v_build_err
  FROM public.fin_posting_generations WHERE id = p_generation_id;

  v_ok := (v_desb = 0) AND (abs(v_global) <= 0.01) AND (v_dup = 0) AND (v_build_err = 0);

  v_result := jsonb_build_object(
    'ok', v_ok,
    'asientos_desequilibrados', v_desb,
    'identidad_global', v_global,
    'duplicados', v_dup,
    'errores_construccion', v_build_err,
    'cobertura_documental', v_coverage,
    'comparacion_categorias', v_comparacion,
    'generacion_anterior', v_active,
    'validada_en', now());

  UPDATE public.fin_posting_generations
  SET stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('validacion', v_result)
  WHERE id = p_generation_id;

  RETURN v_result;
END $function$;

-- Activación ATÓMICA (misión §11): exige candidata validada (ok=true).
-- La activa pasa a superseded (NUNCA se borra); la candidata a active.
CREATE OR REPLACE FUNCTION public.fin_generation_activate(
  p_store_id uuid, p_generation_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  g record; v_old record;
BEGIN
  -- ACL pura (patrón fin_rectify_*): ejecución SOLO por service_role
  -- (canal canónico). v_caller queda como atribución (puede ser NULL).
  PERFORM pg_advisory_xact_lock(hashtext('fin-gen:' || p_store_id::text));

  SELECT * INTO g FROM public.fin_posting_generations
  WHERE id = p_generation_id AND store_id = p_store_id;
  IF g.id IS NULL THEN RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA'; END IF;
  IF g.status <> 'candidate' THEN
    RAISE EXCEPTION 'ERR_ESTADO_INVALIDO: se requiere candidate (estado: %)', g.status;
  END IF;
  IF coalesce((g.stats -> 'validacion' ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ERR_VALIDACION_REQUERIDA: active solo tras fin_generation_validate con ok=true';
  END IF;

  SELECT * INTO v_old FROM public.fin_posting_generations
  WHERE store_id = p_store_id AND status = 'active';
  IF v_old.id IS NOT NULL THEN
    UPDATE public.fin_posting_generations
    SET status = 'superseded', superseded_at = now()
    WHERE id = v_old.id;
  END IF;

  UPDATE public.fin_posting_generations
  SET status = 'active', activated_at = now(), activated_by = v_caller
  WHERE id = p_generation_id;

  RETURN jsonb_build_object('activada', g.code, 'id', g.id,
    'superseded', v_old.code, 'superseded_id', v_old.id,
    'activada_en', now());
END $function$;

-- Rollback (misión §7.1.8): la activa pasa a rolled_back y la última
-- superseded vuelve a active. Reversible y auditable.
CREATE OR REPLACE FUNCTION public.fin_generation_rollback(
  p_store_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_active record; v_prev record;
BEGIN
  -- ACL pura (patrón fin_rectify_*): ejecución SOLO por service_role
  -- (canal canónico). v_caller queda como atribución (puede ser NULL).
  PERFORM pg_advisory_xact_lock(hashtext('fin-gen:' || p_store_id::text));

  SELECT * INTO v_active FROM public.fin_posting_generations
  WHERE store_id = p_store_id AND status = 'active';
  IF v_active.id IS NULL THEN RAISE EXCEPTION 'ERR_SIN_GENERACION_ACTIVA'; END IF;

  SELECT * INTO v_prev FROM public.fin_posting_generations
  WHERE store_id = p_store_id AND status = 'superseded'
  ORDER BY superseded_at DESC NULLS LAST LIMIT 1;
  IF v_prev.id IS NULL THEN
    RAISE EXCEPTION 'ERR_SIN_GENERACION_SUPERSEDED: no hay generación previa a la que volver';
  END IF;

  UPDATE public.fin_posting_generations
  SET status = 'rolled_back',
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('rollback_en', now())
  WHERE id = v_active.id;
  UPDATE public.fin_posting_generations
  SET status = 'active',
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('reactivada_en', now())
  WHERE id = v_prev.id;

  RETURN jsonb_build_object('rolled_back', v_active.code, 'id', v_active.id,
    'reactivada', v_prev.code, 'reactivada_id', v_prev.id);
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. SEGURIDAD — RLS multitienda + grants endurecidos
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.fin_account_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_account_mapping_select ON public.fin_account_mapping;
CREATE POLICY fin_account_mapping_select ON public.fin_account_mapping
  FOR SELECT USING (true);
-- Sin políticas de escritura: solo service_role/postgres (canal canónico).

ALTER TABLE public.fin_posting_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_posting_generations_select ON public.fin_posting_generations;
CREATE POLICY fin_posting_generations_select ON public.fin_posting_generations
  FOR SELECT USING (
    public.is_admin_check(auth.uid())
    OR public.has_store_access_as(auth.uid(), store_id));
-- Sin políticas de escritura: solo service_role/postgres.

REVOKE ALL ON public.fin_account_mapping FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fin_account_mapping TO authenticated;
REVOKE ALL ON public.fin_posting_generations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fin_posting_generations TO authenticated;

-- Motor interno y ciclo de vida: NO ejecutables por clientes.
REVOKE ALL ON FUNCTION
  public.fin_resolve_financial_account(text, text),
  public.fin_active_generation(uuid),
  public.fin_post_document(text, uuid, text, uuid, uuid, uuid),
  public.fin_post_document_safe(text, uuid, text, uuid, uuid),
  public.fin_post_document_annulment(text, uuid, uuid),
  public.fin_generation_create(uuid, text, text, uuid),
  public.fin_generation_build(uuid, uuid, boolean, uuid),
  public.fin_generation_validate(uuid, uuid, uuid),
  public.fin_generation_activate(uuid, uuid, uuid),
  public.fin_generation_rollback(uuid, uuid)
FROM PUBLIC, anon, authenticated;
-- Ciclo de vida de generaciones: canal canónico (service_role), patrón
-- fin_rectify_sale_payment_method (REVOKE de clientes + GRANT explícito).
GRANT EXECUTE ON FUNCTION
  public.fin_generation_create(uuid, text, text, uuid),
  public.fin_generation_build(uuid, uuid, boolean, uuid),
  public.fin_generation_validate(uuid, uuid, uuid),
  public.fin_generation_activate(uuid, uuid, uuid),
  public.fin_generation_rollback(uuid, uuid)
TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 12. SANITY CHECK del lote (fail-closed si el mapeo quedó incompleto)
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_map int; v_rules int;
BEGIN
  SELECT count(*) INTO v_map FROM public.fin_account_mapping WHERE is_active;
  IF v_map < 10 THEN
    RAISE EXCEPTION 'CP-FIN-003: mapeo canónico incompleto (%) — se esperaban >= 10 combinaciones', v_map;
  END IF;
  SELECT count(*) INTO v_rules FROM public.fin_rule_versions
  WHERE status = 'active' AND document_type IN ('VENTA', 'SERVICIO_RECIBIDO', 'RECEPCION', 'DEVOLUCION_VENTA')
    AND store_id IS NULL;
  IF v_rules < 4 THEN
    RAISE EXCEPTION 'CP-FIN-003: reglas v3/v2 incompletas (%)', v_rules;
  END IF;
  RAISE NOTICE 'CP-FIN-003 OK: mapeo % combinaciones, % reglas activas', v_map, v_rules;
END $$;
