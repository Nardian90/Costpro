-- ══════════════════════════════════════════════════════════════════════════
-- CP-FIN · FIX SENTIDOS DE PAGO — RECEPCIÓN y SERVICIO RECIBIDO
-- (2026-11-13, auditoría final)
-- ══════════════════════════════════════════════════════════════════════════
-- DEFECTO CRÍTICO detectado por la auditoría integral (Casos C y D):
--
--   Las reglas semilla de RECEPCION y SERVICIO_RECIBIDO contabilizaban el
--   evento «pago» con los sentidos INVERTIDOS:
--     · r-pay-cash / sp-cash-d : D ACT_EFECTIVO_CUP  (¡el pago SUMABA efectivo!)
--     · r-pay-bank / sp-bank-d : D ACT_BANCOS        (¡el pago SUMABA bancos!)
--     · r-pay-cxp  / sp-cxp-c  : C PAS_CXP_PROV / C PAS_SERV_PEND
--                                (¡el pago AUMENTABA la deuda!)
--
--   Contabilidad correcta al pagar una obligación: la deuda disminuye
--   (DÉBITO del pasivo) y el efectivo/banco disminuye (CRÉDITO del activo).
--   Prueba de inconsistencia interna: la regla de NÓMINA sí lo hace bien
--   (np-neto-d: D PAS_NOMINA_PEND; np-efec-c: C ACT_EFECTIVO_CUP), y la de
--   COMISION también (D gasto / C efectivo). Las validaciones previas
--   (smoke de la sesión de implementación) codificaron el error como
--   expectativa — la auditoría lo detectó al contrastar con la lógica
--   contable y con las demás reglas.
--
-- CORRECCIÓN: swap de sentido en los movimientos de evento «pago» de las
-- dos reglas semilla GLOBALES (store_id IS NULL, version 1): ACT_* →
-- credito, PAS_* → debito. Idempotente y quirúrgico (solo esas dos reglas;
-- el resto de reglas fueron auditadas sentimiento por sentimiento: OK).
--
-- NOTA: los asientos YA contabilizados con la regla errónea deben
-- reprocesarse tras esta corrección (los de la BD aislada de E2E son datos
-- de prueba; producción tiene 0 asientos al momento de esta corrección —
-- verificado por m014).
-- ══════════════════════════════════════════════════════════════════════════

UPDATE public.fin_rule_versions
SET movements = (
  SELECT jsonb_agg(
    CASE
      WHEN m ->> 'evento' = 'pago' AND m ->> 'sentido' = 'debito'
           AND (m ->> 'categoria') LIKE 'ACT_%'
        THEN jsonb_set(m, '{sentido}', '"credito"')
      WHEN m ->> 'evento' = 'pago' AND m ->> 'sentido' = 'credito'
           AND (m ->> 'categoria') LIKE 'PAS_%'
        THEN jsonb_set(m, '{sentido}', '"debito"')
      ELSE m
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(movements) WITH ORDINALITY AS t(m, ord)
)
WHERE document_type IN ('RECEPCION', 'SERVICIO_RECIBIDO')
  AND store_id IS NULL
  AND version = 1;

-- Verificación de cierre (fail-closed)
DO $$
DECLARE
  v_bad int; v_ok_rec int; v_ok_srv int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.fin_rule_versions rv,
       jsonb_array_elements(rv.movements) m
  WHERE rv.document_type IN ('RECEPCION', 'SERVICIO_RECIBIDO')
    AND rv.store_id IS NULL AND rv.version = 1
    AND m ->> 'evento' = 'pago'
    AND (  (m ->> 'sentido' = 'debito'  AND (m ->> 'categoria') LIKE 'ACT_%')
        OR (m ->> 'sentido' = 'credito' AND (m ->> 'categoria') LIKE 'PAS_%') );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'CP-FIN sentidos de pago: % movimientos siguen invertidos', v_bad;
  END IF;
  SELECT count(*) INTO v_ok_rec
  FROM public.fin_rule_versions rv, jsonb_array_elements(rv.movements) m
  WHERE rv.document_type='RECEPCION' AND rv.store_id IS NULL AND rv.version=1
    AND m ->> 'id' = 'r-pay-cxp' AND m ->> 'sentido' = 'debito';
  SELECT count(*) INTO v_ok_srv
  FROM public.fin_rule_versions rv, jsonb_array_elements(rv.movements) m
  WHERE rv.document_type='SERVICIO_RECIBIDO' AND rv.store_id IS NULL AND rv.version=1
    AND m ->> 'id' = 'sp-cxp-c' AND m ->> 'sentido' = 'debito';
  IF v_ok_rec <> 1 OR v_ok_srv <> 1 THEN
    RAISE EXCEPTION 'CP-FIN sentidos de pago: corrección no aplicada (rec=%, srv=%)', v_ok_rec, v_ok_srv;
  END IF;
  RAISE NOTICE 'CP-FIN sentidos de pago OK: D pasivo / C activo en RECEPCION y SERVICIO_RECIBIDO';
END $$;
