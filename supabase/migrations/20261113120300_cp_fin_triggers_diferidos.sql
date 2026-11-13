-- ══════════════════════════════════════════════════════════════════════════
-- CP-FIN · TRIGGERS DIFERIDOS (2026-11-13, auditoría final) — CORRECCIÓN
-- ══════════════════════════════════════════════════════════════════════════
-- DEFECTO CRÍTICO detectado por la auditoría integral (§4-§5):
--
--   Los RPC reales de negocio insertan el documento cabecera con estado
--   DEFINITIVO y las filas hijas DESPUÉS, dentro de la misma transacción:
--     · create_sale_v2        → transactions 'completed' (l.73) → items → pagos
--     · create_devolution_v2  → devolutions 'completed'        → items → reembolsos
--     · register_reception    → receipts 'active' (l.121/129)  → receipt_items (l.420)
--
--   Con los triggers AFTER INSERT inmediatos, el motor computaba métricas
--   ANTES de que existieran items/pagos:
--     · VENTA / DEVOLUCIÓN: débitos condicionales = 0, créditos > 0
--       → ERR_UNBALANCED → asiento perdido (queda en fin_posting_errors).
--     · RECEPCIÓN: total_cup = 0 → plantillas condicionales no aplican
--       → fin_post_document retorna NULL → ASIENTO OMITIDO EN SILENCIO
--       (y el pago posterior sí contabiliza → CxP negativa).
--
-- CORRECCIÓN: convertir los 3 triggers en CONSTRAINT TRIGGERS
-- DEFERRABLE INITIALLY DEFERRED → disparan al COMMIT de la transacción
-- del RPC, cuando items y pagos ya existen. La lógica de la función no
-- cambia (reconocimiento al estado definitivo + anulación compensatoria);
-- solo cambia el MOMENTO del disparo.
--
--   Nota de sintaxis: CREATE CONSTRAINT TRIGGER no admite «UPDATE OF
--   status»; se usa UPDATE genérico (la función ya filga por
--   NEW.status/OLD.status, y la idempotencia evita re-contabilizar).
--
-- Documentos autocontenidos (servicios, nóminas, comisiones, flujo de caja)
-- y los que nacen en estado no definitivo (vales 'pending' → 'completed'
-- al aprobar; ajustes 'PROCESSING' → confirmado) NO requieren deferral:
-- sus métricas ya están completas cuando el estado definitivo se alcanza.
--
-- Idempotente: DROP + CREATE. Re-ejecutable sin daño.
-- ══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS fin_trg_transactions ON public.transactions;
CREATE CONSTRAINT TRIGGER fin_trg_transactions
  AFTER INSERT OR UPDATE ON public.transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_transactions();

DROP TRIGGER IF EXISTS fin_trg_devolutions ON public.devolutions;
CREATE CONSTRAINT TRIGGER fin_trg_devolutions
  AFTER INSERT OR UPDATE ON public.devolutions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_devolutions();

DROP TRIGGER IF EXISTS fin_trg_receipts ON public.receipts;
CREATE CONSTRAINT TRIGGER fin_trg_receipts
  AFTER INSERT OR UPDATE ON public.receipts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_receipts();

-- Verificación de cierre (fail-closed)
DO $$
DECLARE
  v_deferred int; v_immediate int;
BEGIN
  -- los triggers de restricción crean entradas pg_constraint contype='t'
  SELECT count(*) INTO v_deferred
  FROM pg_constraint c
  WHERE c.contype = 't'
    AND c.conrelid IN ('public.transactions'::regclass,
                       'public.devolutions'::regclass,
                       'public.receipts'::regclass)
    AND c.conname LIKE 'fin_trg_%';
  IF v_deferred <> 3 THEN
    RAISE EXCEPTION 'CP-FIN triggers diferidos: esperados 3 constraints, encontrados %', v_deferred;
  END IF;
  -- el trigger de pagos sigue inmediato (métrica autocontenida: el pago mismo)
  SELECT count(*) INTO v_immediate
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.payment_transactions'::regclass
    AND t.tgname = 'fin_trg_payment_transactions' AND t.tgisinternal = false;
  IF v_immediate <> 1 THEN
    RAISE EXCEPTION 'CP-FIN: trigger de pagos ausente';
  END IF;
  RAISE NOTICE 'CP-FIN triggers diferidos OK: 3 constraints (transactions, devolutions, receipts)';
END $$;
