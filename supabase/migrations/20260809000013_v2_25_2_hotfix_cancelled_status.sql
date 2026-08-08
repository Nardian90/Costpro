-- ══════════════════════════════════════════════════════════════════════
-- F-30 HOTFIX v2.25.2 — Add 'cancelled' to received_services_status_check
--
-- BUG: set_received_service_status allows draft→cancelled in the state machine,
--      but the CHECK constraint received_services_status_check only allows
--      ('active', 'voided', 'draft'). 'cancelled' is rejected with 23514.
-- Fix: DROP old CHECK + CREATE new CHECK that includes 'cancelled'.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.received_services
  DROP CONSTRAINT IF EXISTS received_services_status_check;

ALTER TABLE public.received_services
  ADD CONSTRAINT received_services_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'voided'::text, 'draft'::text, 'cancelled'::text]));
