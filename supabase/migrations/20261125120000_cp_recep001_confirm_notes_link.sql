-- ════════════════════════════════════════════════════════════════════════
-- CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001 · Migración 1/2 (2026-11-25)
-- Enlace documental del saldo en existencia («Saldo en existencia según almacén»)
-- ════════════════════════════════════════════════════════════════════════
--
-- CAUSA RAÍZ (auditada con datos de producción, tienda ENERVIDA-VITALLCONS):
--   La RPC confirm_pending_reception (última definición: 20260916000001)
--   inserta los movimientos de la confirmación con
--     reference_doc = 'Confirmacion recepcion'  y  notes = NULL.
--   La doctrina del «saldo posterior histórico» (lib/inventory/saldo-posterior.ts,
--   misión documentos SC-2-04/SC-2-12 2026-11-07) exige el enlace documental
--   notes = receipt.id (∧ movement_type='purchase') que SÍ escribe
--   register_reception. Sin enlace → fuente='limitacion' → el SC-2-04 imprime
--   «s/d» aunque el inventario SÍ fue actualizado.
--   Caso reportado: cd921832-18e5-44da-a4d2-a6d17a16018b (ENT-000004-2026),
--   creada 16:56 UTC y confirmada 18:08:04.344527 UTC — sus 10 movimientos
--   existen pero quedaron huérfanos.
--
-- PARTE A — Corrección estructural (futuro):
--   confirm_pending_reception pasa a escribir notes = p_receipt_id::text,
--   en paridad con register_reception. reference_doc se conserva («Confirmacion
--   recepcion») para no alterar la semántica del kardex ni los reportes que lo
--   leen. El resto de la función permanece INTACTO (WAC primero → movimiento
--   después; fail-closed de estado; guard de acceso).
--
-- PARTE B — Reparación de datos (backfill CONSERVADOR y auditado):
--   Restaura notes = receipt.id SOLO en los lotes de confirmación cuyo
--   emparejamiento sea INEQUÍVOCO:
--     1) movement_type='purchase' ∧ notes IS NULL ∧
--        reference_doc='Confirmacion recepcion' (el patrón exacto del escritor),
--     2) existe UNA única recepción R en la misma tienda con status='active'
--        cuyo updated_at coincide EXACTAMENTE con created_at del movimiento
--        (confirm_pending_reception escribe updated_at = v_effective_date =
--        created_at del movimiento en la MISMA transacción),
--     3) TODOS los movimientos del lote (mismo created_at+store) emparejan
--        1-a-1 con las receipt_items de R (product_id ∧ cantidad) y el número
--        de movimientos del lote es IGUAL al número de ítems de R.
--   Los lotes sin match (p.ej. los 88 movimientos del 2026-07-01 12:00 UTC,
--   importación histórica inicial sin recepción asociada) NO se tocan: su
--   «s/d» queda JUSTIFICADO (historial sin enlace documental real).
--   Idempotencia: re-ejecutar no produce cambios (notes ya NO es NULL).
--   Trazabilidad: cada enlace restaurado se registra en audit_logs.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PARTE A — confirm_pending_reception con enlace documental
-- (re-definición con la misma firma certificada 3-args; cuerpo idéntico a
--  20260916000001 salvo la columna notes del INSERT — marcado con CP-RECEP-001)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_store_id uuid;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_unit_cost_cup numeric;
  v_units_to_add numeric;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'pending' THEN RAISE EXCEPTION 'ERR_RECEIPT_ALREADY_CONFIRMED: status=%', v_receipt.status; END IF;

  v_store_id := v_receipt.store_id;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
    v_units_to_add := v_item.quantity;

    -- Orden doctrina W62-01 §6: WAC primero → movimiento después (kardex ve ca_new)
    PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_in',
                    v_units_to_add, v_unit_cost_cup,
                    jsonb_build_object('rpc','confirm_pending_reception','receipt_id',p_receipt_id));

    UPDATE products SET updated_at = v_effective_date WHERE id = v_item.product_id AND store_id = v_store_id;

    -- CP-RECEP-001: el movimiento de confirmación porta el ENLACE DOCUMENTAL
    -- (notes = receipt.id) exigido por la doctrina del saldo posterior
    -- (lib/inventory/saldo-posterior.ts) — en paridad con register_reception.
    -- Antes quedaba notes=NULL y el SC-2-04 imprimía «s/d» injustificado.
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, notes, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', p_receipt_id::text, v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'active', reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id), updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END $function$
;

REVOKE EXECUTE ON FUNCTION public.confirm_pending_reception(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(uuid, uuid, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_pending_reception(uuid, uuid, timestamptz) IS
  'CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001: confirma una recepción pendiente; los movimientos purchase que genera portan el enlace documental notes=receipt_id (doctrina saldo posterior) además de reference_doc=''Confirmacion recepcion''.';

-- ─────────────────────────────────────────────────────────────────────────
-- PARTE B — Backfill conservador del enlace documental
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cp_recep001_backfill_confirm_notes(
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch RECORD;
  v_candidate RECORD;
  v_n_candidates int;
  v_items_count int;
  v_linked int := 0;
  v_batches int := 0;
  v_skipped int := 0;
  v_mov_count int;
BEGIN
  -- Lotes de confirmación huérfanos: misma tienda + created_at idéntico.
  FOR v_batch IN
    SELECT store_id, created_at, count(*) AS movs
    FROM public.stock_movements
    WHERE movement_type = 'purchase'
      AND notes IS NULL
      AND reference_doc = 'Confirmacion recepcion'
    GROUP BY store_id, created_at
  LOOP
    -- Recepción candidata: misma tienda, activa, confirmada en ESE instante
    -- (confirm_pending_reception escribe updated_at = v_effective_date, que es
    -- exactamente el created_at de sus movimientos). La candidata es válida
    -- SOLO si es ÚNICA (conteo explícito: dos recepciones confirmadas en el
    -- mismo instante con items solapados serían ambiguas → conservar).
    SELECT count(*) INTO v_n_candidates
    FROM public.receipts r
    WHERE r.store_id = v_batch.store_id
      AND r.status = 'active'
      AND r.updated_at = v_batch.created_at;
    IF v_n_candidates <> 1 THEN
      v_skipped := v_skipped + v_batch.movs;
      CONTINUE;
    END IF;

    SELECT r.id, (SELECT count(*) FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS items
      INTO v_candidate
    FROM public.receipts r
    WHERE r.store_id = v_batch.store_id
      AND r.status = 'active'
      AND r.updated_at = v_batch.created_at;

    SELECT count(*) INTO v_mov_count
    FROM public.stock_movements m
    WHERE m.store_id = v_batch.store_id AND m.created_at = v_batch.created_at
      AND m.movement_type = 'purchase' AND m.notes IS NULL
      AND m.reference_doc = 'Confirmacion recepcion'
      AND EXISTS (
        SELECT 1 FROM public.receipt_items ri
        WHERE ri.receipt_id = v_candidate.id
          AND ri.product_id = m.product_id
          AND ri.quantity = m.quantity_change
      );

    v_items_count := v_candidate.items;
    -- Emparejamiento inequívoco: cada movimiento tiene su ítem y los conteos
    -- coinciden 1-a-1 (el lote completo pertenece a ESA recepción).
    IF v_mov_count = v_batch.movs AND v_items_count = v_batch.movs THEN
      v_batches := v_batches + 1;
      IF NOT p_dry_run THEN
        UPDATE public.stock_movements m
        SET notes = v_candidate.id::text
        WHERE m.store_id = v_batch.store_id AND m.created_at = v_batch.created_at
          AND m.movement_type = 'purchase' AND m.notes IS NULL
          AND m.reference_doc = 'Confirmacion recepcion';
        INSERT INTO public.audit_logs (action, table_name, record_id, store_id, metadata)
        VALUES ('CP_RECEP001_CONFIRM_NOTES_BACKFILL', 'stock_movements', v_candidate.id, v_batch.store_id,
          jsonb_build_object(
            'receipt_id', v_candidate.id,
            'movements_linked', v_batch.movs,
            'movement_instant', v_batch.created_at,
            'rule', 'updated_at==created_at ∧ multiset(producto,cantidad) completo e inequívoco',
            'mission', 'CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001'));
      END IF;
      v_linked := v_linked + v_batch.movs;
    ELSE
      v_skipped := v_skipped + v_batch.movs;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'batches_linked', v_batches,
    'movements_linked', v_linked,
    'movements_skipped_conservados', v_skipped
  );
END $function$;

-- ACL EXCLUSIVA service_role: Supabase otorga EXECUTE a authenticated POR
-- DEFECTO (ALTER DEFAULT PRIVILEGES) en el momento de crear la función, así que
-- el REVOKE explícito de authenticated es OBLIGATORIO para que la exclusiva sea
-- real (detectado por Capa C del security contract: UNEXPECTED_ACL_DRIFT entre
-- el surface LIVE y el replay de migraciones; CI 2026-11-24).
REVOKE EXECUTE ON FUNCTION public.cp_recep001_backfill_confirm_notes(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_recep001_backfill_confirm_notes(boolean) TO service_role;

-- Aplicar el backfill UNA SOLA VEZ (regla de oro productiva; idempotente).
SELECT public.cp_recep001_backfill_confirm_notes(false) AS cp_recep001_backfill;

-- ─────────────────────────────────────────────────────────────────────────
-- GUARD fail-closed post-migración
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_RECEP001_GUARD$
DECLARE
  v_fn text;
  v_pending int;
BEGIN
  -- A) La función certificada escribe el enlace documental.
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'confirm_pending_reception'
     AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-RECEP001-GUARD: confirm_pending_reception(3 args) no existe';
  END IF;
  IF v_fn NOT LIKE '%p_receipt_id::text%' THEN
    RAISE EXCEPTION 'CP-RECEP001-GUARD: confirm_pending_reception no escribe notes=receipt_id';
  END IF;

  -- B) Backfill completado: el backfill en MODO DRY-RUN (misma lógica exacta,
  --    sin escribir) ya no debe encontrar lotes inequívocos por enlazar.
  SELECT (public.cp_recep001_backfill_confirm_notes(true)->>'movements_linked')::int
    INTO v_pending;
  IF v_pending IS NULL OR v_pending <> 0 THEN
    RAISE EXCEPTION 'CP-RECEP001-GUARD: quedan % movimientos de confirmación inequívocamente enlazables sin notes', v_pending;
  END IF;
END
$CP_RECEP001_GUARD$;
