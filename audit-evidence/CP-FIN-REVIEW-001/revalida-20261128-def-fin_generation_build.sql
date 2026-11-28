CREATE OR REPLACE FUNCTION public.fin_generation_build(p_store_id uuid, p_generation_id uuid, p_include_rectifications boolean DEFAULT false, p_include_ajuste_ids uuid[] DEFAULT NULL::uuid[], p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  g record; m record; r record;
  v_active uuid; v_new uuid;
  v_e record;
  v_ok int := 0; v_skip int := 0; v_err int := 0; v_ann int := 0; v_copied int := 0;
  v_no_recon jsonb := '[]'::jsonb; v_rect_skipped jsonb := '[]'::jsonb;
  v_ajuste_ids uuid[] := p_include_ajuste_ids;
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
  -- IS NOT DISTINCT FROM v_active cubre TAMBIÉN el legado sin generación
  -- (v_active NULL = asientos generation_id NULL de tiendas creadas tras la
  -- migración): sus anulaciones y ajustes deben reproducirse igual.
  FOR r IN
      SELECT fe.document_type, fe.document_id, fe.event, fe.payment_ref
      FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active
        AND fe.document_id IS NOT NULL
        AND fe.event IN ('reconocimiento', 'pago')
      ORDER BY fe.document_type, fe.economic_date, fe.posted_at
    LOOP
      BEGIN
        -- fin_post_document devuelve NULL cuando el asiento YA existe en la
        -- generación (idempotencia) o la regla no produce movimientos: se
        -- cuenta aparte para poder verificar la idempotencia del build.
        IF public.fin_post_document(r.document_type, r.document_id, r.event,
                                    r.payment_ref, v_caller, v_new) IS NOT NULL THEN
          v_ok := v_ok + 1;
        ELSE
          v_skip := v_skip + 1;
        END IF;
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE 'ERR_DOC_NOT_FOUND%' THEN
          -- Documento ya inexistente (energía: fd9d6c88). Por defecto NO se
          -- copia: los ajustes históricos sobre datos YA CORREGIDOS quedan
          -- incorporados en la re-derivación (copiarlos duplicaría la
          -- corrección — hallazgo real de EnerVida: reversión 151.3M y C1
          -- 40.7M). Se REGISTRAN como no reconstruibles con su cuantía para
          -- el expediente (misión §2/§15).
          v_no_recon := v_no_recon || jsonb_build_object('doc', r.document_id,
            'tipo', r.document_type, 'evento', r.event, 'motivo',
            'documento inexistente (ERR_DOC_NOT_FOUND) — asiento NO copiado: cuantificar en el expediente');
          v_skip := v_skip + 1;
        ELSE
          v_err := v_err + 1;
          v_errors := v_errors || jsonb_build_object('pase', 1, 'doc', r.document_id,
            'tipo', r.document_type, 'evento', r.event, 'error', substr(SQLERRM, 1, 200));
        END IF;
      END;
    END LOOP;

    -- PASE 2: anulaciones de la generación activa → compensar en la candidata.
    FOR r IN
      SELECT DISTINCT fe.document_type, fe.document_id
      FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'anulacion'
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
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'apertura'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fin_entries x
                     WHERE x.generation_id = v_new AND x.event = 'apertura'
                       AND x.document_type = v_e.document_type
                       AND x.document_number IS NOT DISTINCT FROM v_e.document_number
                       AND x.economic_date = v_e.economic_date
                       AND x.description IS NOT DISTINCT FROM v_e.description
                       AND x.reversal_of IS NOT DISTINCT FROM v_e.reversal_of) THEN
        INSERT INTO public.fin_entries (
          store_id, document_type, document_id, document_number, event, payment_ref,
          economic_date, rule_version_id, movements_snapshot, reversal_of, status,
          description, created_by, generation_id, posted_at)
        VALUES (v_e.store_id, v_e.document_type, v_e.document_id, v_e.document_number, v_e.event,
                v_e.payment_ref, v_e.economic_date, v_e.rule_version_id, v_e.movements_snapshot,
                v_e.reversal_of, v_e.status, v_e.description, v_e.created_by, v_new,
                v_e.posted_at)
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

    -- PASE 4: ajustes manuales → política de LISTA EXPLÍCITA (misión §2:
    -- clasificación por asiento, nunca una regla única para hechos distintos):
    -- · RECTIFICACION_FIN: omitidas (efecto incorporado en los datos
    --   corregidos que la candidata re-deriva — CP-FIN-001/002).
    -- · Ajustes que revierten reconocimientos SOBRE DATOS YA CORREGIDOS
    --   (hallazgo EnerVida: reversión 151,299,851 de FAC-VITALLCONS SKU
    --   111/112 y C1 40,733,723.50): omitidos — la re-derivación ya produce
    --   el valor correcto.
    -- · Regularizaciones de VALORACIÓN históricas autorizadas NO derivables
    --   (misiones 013/014: WAC drift, re-costeo): se copian SOLO si su id
    --   está en p_include_ajuste_ids (decisión documentada por asiento).
    -- Todas quedan registradas en stats (omitidas y copiadas).
    FOR v_e IN
      SELECT fe.* FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'ajuste_manual'
        AND fe.document_type <> 'RECTIFICACION_FIN'
        AND (v_ajuste_ids IS NOT NULL AND fe.id = ANY (v_ajuste_ids))
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fin_entries x
                     WHERE x.generation_id = v_new AND x.event = 'ajuste_manual'
                       AND x.document_type = v_e.document_type
                       AND x.document_number IS NOT DISTINCT FROM v_e.document_number
                       AND x.economic_date = v_e.economic_date
                       AND x.description IS NOT DISTINCT FROM v_e.description
                       AND x.reversal_of IS NOT DISTINCT FROM v_e.reversal_of) THEN
        INSERT INTO public.fin_entries (
          store_id, document_type, document_id, document_number, event, payment_ref,
          economic_date, rule_version_id, movements_snapshot, reversal_of, status,
          description, created_by, generation_id, posted_at)
        VALUES (v_e.store_id, v_e.document_type, v_e.document_id, v_e.document_number, v_e.event,
                v_e.payment_ref, v_e.economic_date, v_e.rule_version_id, v_e.movements_snapshot,
                v_e.reversal_of, v_e.status, v_e.description, v_e.created_by, v_new,
                v_e.posted_at)
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

    -- Registro completo de ajuste_manual omitidos (RECTIFICACION_FIN y el
    -- resto) para el expediente: identificación + cuantía (misión §15).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'entry_id', fe.id, 'document_type', fe.document_type,
             'document_number', fe.document_number,
             'descripcion', fe.description, 'economic_date', fe.economic_date,
             'importe', (SELECT round(sum(CASE WHEN fm.sense = 'debito' THEN fm.amount_cup ELSE -fm.amount_cup END), 2)
                         FROM public.fin_movements fm WHERE fm.entry_id = fe.id))), '[]'::jsonb)
    INTO v_rect_skipped
    FROM public.fin_entries fe
    WHERE fe.store_id = p_store_id
      AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'ajuste_manual'
      AND NOT (v_ajuste_ids IS NOT NULL AND fe.id = ANY (v_ajuste_ids));

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
    UNION ALL
    -- CP-FIN-110: anticipos de órdenes de trabajo/service (ORDEN_TRABAJO v1).
    SELECT 'ORDEN_TRABAJO', pt.ref_id, 'pago', pt.id
    FROM public.payment_transactions pt
    JOIN public.production_orders po ON po.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
      AND coalesce(pt.direction, 'in') = 'in'
      AND po.order_type IN ('service', 'work')
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'ORDEN_TRABAJO' AND e.document_id = pt.ref_id
                        AND e.event = 'pago' AND e.payment_ref = pt.id
                        AND e.generation_id = v_new)
    UNION ALL
    -- CP-FIN-111 (P0-1): reconocimiento de órdenes RECONOCIBLES — status
    -- 'completed', o 'closed' CON evidencia documental de finalización real
    -- (completion_date, fijada por el RPC de cierre completed→closed). Las
    -- órdenes voided/reversed y las closed SIN evidencia de ejecución NO se
    -- convierten en ingresos (misión §3: nunca todas las closed por defecto).
    -- El trigger fin_trg_production_orders no puede dispararse retroactivamente:
    -- el pase 5 cubre las órdenes closed-completadas históricas.
    SELECT 'ORDEN_TRABAJO', o.id, 'reconocimiento', NULL
    FROM public.production_orders o
    WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
      AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'ORDEN_TRABAJO' AND e.document_id = o.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
  LOOP
    BEGIN
      IF public.fin_post_document(r.dt, r.doc, r.ev, r.pref, v_caller, v_new) IS NOT NULL THEN
        v_ok := v_ok + 1;
      ELSE
        v_skip := v_skip + 1;
      END IF;
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
          'repostados', v_ok, 'ya_existentes', v_skip, 'anulaciones', v_ann, 'copiados', v_copied,
          'errores', v_err, 'detalle_errores', v_errors,
          'no_reconstruibles', v_no_recon,
          'rectificaciones_omitidas', v_rect_skipped,
          'generacion_origen', v_active,
          'construida_en', now()))
  WHERE id = v_new;

  RETURN jsonb_build_object('status', 'candidate', 'repostados', v_ok,
    'ya_existentes', v_skip, 'anulaciones', v_ann, 'copiados', v_copied, 'errores', v_err,
    'detalle_errores', v_errors, 'no_reconstruibles', v_no_recon,
    'rectificaciones_omitidas', v_rect_skipped);
END $function$;
