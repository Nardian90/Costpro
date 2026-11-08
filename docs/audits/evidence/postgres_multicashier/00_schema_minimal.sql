-- ═══════════════════════════════════════════════════════════════════════════════
-- COSTPRO-MULTICASHIER-DESIGN-008 · Expediente de validación PostgreSQL
-- 00_schema_minimal.sql — Esquema MÍNIMO (subconjunto fiel del diseño D.16-D.21).
-- Base desechable; SIN datos de producción ni credenciales. NO es código del módulo.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE stores (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  multicashier_enabled_at timestamptz  -- alcance del modelo (D.18.2: model_scope)
);

CREATE TABLE profiles (
  id       uuid PRIMARY KEY,
  store_id uuid REFERENCES stores(id),
  role     text NOT NULL DEFAULT 'cajero'
);

CREATE TABLE cash_registers (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  code     text NOT NULL,
  status   text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','blocked')),
  CONSTRAINT uq_register_store_code UNIQUE (store_id, code)
);

CREATE TABLE cash_accounts (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  kind     text NOT NULL DEFAULT 'treasury' CHECK (kind IN ('treasury')),
  CONSTRAINT uq_account_store_kind UNIQUE (store_id, kind)
);

CREATE TABLE cash_closures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id uuid NOT NULL REFERENCES cash_registers(id),
  store_id         uuid NOT NULL REFERENCES stores(id),
  user_id          uuid NOT NULL REFERENCES profiles(id),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE TABLE cash_transfers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               uuid NOT NULL REFERENCES stores(id),
  amount                 numeric(14,2) NOT NULL CHECK (amount > 0),
  currency               text NOT NULL,
  status                 text NOT NULL
                         CHECK (status IN ('solicitada','cancelada','entregada','en_devolucion',
                                           'recibida','recibida_en_cuenta','devuelta')),
  from_register_id       uuid REFERENCES cash_registers(id),
  from_account_id        uuid REFERENCES cash_accounts(id),
  to_register_id         uuid REFERENCES cash_registers(id),
  to_account_id          uuid REFERENCES cash_accounts(id),
  sent_from_session_id   uuid REFERENCES cash_closures(id),
  received_in_session_id uuid REFERENCES cash_closures(id),
  received_in_account_id uuid REFERENCES cash_accounts(id),
  return_in_session_id   uuid REFERENCES cash_closures(id),
  return_in_account_id   uuid REFERENCES cash_accounts(id),
  leg_out_payment_id     uuid,
  leg_in_payment_id      uuid,
  requested_by           uuid REFERENCES profiles(id),
  authorized_by          uuid REFERENCES profiles(id),
  delivered_by           uuid REFERENCES profiles(id),
  carrier_user_id        uuid REFERENCES profiles(id),
  received_by            uuid REFERENCES profiles(id),
  idempotency_key        text UNIQUE,
  request_fingerprint    text,  -- huella de parámetros de la solicitud (D.22, idempotencia)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Extremos XOR por lado (D.18.1):
  CONSTRAINT ctr_extremes_origin CHECK (num_nonnulls(from_register_id, from_account_id) = 1),
  CONSTRAINT ctr_extremes_dest   CHECK (num_nonnulls(to_register_id, to_account_id) = 1)
);

CREATE TABLE payment_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES stores(id),
  direction       text NOT NULL CHECK (direction IN ('in','out','refund')),
  payment_method  text NOT NULL,
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  currency        text NOT NULL,
  exchange_rate   numeric(20,8) NOT NULL DEFAULT 1,   -- D.18.2: conversión a CUP
  at              timestamptz NOT NULL DEFAULT now(), -- corresponde a payment_date en producción
  ref_type        text NOT NULL,
  ref_id          uuid,
  transaction_id  uuid,
  cash_closure_id uuid REFERENCES cash_closures(id),
  cash_account_id uuid REFERENCES cash_accounts(id),
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Titular único: sesión XOR cuenta (D.16.7); filas físicas en efectivo EXIGEN titular:
  CONSTRAINT pt_holder_xor CHECK (num_nonnulls(cash_closure_id, cash_account_id) <= 1),
  CONSTRAINT pt_holder_required_physical
    CHECK (payment_method <> 'cash' OR num_nonnulls(cash_closure_id, cash_account_id) = 1)
);

-- Las piernas registradas en la transferencia apuntan a filas reales del ledger:
ALTER TABLE cash_transfers
  ADD CONSTRAINT ctr_leg_out_fk FOREIGN KEY (leg_out_payment_id) REFERENCES payment_transactions(id),
  ADD CONSTRAINT ctr_leg_in_fk  FOREIGN KEY (leg_in_payment_id)  REFERENCES payment_transactions(id);

CREATE TABLE cash_transfer_custody_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id               uuid NOT NULL REFERENCES cash_transfers(id),
  event_seq                 int  NOT NULL CHECK (event_seq >= 1),
  previous_event_id         uuid REFERENCES cash_transfer_custody_events(id),
  previous_custodian_user_id uuid REFERENCES profiles(id),
  new_custodian_user_id     uuid NOT NULL REFERENCES profiles(id),
  changed_by                uuid NOT NULL REFERENCES profiles(id),
  authorized_by             uuid REFERENCES profiles(id),
  reason                    text NOT NULL,
  close_event               boolean NOT NULL DEFAULT false,  -- D.23.2: evento de CIERRE
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ctr_custody_id_per_transfer UNIQUE (transfer_id, id),
  CONSTRAINT uq_ctr_custody_seq             UNIQUE (transfer_id, event_seq),
  CONSTRAINT ctr_custody_chain CHECK (
    (event_seq = 1  AND previous_event_id IS NULL) OR
    (event_seq > 1  AND previous_event_id IS NOT NULL))
);
-- D.23.2: UN solo evento de cierre por transferencia (índice único parcial).
CREATE UNIQUE INDEX uq_ctr_custody_close_once
  ON cash_transfer_custody_events (transfer_id) WHERE close_event;

-- D.23.3 (misión 010): ASIGNACIÓN AUTORIZADA de transportista por traspaso.
-- La entrega por un actor distinto del titular exige una fila previa aquí,
-- registrada por un autorizador distinto del transportista (anti-autoasignación).
CREATE TABLE cash_transfer_carriers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id    uuid NOT NULL REFERENCES cash_transfers(id),
  carrier_user_id uuid NOT NULL REFERENCES profiles(id),
  assigned_by    uuid NOT NULL REFERENCES profiles(id),
  authorized_by  uuid NOT NULL REFERENCES profiles(id),
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_carrier_per_transfer UNIQUE (transfer_id, carrier_user_id),
  CONSTRAINT ctr_carrier_no_self CHECK (assigned_by <> carrier_user_id)
);
