-- ═══════════════════════════════════════════════════════════════════════════════
-- 01_constraints.sql — Restricciones ESTRUCTURALES (inmediatas: CHECK, FK, UNIQUE).
-- Correspondencia con el diseño: D.18.1 (extremos y ciclo), D.19.1 (matriz por
-- estado, v3), D.20.4/D.20.5 (cadena de custodia, roles), D.21.2 (FKs compuestas).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── FKs COMPUESTAS (id, store_id): toda sesión/cuenta/gaveta de la transferencia
--    pertenece ESTRUCTURALMENTE a la MISMA tienda (D.21.2; impide "cuenta de otra
--    tienda" y "sesión de otra tienda" de forma inmediata) ──────────────────────
ALTER TABLE cash_registers ADD CONSTRAINT uq_reg_id_store UNIQUE (id, store_id);
ALTER TABLE cash_accounts  ADD CONSTRAINT uq_acc_id_store UNIQUE (id, store_id);
ALTER TABLE cash_closures  ADD CONSTRAINT uq_clo_id_store UNIQUE (id, store_id);

ALTER TABLE cash_transfers
  ADD CONSTRAINT fk_from_reg   FOREIGN KEY (from_register_id,       store_id) REFERENCES cash_registers(id, store_id),
  ADD CONSTRAINT fk_to_reg     FOREIGN KEY (to_register_id,         store_id) REFERENCES cash_registers(id, store_id),
  ADD CONSTRAINT fk_from_acc   FOREIGN KEY (from_account_id,        store_id) REFERENCES cash_accounts(id, store_id),
  ADD CONSTRAINT fk_to_acc     FOREIGN KEY (to_account_id,          store_id) REFERENCES cash_accounts(id, store_id),
  ADD CONSTRAINT fk_sent_sess  FOREIGN KEY (sent_from_session_id,   store_id) REFERENCES cash_closures(id, store_id),
  ADD CONSTRAINT fk_recv_sess  FOREIGN KEY (received_in_session_id, store_id) REFERENCES cash_closures(id, store_id),
  ADD CONSTRAINT fk_ret_sess   FOREIGN KEY (return_in_session_id,   store_id) REFERENCES cash_closures(id, store_id),
  ADD CONSTRAINT fk_recv_acc   FOREIGN KEY (received_in_account_id, store_id) REFERENCES cash_accounts(id, store_id),
  ADD CONSTRAINT fk_ret_acc    FOREIGN KEY (return_in_account_id,   store_id) REFERENCES cash_accounts(id, store_id);

-- ── Extremo receptor/retorno EXACTO (D.21.2): la cuenta receptora es la del
--    destino; la de retorno, la del ORIGEN (el retorno jamás va al destino) ────
ALTER TABLE cash_transfers
  ADD CONSTRAINT ctr_received_account_is_dest CHECK (
    received_in_account_id IS NULL OR received_in_account_id = to_account_id),
  ADD CONSTRAINT ctr_return_account_is_origin CHECK (
    return_in_account_id IS NULL OR return_in_account_id = from_account_id);

-- ── Matriz de campos por estado (D.19.1/D.20.5; hace IMPOSIBLE el estado
--    intermedio "entregada sin pierna" y el campo anticipado) ───────────────────
ALTER TABLE cash_transfers
  ADD CONSTRAINT ctr_state_fields CHECK (
  ( status IN ('solicitada','cancelada')
      AND leg_out_payment_id IS NULL AND leg_in_payment_id IS NULL
      AND sent_from_session_id IS NULL AND received_in_session_id IS NULL
      AND received_in_account_id IS NULL AND return_in_session_id IS NULL
      AND return_in_account_id IS NULL
      AND delivered_by IS NULL AND received_by IS NULL
      AND carrier_user_id IS NULL
      AND requested_by IS NOT NULL )
  OR ( status = 'entregada'
      AND leg_out_payment_id IS NOT NULL AND leg_in_payment_id IS NULL
      AND received_in_session_id IS NULL AND received_in_account_id IS NULL
      AND return_in_session_id IS NULL AND return_in_account_id IS NULL
      AND received_by IS NULL
      AND delivered_by IS NOT NULL AND requested_by IS NOT NULL
      AND ( (from_register_id IS NOT NULL AND sent_from_session_id IS NOT NULL)
         OR (from_account_id  IS NOT NULL AND sent_from_session_id IS NULL) ) )
  OR ( status = 'en_devolucion'
      AND leg_out_payment_id IS NOT NULL AND leg_in_payment_id IS NULL
      AND received_in_session_id IS NULL AND received_in_account_id IS NULL
      AND return_in_session_id IS NULL AND return_in_account_id IS NULL
      AND received_by IS NULL
      AND delivered_by IS NOT NULL AND requested_by IS NOT NULL
      AND ( (from_register_id IS NOT NULL AND sent_from_session_id IS NOT NULL)
         OR (from_account_id  IS NOT NULL AND sent_from_session_id IS NULL) ) )
  OR ( status = 'recibida'
      AND leg_out_payment_id IS NOT NULL AND leg_in_payment_id IS NOT NULL
      AND to_register_id IS NOT NULL
      AND received_in_session_id IS NOT NULL AND received_in_account_id IS NULL
      AND return_in_session_id IS NULL AND return_in_account_id IS NULL
      AND delivered_by IS NOT NULL AND requested_by IS NOT NULL AND received_by IS NOT NULL
      AND ( (from_register_id IS NOT NULL AND sent_from_session_id IS NOT NULL)
         OR (from_account_id  IS NOT NULL AND sent_from_session_id IS NULL) ) )
  OR ( status = 'recibida_en_cuenta'
      AND leg_out_payment_id IS NOT NULL AND leg_in_payment_id IS NOT NULL
      AND to_account_id IS NOT NULL
      AND received_in_session_id IS NULL AND received_in_account_id IS NOT NULL
      AND return_in_session_id IS NULL AND return_in_account_id IS NULL
      AND delivered_by IS NOT NULL AND requested_by IS NOT NULL AND received_by IS NOT NULL
      AND ( (from_register_id IS NOT NULL AND sent_from_session_id IS NOT NULL)
         OR (from_account_id  IS NOT NULL AND sent_from_session_id IS NULL) ) )
  OR ( status = 'devuelta'
      AND leg_out_payment_id IS NOT NULL AND leg_in_payment_id IS NOT NULL
      AND received_in_session_id IS NULL AND received_in_account_id IS NULL
      AND delivered_by IS NOT NULL AND requested_by IS NOT NULL
      AND ( (from_register_id IS NOT NULL
              AND return_in_session_id IS NOT NULL AND return_in_account_id IS NULL)
         OR (from_account_id  IS NOT NULL
              AND return_in_account_id  IS NOT NULL AND return_in_session_id IS NULL) ) )
  );

-- Roles separados (D.20.5): solicitar ≠ entregar; la solicitud exige solicitante.
ALTER TABLE cash_transfers
  ADD CONSTRAINT ctr_roles_request CHECK (requested_by IS NOT NULL);

-- ── Cadena de custodia (D.20.4/D.21.2): misma transferencia, sin bifurcación,
--    primer evento único ────────────────────────────────────────────────────────
ALTER TABLE cash_transfer_custody_events
  DROP CONSTRAINT cash_transfer_custody_events_previous_event_id_fkey,
  ADD CONSTRAINT fk_ctr_custody_prev_same_transfer
    FOREIGN KEY (transfer_id, previous_event_id)
    REFERENCES cash_transfer_custody_events(transfer_id, id);

CREATE UNIQUE INDEX uq_ctr_custody_single_successor
  ON cash_transfer_custody_events (previous_event_id)
  WHERE previous_event_id IS NOT NULL;
CREATE UNIQUE INDEX uq_ctr_custody_first
  ON cash_transfer_custody_events (transfer_id) WHERE event_seq = 1;
