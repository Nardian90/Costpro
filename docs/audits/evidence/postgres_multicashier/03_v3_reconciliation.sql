-- ═══════════════════════════════════════════════════════════════════════════════
-- 03_v3_reconciliation.sql — V3 DEFINITIVA (D.21): concilia TODAS las filas
-- asociadas a cada transferencia (legs_total, invalid_legs) y exige el titular
-- físico EXACTO, incluida la pertenencia de cada sesión a la GAVETA física y su
-- vigencia temporal histórica (abierta al momento de la operación; una sesión
-- cerrada DESPUÉS sigue siendo válida).
-- Se carga ANTES de 02_triggers.sql (los triggers consultan esta vista).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE VIEW v_cash_transfer_reconciliation AS
WITH legs AS (
  SELECT ct.id AS transfer_id, ct.status,
         ct.amount AS ct_amount, ct.currency AS ct_currency, ct.store_id AS ct_store,
         ct.leg_out_payment_id, ct.leg_in_payment_id,
         ct.from_register_id, ct.from_account_id, ct.to_register_id, ct.to_account_id,
         ct.sent_from_session_id, ct.received_in_session_id, ct.received_in_account_id,
         ct.return_in_session_id, ct.return_in_account_id,
         pt.id AS ledger_id, pt.direction, pt.payment_method,
         pt.amount AS pt_amount, pt.currency AS pt_currency, pt.store_id AS pt_store,
         pt.cash_closure_id, pt.cash_account_id, pt.at AS pt_at
  FROM cash_transfers ct
  LEFT JOIN payment_transactions pt
         ON pt.ref_type = 'cash_transfer' AND pt.ref_id = ct.id
),
eval AS (
  SELECT l.*,
    (l.direction = 'out')                AS es_out,
    (l.direction = 'in')                 AS es_in,
    (l.ledger_id = l.leg_out_payment_id) AS es_registrada_out,
    (l.ledger_id = l.leg_in_payment_id)  AS es_registrada_in,
    -- Identidad + igualdad financiera + medio físico (toda pierna, sin excepciones):
    (l.direction IN ('out','in')
     AND l.payment_method = 'cash'
     AND l.ledger_id IN (l.leg_out_payment_id, l.leg_in_payment_id)
     AND l.pt_amount   = l.ct_amount
     AND l.pt_currency = l.ct_currency
     AND l.pt_store    = l.ct_store) AS leg_base_ok,
    -- Titular EXACTO por pierna y estado (D.21.2): sesión ↔ gaveta física exacta,
    -- misma tienda, sesión vigente EN EL INSTANTE de la operación (vigencia histórica):
    CASE
      WHEN l.direction = 'out' THEN
        ( l.leg_out_payment_id IS NOT NULL AND l.cash_closure_id = l.sent_from_session_id
          AND l.cash_account_id IS NULL
          AND EXISTS (SELECT 1 FROM cash_closures cc
                       WHERE cc.id = l.sent_from_session_id
                         AND cc.cash_register_id = l.from_register_id
                         AND cc.store_id = l.ct_store
                         AND cc.opened_at <= l.pt_at
                         AND (cc.closed_at IS NULL OR cc.closed_at >= l.pt_at)))
       OR ( l.leg_out_payment_id IS NOT NULL AND l.cash_account_id = l.from_account_id
            AND l.cash_closure_id IS NULL )
      WHEN l.direction = 'in' AND l.status IN ('recibida','recibida_en_cuenta') THEN
        ( l.leg_in_payment_id IS NOT NULL AND l.cash_closure_id = l.received_in_session_id
          AND l.cash_account_id IS NULL
          AND EXISTS (SELECT 1 FROM cash_closures cc
                       WHERE cc.id = l.received_in_session_id
                         AND cc.cash_register_id = l.to_register_id
                         AND cc.store_id = l.ct_store
                         AND cc.opened_at <= l.pt_at
                         AND (cc.closed_at IS NULL OR cc.closed_at >= l.pt_at)))
       OR ( l.leg_in_payment_id IS NOT NULL AND l.cash_account_id = l.received_in_account_id
            AND l.cash_closure_id IS NULL )
      WHEN l.direction = 'in' AND l.status = 'devuelta' THEN
        ( l.leg_in_payment_id IS NOT NULL AND l.cash_closure_id = l.return_in_session_id
          AND l.cash_account_id IS NULL
          AND EXISTS (SELECT 1 FROM cash_closures cc
                       WHERE cc.id = l.return_in_session_id
                         AND cc.cash_register_id = l.from_register_id
                         AND cc.store_id = l.ct_store
                         AND cc.opened_at <= l.pt_at
                         AND (cc.closed_at IS NULL OR cc.closed_at >= l.pt_at)))
       OR ( l.leg_in_payment_id IS NOT NULL AND l.cash_account_id = l.return_in_account_id
            AND l.cash_closure_id IS NULL )
      ELSE false
    END AS titular_ok
  FROM legs l
),
agg AS (
  SELECT transfer_id, status,
         count(ledger_id) AS legs_total,                                   -- TODAS las filas asociadas
         count(*) FILTER (WHERE es_out)          AS out_all,
         count(*) FILTER (WHERE es_in)           AS in_all,
         count(*) FILTER (WHERE ledger_id IS NOT NULL
                           AND NOT (leg_base_ok AND titular_ok)) AS invalid_legs,
         count(*) FILTER (WHERE es_registrada_out AND leg_base_ok AND titular_ok) AS out_exactas,
         count(*) FILTER (WHERE es_registrada_in  AND leg_base_ok AND titular_ok) AS in_exactas
  FROM eval
  GROUP BY transfer_id, status
)
SELECT transfer_id, status, legs_total, out_all, in_all, invalid_legs, out_exactas, in_exactas,
       CASE WHEN
         ( status IN ('solicitada','cancelada')
             AND legs_total = 0 AND invalid_legs = 0 )
      OR ( status = 'entregada'
             AND legs_total = 1 AND out_all = 1 AND in_all = 0
             AND out_exactas = 1 AND invalid_legs = 0 )
      OR ( status = 'en_devolucion'
             AND legs_total = 1 AND out_all = 1 AND in_all = 0
             AND out_exactas = 1 AND invalid_legs = 0 )
      OR ( status = 'recibida'
             AND legs_total = 2 AND out_all = 1 AND in_all = 1
             AND out_exactas = 1 AND in_exactas = 1 AND invalid_legs = 0 )
      OR ( status = 'recibida_en_cuenta'
             AND legs_total = 2 AND out_all = 1 AND in_all = 1
             AND out_exactas = 1 AND in_exactas = 1 AND invalid_legs = 0 )
      OR ( status = 'devuelta'
             AND legs_total = 2 AND out_all = 1 AND in_all = 1
             AND out_exactas = 1 AND in_exactas = 1 AND invalid_legs = 0 )
       THEN false ELSE true END AS inconsistente
FROM agg;
