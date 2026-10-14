-- ============================================================================
-- Migración 20261014080000: regularize_sale_payment
-- Mecanismo oficial mínimo de regularización de componentes de pago y total
-- de una venta completada (ajuste de pagos con corrección de total y libro de
-- pagos), para el CIERRE FINAL de EnerVida-Vitallcons (corte 09/10/2026):
--   LOTE 5 — fila 842: efectivo 5 → 3.850 CUP (TX ef8bd997, aud-op-ven-27)
--   LOTE 4 — 7 TX Zelle 08/10: componente Zelle a CUP ×680 demostrado
-- Diseño:
--   * ADDITIVA: no modifica ninguna función existente.
--   * SECURITY DEFINER con OWNER costpro_transaction_adjuster (rol NOLOGIN del
--     proyecto): es el único propietario que el trigger protect_transactions_
--     total_amount autoriza a cambiar transactions.total_amount (mismo patrón
--     que adjust_total_amount).
--   * Autorización de negocio dentro de la función: canal service_role +
--     actor con rol admin/manager/encargado EN LA TIENDA de la venta
--     (can_admin_reverse_transaction). Alcance por tienda garantizado: la
--     función opera exclusivamente sobre la tienda de la transacción.
--   * Idempotencia: por audit_logs (action + idempotency_key) — 2ª llamada
--     devuelve {status:idempotent} sin escribir.
--   * Invariantes: estados completed-only; montos >= 0; post-condición
--     SUM(payment_transactions.amount_cup) = total (tolerancia 0.01);
--     respete trg_validate_payment_invariants (CUP rate=1, USD rate>1,
--     pagos <= total actualizado ANTES de las filas de pago).
--   * amount_cup es GENERATED (CUP→amount, si no amount×exchange_rate).
--   * Auditoría: snapshot completo old/new en audit_logs +
--     trg_audit_transaction_changes automático.
--   * NO reescribe transactions.sale_exchange_rate (695 almacenado se conserva
--     como registro histórico); la tasa comercial demostrada se aplica en la
--     fila de pago (exchange_rate 680) y en los componentes CUP.
-- Reversión:
--   * Datos: restaurar desde audit_logs.old_data (misma función admite valores
--     explícitos) — procedimiento documentado en el expediente de cierre.
--   * Capacidad: DROP FUNCTION ...; DROP POLICY cta_family_payment_transactions_update;
--     (no afecta a otros objetos).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.regularize_sale_payment(
    p_transaction_id   uuid,
    p_new_cash         numeric DEFAULT NULL,
    p_new_zelle_cup    numeric DEFAULT NULL,
    p_new_zelle_usd    numeric DEFAULT NULL,
    p_new_zelle_rate   numeric DEFAULT NULL,
    p_new_transfer     numeric DEFAULT NULL,
    p_new_subtotal     numeric DEFAULT NULL,
    p_reason           text,
    p_user_id          uuid,
    p_idempotency_key  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_cash numeric;
    v_zelle numeric;
    v_transfer numeric;
    v_new_total numeric;
    v_subtotal numeric;
    v_old_tx jsonb;
    v_old_pays jsonb;
    v_new_pays jsonb;
    v_sum_pays numeric;
    v_idem_exists boolean := false;
BEGIN
    -- 1) Canal de llamada: solo service_role (convención server-to-server del proyecto)
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013';
    END IF;
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = 'PT014';
    END IF;

    -- 2) Transacción + lock de fila
    SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016';
    END IF;

    -- 3) Autorización de negocio: admin/manager/encargado EN LA TIENDA de la venta
    IF NOT public.can_admin_reverse_transaction(p_user_id, v_tx.store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;

    -- 4) Estado: solo ventas completadas
    IF v_tx.status <> 'completed' THEN
        RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
    END IF;

    -- 5) Idempotencia por audit_logs
    SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'REGULARIZE_SALE_PAYMENT'
          AND record_id = p_transaction_id
          AND metadata->>'idempotency_key' = btrim(p_idempotency_key)
    ) INTO v_idem_exists;
    IF v_idem_exists THEN
        RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
    END IF;

    -- 6) Montos nuevos (NULL = mantener actual)
    v_cash     := COALESCE(p_new_cash, v_tx.cash_amount, 0);
    v_zelle    := COALESCE(p_new_zelle_cup, v_tx.zelle_amount, 0);
    v_transfer := COALESCE(p_new_transfer, v_tx.transfer_amount, 0);
    IF v_cash < 0 OR v_zelle < 0 OR v_transfer < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_AMOUNTS' USING ERRCODE = 'PT012';
    END IF;
    v_new_total := v_cash + v_zelle + v_transfer;
    v_subtotal  := COALESCE(p_new_subtotal, v_new_total);

    -- 7) Snapshot BEFORE
    SELECT jsonb_build_object(
        'total_amount', v_tx.total_amount, 'subtotal', v_tx.subtotal,
        'cash_amount', v_tx.cash_amount, 'transfer_amount', v_tx.transfer_amount,
        'zelle_amount', v_tx.zelle_amount, 'sale_currency', v_tx.sale_currency,
        'sale_exchange_rate', v_tx.sale_exchange_rate
    ) INTO v_old_tx;
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) - 'amount_cup' ORDER BY pt.payment_method), '[]'::jsonb)
      INTO v_old_pays
      FROM public.payment_transactions pt
     WHERE pt.transaction_id = p_transaction_id;

    -- 8) UPDATE transactions — primero el total (invariante ERR_PAYMENT_EXCEEDS_TOTAL)
    UPDATE public.transactions
       SET cash_amount = v_cash,
           zelle_amount = v_zelle,
           transfer_amount = v_transfer,
           total_amount = v_new_total,
           subtotal = v_subtotal,
           updated_at = now()
     WHERE id = p_transaction_id;

    -- 9) Libro de pagos (amount_cup GENERATED; respete trg_validate_payment_invariants)
    UPDATE public.payment_transactions
       SET amount = v_cash, updated_at = now()
     WHERE transaction_id = p_transaction_id AND payment_method = 'cash' AND currency = 'CUP';

    IF p_new_zelle_usd IS NOT NULL THEN
        UPDATE public.payment_transactions
           SET amount = p_new_zelle_usd,
               exchange_rate = COALESCE(p_new_zelle_rate, exchange_rate),
               updated_at = now()
         WHERE transaction_id = p_transaction_id AND payment_method = 'zelle';
    END IF;

    -- 10) Post-condición: Σ pagos (no refund) = total
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_pays
      FROM public.payment_transactions
     WHERE transaction_id = p_transaction_id
       AND (direction IS DISTINCT FROM 'refund');
    IF ABS(v_sum_pays - v_new_total) > 0.01 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total=%', v_sum_pays, v_new_total
            USING ERRCODE = 'PT011';
    END IF;

    -- 11) Snapshot AFTER + auditoría
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) - 'amount_cup' ORDER BY pt.payment_method), '[]'::jsonb)
      INTO v_new_pays
      FROM public.payment_transactions pt
     WHERE pt.transaction_id = p_transaction_id;

    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
    VALUES (
        'REGULARIZE_SALE_PAYMENT', 'transactions', p_transaction_id, v_tx.store_id, p_user_id,
        jsonb_build_object('transaction', v_old_tx, 'payment_rows', v_old_pays),
        jsonb_build_object('transaction', jsonb_build_object(
            'total_amount', v_new_total, 'subtotal', v_subtotal,
            'cash_amount', v_cash, 'transfer_amount', v_transfer, 'zelle_amount', v_zelle),
            'payment_rows', v_new_pays),
        jsonb_build_object('reason', p_reason, 'idempotency_key', btrim(p_idempotency_key))
    );

    RETURN jsonb_build_object(
        'status', 'success', 'transaction_id', p_transaction_id,
        'old_total', v_old_tx->>'total_amount', 'new_total', v_new_total,
        'new_cash', v_cash, 'new_zelle', v_zelle
    );
END;
$function$;

ALTER FUNCTION public.regularize_sale_payment(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, text)
    OWNER TO costpro_transaction_adjuster;

GRANT EXECUTE ON FUNCTION public.regularize_sale_payment(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, text)
    TO service_role;

-- Política espejo de las cta_family_* existentes (rol interno NOLOGIN; la
-- autorización real ocurre dentro de la función con can_admin_reverse_transaction).
CREATE POLICY cta_family_payment_transactions_update
    ON public.payment_transactions
    FOR UPDATE
    TO costpro_transaction_adjuster
    USING (true)
    WITH CHECK (true);
