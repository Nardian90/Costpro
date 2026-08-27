-- ============================================================================
-- 20260827000006_exchange_rates_manual_hardening.sql
-- FIX · F3-P1-01 — Pista de auditoría persistente para tasas manuales
-- ============================================================================
-- La ruta /api/exchange-rates/manual permite modificar la tasa global que
-- alimenta la conversión contable. A partir del FIX, la escritura queda
-- restringida a rol admin (DECISION-FX-01 en el código) y cada cambio se
-- registra aquí vía service-role.
--
-- Diseño RLS deliberado (anti-regresión F3-P0-01):
--   * RLS HABILITADO y sin NINGUNA política TO authenticated ⇒ DENY total
--     para clientes autenticados/anon (fail-closed).
--   * Solo service-role escribe/lee (rutas server + back-office interno).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exchange_rate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'manual_upsert',
  currency text NOT NULL,
  new_rate numeric NOT NULL,
  rate_date date NOT NULL,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice de consulta típica: historia por moneda y fecha
CREATE INDEX IF NOT EXISTS idx_exchange_rate_audit_currency_date
  ON public.exchange_rate_audit (currency, rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_audit_actor
  ON public.exchange_rate_audit (actor_id, created_at DESC);

-- Fail-closed: RLS on + cero políticas para authenticated/anon
ALTER TABLE public.exchange_rate_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_audit FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN:
--   SELECT count(*) FROM pg_policies WHERE tablename='exchange_rate_audit';
--   Esperado: 0 políticas (acceso solo vía service-role)
-- ============================================================================
