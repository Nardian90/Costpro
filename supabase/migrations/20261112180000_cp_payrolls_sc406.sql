-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN B — MÓDULO «NÓMINAS DE SALARIO» (MODELO SC-4-06 · Res. 13/2007 MFP)
-- ═══════════════════════════════════════════════════════════════════════════
-- Resolución No. 13/2007 del Ministerio de Finanzas y Precios (Subsistema de
-- Nóminas, Anexo SC-4-06 «NÓMINA»), verificada contra la Gaceta Oficial
-- (cibercuba.com/gacetaoficial + finanzasaldia.interaudit.cu, 2026-11-12).
--
-- DATOS DE USO OBLIGATORIO DEL SC-4-06 (Res. 13/2007) → implementación:
--   1. Nombre y código de la entidad
--        → payrolls.entidad_nombre (snapshot de stores.name) y
--          entidad_codigo (snapshot reeup→nit, patrón SC-2-07). Resueltos
--          SIEMPRE servidor (trust boundary).
--   2. Número y fecha del cheque nominativo de extracción del efectivo;
--      modalidad de pago
--        → payrolls.cheque_number/cheque_date (opcionales: coherente cuando
--          NO corresponda extracción) + payment_method ('efectivo'|'tarjeta').
--          Con pago por tarjetas magnéticas NO aparece firma de recepción
--          (regla del modelo — aplicada en el documento/PDF).
--   3. Tipo de Nómina codificado
--        → payrolls.tipo_nomina CHECK (sueldos|jornales|vacaciones|licencias|
--          subsidios|movilizados|otros) — sin códigos arbitrarios.
--   4. Número de la Nómina (y de cada hoja)
--        → payrolls.payroll_number (NOM-NNNNNN-AAAA vía document_sequences
--          tipo 'payroll', patrón material_requests); la hoja la numera el
--          documento impreso («Hoja X de Y»).
--   5. Período (desde/hasta)
--        → period_start/period_end DATE NOT NULL, CHECK start <= end,
--          validadas servidor (no futuro, no > 6 meses atrás).
--   6. Número del Expediente Laboral; Nombres y apellidos; Categoría
--      ocupacional; Salario Básico horario o diario; Horas regulares o días
--      devengados; Horas extras; Conceptos que completan el salario; Importe
--      del salario laboral devengado; Otros importes (sigla+importe);
--      Obligaciones estatales sociales; Total devengado; Deducciones;
--      Neto a cobrar; Acumulación de vacaciones (días e importe); Firma de
--      recepción
--        → workers (perfil extendido) + worker_salary_rates (tarifa con
--          historial de vigencia) + payrolls / payroll_items (con SNAPSHOT de
--          identidad y tarifa: una modificación posterior del trabajador JAMÁS
--          altera una nómina histórica) + payroll_item_concepts (4 clases:
--          complemento / otro_haber / obligacion_social / deduccion, con
--          sigla+descripción+importe). Importes calculados en el SERVIDOR
--          (única fuente de verdad), almacenados por fila y por documento.
--   7. Reintegro al Banco (salarios indebidos y no reclamados)
--        → payrolls.reintegro_number/reintegro_date (opcionales).
--   8. Firmas: elabora / revisa y aprueba / contabiliza
--        → created_by (elabora) + reviewed_by/at (confirmación) +
--          accounted_by/at (RPC account_payroll). Identidad histórica
--          preservada (uuid persistente aunque cambien permisos/usuarios).
--
-- REGLAS DE CÁLCULO (brief §6.2/§6.5 — sin inventar coeficientes legales):
--   · base_salary = tiempo regular × tarifa vigente (horaria: horas × tarifa;
--     diaria: días × tarifa) — SERVIDOR.
--   · Horas extras: importe introducido por el usuario conforme a los
--     factores/tarifas CONFIGURADOS por la entidad (la Res. 13/2007 no fija
--     coeficientes en el modelo; COSTPRO no los hard-codea). El servidor
--     valida coherencia básica (amount > 0 → hours > 0) y no-negatividad.
--   · Deducciones y haberes: conceptos con sigla/descripción/importe
--     validados (amount >= 0, neto >= 0 — ERR_NEGATIVE_NET).
--   · Acumulación de vacaciones: informativa, FUERA del devengado (evita
--     sumas dobles, conforme al modelo).
--   · Precisión: numeric exacto; escalas 2 decimales en importes (14,2) y
--     horas/días (10,2). Sin redondeos intermedios arbitrarios.
--
-- CICLO DOCUMENTAL (patrón Ajustes Documentales / SC-2-07):
--   draft → confirmed (confirm_payroll, firma revisa-aprueba) → paid
--   (mark_payroll_paid) · voided desde draft|confirmed (void_payroll, motivo
--   OBLIGATORIO). Contabilización: account_payroll marca firma sin cambio de
--   estado (solo desde confirmed). Jamás borrado físico. audit_logs en cada
--   transición. Protección: totales recalculados y validados al confirmar
--   (ERR_INCONSISTENT_TOTALS) + lock FOR UPDATE (concurrencia).
--
-- MULTITIENDA: payrolls/items/concepts/rates con store_id + RLS FORCED
--   (patrón material_requests/issue_slips: store_id = ANY(current_user_
--   store_ids())); workers de la tienda activa y activos (elegibilidad);
--   escrituras SOLO vía RPC SECURITY DEFINER con has_store_access_as. Las
--   tarifas y nóminas son información PROPIA de cada tienda (nada en tablas
--   compartidas del Catálogo Maestro).
--
-- IDEMPOTENCIA: re-ejecutable (IF NOT EXISTS / OR REPLACE / guards).
-- REVERSIBILIDAD: DROP TABLE payrolls/payroll_items/payroll_item_concepts/
--   worker_salary_rates; ALTER TABLE workers DROP COLUMN expediente_laboral/
--   categoria_ocupacional/cargo/area_trabajo; restaurar document_sequences
--   CHECK y next_document_number desde 20261108201000; quitar 'payroll' del
--   CASE de prefijos.
-- DESPLIEGUE: NO aplicar a producción sin autorización expresa del
--   propietario (protocolo de la misión).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. PERFIL DEL TRABAJADOR — extensión coherente (la tabla workers nunca
--    fue alterada; columnas aditivas todas opcionales para no romper datos)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS expediente_laboral text,
  ADD COLUMN IF NOT EXISTS categoria_ocupacional text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS area_trabajo text;

COMMENT ON COLUMN public.workers.expediente_laboral IS
  'SC-4-06 dato 6: número del Expediente Laboral del trabajador (identificador laboral, opcional en el perfil; único por tienda cuando informado).';
COMMENT ON COLUMN public.workers.categoria_ocupacional IS
  'SC-4-06: categoría ocupacional del trabajador (texto libre de la entidad).';
COMMENT ON COLUMN public.workers.cargo IS 'Cargo del trabajador (texto libre de la entidad).';
COMMENT ON COLUMN public.workers.area_trabajo IS 'Área de trabajo del trabajador (texto libre de la entidad).';

CREATE UNIQUE INDEX IF NOT EXISTS workers_store_expediente_unique
  ON public.workers (store_id, expediente_laboral)
  WHERE expediente_laboral IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. TARIFA SALARIAL CON HISTORIAL DE VIGENCIA (worker_salary_rates)
--    La tarifa NO es una comisión: vive aparte del motor de comisiones.
--    Vigente en fecha d: valid_from <= d AND (valid_to IS NULL OR d <= valid_to).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_salary_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  store_id uuid NOT NULL,
  tenant_id uuid,
  rate_type text NOT NULL
    CONSTRAINT worker_salary_rates_type_check CHECK (rate_type = ANY (ARRAY['hourly'::text, 'daily'::text])),
  rate_amount numeric(12,2) NOT NULL
    CONSTRAINT worker_salary_rates_amount_check CHECK (rate_amount > 0::numeric),
  currency text NOT NULL DEFAULT 'CUP'::text
    CONSTRAINT worker_salary_rates_currency_check CHECK (currency = ANY (ARRAY['CUP'::text, 'USD'::text, 'EUR'::text, 'MLC'::text])),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_salary_rates_pkey PRIMARY KEY (id),
  CONSTRAINT worker_salary_rates_worker_fkey FOREIGN KEY (worker_id)
    REFERENCES public.workers (id) ON DELETE CASCADE,
  CONSTRAINT worker_salary_rates_store_fkey FOREIGN KEY (store_id)
    REFERENCES public.stores (id) ON DELETE CASCADE,
  CONSTRAINT worker_salary_rates_period_check CHECK (valid_to IS NULL OR valid_from <= valid_to)
);
CREATE INDEX IF NOT EXISTS idx_worker_salary_rates_worker
  ON public.worker_salary_rates (worker_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_worker_salary_rates_store
  ON public.worker_salary_rates (store_id);

ALTER TABLE public.worker_salary_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_salary_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS worker_salary_rates_store_isolation ON public.worker_salary_rates;
CREATE POLICY worker_salary_rates_store_isolation ON public.worker_salary_rates
  FOR ALL TO authenticated
  USING (store_id = ANY (public.current_user_store_ids()))
  WITH CHECK (store_id = ANY (public.current_user_store_ids()));

REVOKE ALL ON public.worker_salary_rates FROM anon, authenticated;
GRANT SELECT ON public.worker_salary_rates TO authenticated;
GRANT ALL ON public.worker_salary_rates TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. DOCUMENTO SC-4-06 — encabezado (payrolls) + líneas (payroll_items) +
--    conceptos por línea (payroll_item_concepts, 4 clases del modelo)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payrolls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  tenant_id uuid,
  payroll_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text
    CONSTRAINT payrolls_status_check CHECK (status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'paid'::text, 'voided'::text])),
  tipo_nomina text NOT NULL
    CONSTRAINT payrolls_tipo_check CHECK (tipo_nomina = ANY (ARRAY['sueldos'::text, 'jornales'::text, 'vacaciones'::text, 'licencias'::text, 'subsidios'::text, 'movilizados'::text, 'otros'::text])),
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'CUP'::text
    CONSTRAINT payrolls_currency_check CHECK (currency = ANY (ARRAY['CUP'::text, 'USD'::text, 'EUR'::text, 'MLC'::text])),
  entidad_nombre text NOT NULL DEFAULT ''::text,
  entidad_codigo text,
  payment_method text NOT NULL DEFAULT 'efectivo'::text
    CONSTRAINT payrolls_payment_method_check CHECK (payment_method = ANY (ARRAY['efectivo'::text, 'tarjeta'::text])),
  cheque_number text,
  cheque_date date,
  reintegro_number text,
  reintegro_date date,
  notes text NOT NULL DEFAULT ''::text,
  -- Totales del documento (única fuente de verdad: SERVIDOR)
  total_workers integer NOT NULL DEFAULT 0,
  total_regular_hours numeric(12,2) NOT NULL DEFAULT 0::numeric,
  total_overtime_hours numeric(12,2) NOT NULL DEFAULT 0::numeric,
  total_accrued_days numeric(12,2) NOT NULL DEFAULT 0::numeric,
  total_base_salary numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_overtime numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_complementos numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_other_earnings numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_social_security numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_gross numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_net numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_vacation_days numeric(12,2) NOT NULL DEFAULT 0::numeric,
  total_vacation_amount numeric(14,2) NOT NULL DEFAULT 0::numeric,
  -- Responsables (identidad histórica del SC-4-06)
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  accounted_by uuid,
  accounted_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payrolls_pkey PRIMARY KEY (id),
  CONSTRAINT payrolls_period_check CHECK (period_start <= period_end),
  CONSTRAINT payrolls_store_fkey FOREIGN KEY (store_id)
    REFERENCES public.stores (id) ON DELETE CASCADE,
  CONSTRAINT payrolls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id),
  CONSTRAINT payrolls_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles (id),
  CONSTRAINT payrolls_accounted_by_fkey FOREIGN KEY (accounted_by) REFERENCES public.profiles (id),
  CONSTRAINT payrolls_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.profiles (id),
  CONSTRAINT payrolls_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.profiles (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payrolls_store_number
  ON public.payrolls (store_id, payroll_number);
CREATE INDEX IF NOT EXISTS idx_payrolls_store_created
  ON public.payrolls (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payrolls_store_status
  ON public.payrolls (store_id, status);
CREATE INDEX IF NOT EXISTS idx_payrolls_store_period
  ON public.payrolls (store_id, period_start DESC, period_end DESC);

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  -- Snapshot de identidad (una modificación posterior del trabajador no
  -- altera la nómina histórica — brief §6.5)
  expediente_laboral text NOT NULL DEFAULT ''::text,
  worker_names text NOT NULL,
  categoria_ocupacional text NOT NULL DEFAULT ''::text,
  cargo text NOT NULL DEFAULT ''::text,
  area_trabajo text NOT NULL DEFAULT ''::text,
  -- Snapshot de la tarifa aplicada (vigente al período)
  rate_type text
    CONSTRAINT payroll_items_rate_type_check CHECK (rate_type = ANY (ARRAY['hourly'::text, 'daily'::text])),
  rate_amount numeric(12,2),
  rate_currency text,
  -- Tiempo trabajado
  regular_hours numeric(10,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_regular_hours_check CHECK (regular_hours >= 0::numeric),
  accrued_days numeric(10,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_accrued_days_check CHECK (accrued_days >= 0::numeric),
  overtime_hours numeric(10,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_overtime_hours_check CHECK (overtime_hours >= 0::numeric),
  overtime_amount numeric(14,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_overtime_amount_check CHECK (overtime_amount >= 0::numeric),
  -- Acumulación de vacaciones (informativa, FUERA del devengado — modelo)
  vacation_days numeric(10,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_vacation_days_check CHECK (vacation_days >= 0::numeric),
  vacation_amount numeric(14,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_vacation_amount_check CHECK (vacation_amount >= 0::numeric),
  -- Totales de fila (SERVIDOR)
  base_salary numeric(14,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_base_salary_check CHECK (base_salary >= 0::numeric),
  total_complementos numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_other_earnings numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_social_security numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_gross numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0::numeric,
  total_net numeric(14,2) NOT NULL DEFAULT 0::numeric
    CONSTRAINT payroll_items_total_net_check CHECK (total_net >= 0::numeric),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_items_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_items_payroll_fkey FOREIGN KEY (payroll_id)
    REFERENCES public.payrolls (id) ON DELETE CASCADE,
  CONSTRAINT payroll_items_worker_fkey FOREIGN KEY (worker_id)
    REFERENCES public.workers (id) ON DELETE RESTRICT,
  CONSTRAINT payroll_items_unique_worker UNIQUE (payroll_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON public.payroll_items (payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_worker ON public.payroll_items (worker_id);

CREATE TABLE IF NOT EXISTS public.payroll_item_concepts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  kind text NOT NULL
    CONSTRAINT payroll_item_concepts_kind_check
    CHECK (kind = ANY (ARRAY['complemento'::text, 'otro_haber'::text, 'obligacion_social'::text, 'deduccion'::text])),
  sigla text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  amount numeric(12,2) NOT NULL
    CONSTRAINT payroll_item_concepts_amount_check CHECK (amount >= 0::numeric),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_item_concepts_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_item_concepts_item_fkey FOREIGN KEY (item_id)
    REFERENCES public.payroll_items (id) ON DELETE CASCADE,
  CONSTRAINT payroll_item_concepts_unique_sigla UNIQUE (item_id, sigla)
);
CREATE INDEX IF NOT EXISTS idx_payroll_item_concepts_item ON public.payroll_item_concepts (item_id);

-- RLS — aislamiento multitienda (patrón material_requests: FORCED)
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_item_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_item_concepts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payrolls_store_isolation ON public.payrolls;
CREATE POLICY payrolls_store_isolation ON public.payrolls
  FOR ALL TO authenticated
  USING (store_id = ANY (public.current_user_store_ids()))
  WITH CHECK (store_id = ANY (public.current_user_store_ids()));

DROP POLICY IF EXISTS payroll_items_store_isolation ON public.payroll_items;
CREATE POLICY payroll_items_store_isolation ON public.payroll_items
  FOR ALL TO authenticated
  USING (payroll_id IN (SELECT id FROM public.payrolls
        WHERE store_id = ANY (public.current_user_store_ids())))
  WITH CHECK (payroll_id IN (SELECT id FROM public.payrolls
        WHERE store_id = ANY (public.current_user_store_ids())));

DROP POLICY IF EXISTS payroll_item_concepts_store_isolation ON public.payroll_item_concepts;
CREATE POLICY payroll_item_concepts_store_isolation ON public.payroll_item_concepts
  FOR ALL TO authenticated
  USING (item_id IN (SELECT i.id FROM public.payroll_items i
        JOIN public.payrolls p ON p.id = i.payroll_id
        WHERE p.store_id = ANY (public.current_user_store_ids())))
  WITH CHECK (item_id IN (SELECT i.id FROM public.payroll_items i
        JOIN public.payrolls p ON p.id = i.payroll_id
        WHERE p.store_id = ANY (public.current_user_store_ids())));

REVOKE ALL ON public.payrolls FROM anon, authenticated;
GRANT SELECT ON public.payrolls TO authenticated;
GRANT ALL ON public.payrolls TO service_role;
REVOKE ALL ON public.payroll_items FROM anon, authenticated;
GRANT SELECT ON public.payroll_items TO authenticated;
GRANT ALL ON public.payroll_items TO service_role;
REVOKE ALL ON public.payroll_item_concepts FROM anon, authenticated;
GRANT SELECT ON public.payroll_item_concepts TO authenticated;
GRANT ALL ON public.payroll_item_concepts TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. NUMERACIÓN — document_sequences + next_document_number con 'payroll'
--    (prefijo NOM → NOM-NNNNNN-AAAA; supersete estricto de los 8 tipos
--    vigentes: FAC/NC/COT/ZR/VS/IE/SM/ENT intactos)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.document_sequences DROP CONSTRAINT document_sequences_document_type_check;
ALTER TABLE public.document_sequences ADD CONSTRAINT document_sequences_document_type_check
  CHECK (document_type = ANY (ARRAY['invoice'::text, 'credit_note'::text, 'quotation'::text,
    'z_report'::text, 'vale_salida'::text, 'cash_flow'::text, 'material_request'::text,
    'entrada'::text, 'payroll'::text]));

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_store_id uuid,
  p_document_type text,
  p_user_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow', 'material_request', 'entrada', 'payroll') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  SELECT last_number INTO v_last
    FROM public.document_sequences
    WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
    FOR UPDATE;

  IF v_last IS NULL THEN
    INSERT INTO public.document_sequences (store_id, document_type, year, last_number)
    VALUES (p_store_id, p_document_type, v_year, 1)
    ON CONFLICT (store_id, document_type, year) DO NOTHING
    RETURNING last_number INTO v_next;

    IF v_next IS NULL THEN
      SELECT last_number INTO v_last
        FROM public.document_sequences
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
        FOR UPDATE;
      v_next := v_last + 1;
      UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
    END IF;
  ELSE
    v_next := v_last + 1;
    UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
      WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
  END IF;

  v_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'FAC'
    WHEN 'credit_note' THEN 'NC'
    WHEN 'quotation' THEN 'COT'
    WHEN 'z_report' THEN 'ZR'
    WHEN 'vale_salida' THEN 'VS'
    WHEN 'cash_flow' THEN 'IE'
    WHEN 'material_request' THEN 'SM'
    WHEN 'entrada' THEN 'ENT'
    WHEN 'payroll' THEN 'NOM'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC set_worker_salary_rate — tarifa nueva con cierre de la vigencia
--    anterior (historial íntegro, sin solapes)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_worker_salary_rate(
  p_worker_id uuid,
  p_rate_type text,
  p_rate_amount numeric,
  p_currency text DEFAULT 'CUP',
  p_valid_from date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_worker public.workers%ROWTYPE;
  v_rate_id uuid := gen_random_uuid();
  v_valid_from date := COALESCE(p_valid_from, CURRENT_DATE);
  v_open public.worker_salary_rates%ROWTYPE;
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_WORKER_NOT_FOUND: %', p_worker_id;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_worker.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_rate_type NOT IN ('hourly', 'daily') THEN
    RAISE EXCEPTION 'ERR_INVALID_RATE_TYPE';
  END IF;
  IF p_rate_amount IS NULL OR p_rate_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_RATE_AMOUNT';
  END IF;
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY';
  END IF;
  -- NOTA: la vigencia de una tarifa PUEDE programarse a futuro (aumento
  -- anunciado); la regla de no-futuro del repo aplica a los DOCUMENTOS
  -- (nóminas/ajustes), no a la vigencia de tarifas.

  -- Cerrar la vigencia abierta actual (sin solapes): la tarifa anterior
  -- vige hasta v_valid_from - 1. Si la nueva fecha no avanza sobre la
  -- abierta → solape → error controlado.
  SELECT * INTO v_open FROM public.worker_salary_rates
   WHERE worker_id = p_worker_id AND valid_to IS NULL
   ORDER BY valid_from DESC LIMIT 1 FOR UPDATE;
  IF v_open.id IS NOT NULL THEN
    IF v_valid_from <= v_open.valid_from THEN
      RAISE EXCEPTION 'ERR_RATE_OVERLAP: existe una tarifa vigente desde % (use una fecha posterior)', v_open.valid_from;
    END IF;
    UPDATE public.worker_salary_rates
       SET valid_to = (v_valid_from - 1), updated_at = now()
     WHERE id = v_open.id;
  END IF;

  INSERT INTO public.worker_salary_rates
    (id, worker_id, store_id, tenant_id, rate_type, rate_amount, currency, valid_from, created_by)
  VALUES
    (v_rate_id, p_worker_id, v_worker.store_id, v_worker.tenant_id,
     p_rate_type, round(p_rate_amount, 2), p_currency, v_valid_from, v_caller_uid);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SET_WORKER_SALARY_RATE', 'worker_salary_rates', v_rate_id, v_worker.store_id, v_caller_uid,
    jsonb_build_object('worker_id', p_worker_id, 'rate_type', p_rate_type,
      'rate_amount', round(p_rate_amount, 2), 'currency', p_currency,
      'valid_from', v_valid_from, 'replaced_rate_id', v_open.id));

  RETURN jsonb_build_object('status', 'success', 'rate_id', v_rate_id,
    'worker_id', p_worker_id, 'rate_type', p_rate_type,
    'rate_amount', round(p_rate_amount, 2), 'currency', p_currency,
    'valid_from', v_valid_from);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Motor de validación/cálculo interno (helper reutilizado por create y
--    update; idempotente y transaccional por construcción)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_payroll_validate_items(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_concept jsonb;
  v_worker_id uuid;
  v_worker public.workers%ROWTYPE;
  v_rate public.worker_salary_rates%ROWTYPE;
  v_regular_hours numeric;
  v_accrued_days numeric;
  v_overtime_hours numeric;
  v_overtime_amount numeric;
  v_vacation_days numeric;
  v_vacation_amount numeric;
  v_base numeric;
  v_complementos numeric := 0;
  v_otros numeric := 0;
  v_social numeric := 0;
  v_deducciones numeric := 0;
  v_gross numeric;
  v_net numeric;
  v_sigla text;
  v_kind text;
  v_amount numeric;
  v_currency text;
  v_rows jsonb := '[]'::jsonb;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_totals jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_worker_id := (v_item->>'worker_id')::uuid;
    IF v_worker_id IS NULL THEN
      RAISE EXCEPTION 'ERR_INVALID_ITEM: worker_id requerido';
    END IF;
    IF v_worker_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'ERR_DUPLICATE_WORKER: % (un trabajador solo puede aparecer una vez en la nómina)', v_worker_id;
    END IF;
    v_seen := v_seen || v_worker_id;

    SELECT * INTO v_worker FROM public.workers
     WHERE id = v_worker_id AND store_id = p_store_id AND status = 'active';
    IF v_worker.id IS NULL THEN
      RAISE EXCEPTION 'ERR_WORKER_NOT_ELIGIBLE: % (debe pertenecer a la tienda y estar activo)', v_worker_id;
    END IF;

    -- Tarifa vigente al final del período (snapshot de la aplicable)
    SELECT * INTO v_rate FROM public.worker_salary_rates
     WHERE worker_id = v_worker_id
       AND valid_from <= p_period_end
       AND (valid_to IS NULL OR valid_to >= p_period_start)
     ORDER BY valid_from DESC LIMIT 1;
    IF v_rate.id IS NULL THEN
      RAISE EXCEPTION 'ERR_WORKER_WITHOUT_RATE: % (sin tarifa salarial vigente en el período)', v_worker_id;
    END IF;

    -- Moneda única por documento (modelo SC-4-06 monomoneda)
    IF v_currency IS NULL THEN
      v_currency := v_rate.currency;
    ELSIF v_rate.currency <> v_currency THEN
      RAISE EXCEPTION 'ERR_CURRENCY_MISMATCH: % (todas las tarifas del documento deben tener la misma moneda)', v_worker_id;
    END IF;

    v_regular_hours := COALESCE((v_item->>'regular_hours')::numeric, 0);
    v_accrued_days := COALESCE((v_item->>'accrued_days')::numeric, 0);
    v_overtime_hours := COALESCE((v_item->>'overtime_hours')::numeric, 0);
    v_overtime_amount := COALESCE((v_item->>'overtime_amount')::numeric, 0);
    v_vacation_days := COALESCE((v_item->>'vacation_days')::numeric, 0);
    v_vacation_amount := COALESCE((v_item->>'vacation_amount')::numeric, 0);

    IF v_regular_hours < 0 OR v_accrued_days < 0 OR v_overtime_hours < 0 OR v_overtime_amount < 0
       OR v_vacation_days < 0 OR v_vacation_amount < 0 THEN
      RAISE EXCEPTION 'ERR_NEGATIVE_VALUE: horas/días/importes no negativos';
    END IF;

    -- Coherencia tiempo↔tarifa: horaria usa horas; diaria usa días.
    IF v_rate.rate_type = 'hourly' AND v_accrued_days <> 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_TIME: tarifa horaria → usar regular_hours (días informados: %)', v_accrued_days;
    END IF;
    IF v_rate.rate_type = 'daily' AND v_regular_hours <> 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_TIME: tarifa diaria → usar accrued_days (horas informadas: %)', v_regular_hours;
    END IF;
    IF v_overtime_amount > 0 AND v_overtime_hours <= 0 THEN
      RAISE EXCEPTION 'ERR_OVERTIME_WITHOUT_HOURS: importe de horas extras sin horas devengadas';
    END IF;

    -- Conceptos (4 clases del modelo SC-4-06)
    v_complementos := 0; v_otros := 0; v_social := 0; v_deducciones := 0;
    IF v_item ? 'concepts' AND jsonb_typeof(v_item->'concepts') = 'array' THEN
      FOR v_concept IN SELECT * FROM jsonb_array_elements(v_item->'concepts') LOOP
        v_kind := v_concept->>'kind';
        v_sigla := btrim(COALESCE(v_concept->>'sigla', ''));
        v_amount := COALESCE((v_concept->>'amount')::numeric, 0);
        IF v_kind NOT IN ('complemento', 'otro_haber', 'obligacion_social', 'deduccion') THEN
          RAISE EXCEPTION 'ERR_INVALID_CONCEPT_KIND: %', v_kind;
        END IF;
        IF v_sigla = '' OR length(v_sigla) > 12 THEN
          RAISE EXCEPTION 'ERR_INVALID_CONCEPT_SIGLA: sigla requerida (máx. 12)';
        END IF;
        IF v_amount IS NULL OR v_amount < 0 THEN
          RAISE EXCEPTION 'ERR_INVALID_CONCEPT_AMOUNT: % (no negativo)', v_sigla;
        END IF;
        IF v_kind = 'complemento' THEN v_complementos := v_complementos + v_amount;
        ELSIF v_kind = 'otro_haber' THEN v_otros := v_otros + v_amount;
        ELSIF v_kind = 'obligacion_social' THEN v_social := v_social + v_amount;
        ELSE v_deducciones := v_deducciones + v_amount;
        END IF;
      END LOOP;
    END IF;

    -- Cálculo del salario básico devengado (SERVIDOR = única fuente de verdad)
    v_base := CASE v_rate.rate_type
      WHEN 'hourly' THEN round(v_regular_hours * v_rate.rate_amount, 2)
      WHEN 'daily' THEN round(v_accrued_days * v_rate.rate_amount, 2)
    END;
    v_gross := round(v_base + v_overtime_amount + v_complementos + v_otros + v_social, 2);
    v_net := round(v_gross - v_deducciones, 2);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'ERR_NEGATIVE_NET: % (neto a cobrar negativo no autorizado)', v_worker_id;
    END IF;

    v_rows := v_rows || jsonb_build_object(
      'worker_id', v_worker_id,
      'expediente_laboral', COALESCE(v_worker.expediente_laboral, ''),
      'worker_names', btrim(v_worker.first_name || ' ' || v_worker.last_name),
      'categoria_ocupacional', COALESCE(v_worker.categoria_ocupacional, ''),
      'cargo', COALESCE(v_worker.cargo, ''),
      'area_trabajo', COALESCE(v_worker.area_trabajo, ''),
      'rate_type', v_rate.rate_type,
      'rate_amount', v_rate.rate_amount,
      'rate_currency', v_rate.currency,
      'regular_hours', v_regular_hours,
      'accrued_days', v_accrued_days,
      'overtime_hours', v_overtime_hours,
      'overtime_amount', round(v_overtime_amount, 2),
      'vacation_days', v_vacation_days,
      'vacation_amount', round(v_vacation_amount, 2),
      'base_salary', v_base,
      'total_complementos', round(v_complementos, 2),
      'total_other_earnings', round(v_otros, 2),
      'total_social_security', round(v_social, 2),
      'total_deductions', round(v_deducciones, 2),
      'total_gross', v_gross,
      'total_net', v_net,
      'concepts', COALESCE(v_item->'concepts', '[]'::jsonb)
    );
  END LOOP;

  SELECT jsonb_build_object(
    'total_workers', jsonb_array_length(v_rows),
    'total_regular_hours', round(COALESCE(sum((e->>'regular_hours')::numeric), 0), 2),
    'total_overtime_hours', round(COALESCE(sum((e->>'overtime_hours')::numeric), 0), 2),
    'total_accrued_days', round(COALESCE(sum((e->>'accrued_days')::numeric), 0), 2),
    'total_base_salary', round(COALESCE(sum((e->>'base_salary')::numeric), 0), 2),
    'total_overtime', round(COALESCE(sum((e->>'overtime_amount')::numeric), 0), 2),
    'total_complementos', round(COALESCE(sum((e->>'total_complementos')::numeric), 0), 2),
    'total_other_earnings', round(COALESCE(sum((e->>'total_other_earnings')::numeric), 0), 2),
    'total_social_security', round(COALESCE(sum((e->>'total_social_security')::numeric), 0), 2),
    'total_gross', round(COALESCE(sum((e->>'total_gross')::numeric), 0), 2),
    'total_deductions', round(COALESCE(sum((e->>'total_deductions')::numeric), 0), 2),
    'total_net', round(COALESCE(sum((e->>'total_net')::numeric), 0), 2),
    'total_vacation_days', round(COALESCE(sum((e->>'vacation_days')::numeric), 0), 2),
    'total_vacation_amount', round(COALESCE(sum((e->>'vacation_amount')::numeric), 0), 2)
  ) INTO v_totals
  FROM jsonb_array_elements(v_rows) e;

  RETURN jsonb_build_object('items', v_rows, 'totals', v_totals);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RPC create_payroll — crea la Nómina en BORRADOR (numerada, con
--    snapshots, totales servidor, idempotente)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_payroll(
  p_store_id uuid,
  p_tipo_nomina text,
  p_period_start date,
  p_period_end date,
  p_payment_method text DEFAULT 'efectivo',
  p_cheque_number text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL,
  p_reintegro_number text DEFAULT NULL,
  p_reintegro_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_payroll_id uuid := gen_random_uuid();
  v_payroll_number text;
  v_currency text;
  v_entidad_nombre text;
  v_entidad_codigo text;
  v_reeup text;
  v_nit text;
  v_tenant uuid;
  v_validated jsonb;
  v_row jsonb;
  v_item_id uuid;
  v_concept jsonb;
  v_param_hash text;
  v_existing jsonb;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_tipo_nomina NOT IN ('sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros') THEN
    RAISE EXCEPTION 'ERR_INVALID_TIPO_NOMINA: %', p_tipo_nomina;
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'ERR_INVALID_PERIOD: la fecha inicial no puede ser posterior a la final';
  END IF;
  IF p_period_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT';
  END IF;
  IF p_period_start < (CURRENT_DATE - INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD';
  END IF;

  -- Entidad: nombre y código resueltos SIEMPRE servidor (datos 1 del modelo)
  SELECT s.name, s.reeup, s.nit, s.tenant_id
    INTO v_entidad_nombre, v_reeup, v_nit, v_tenant
    FROM public.stores s WHERE s.id = p_store_id;
  IF v_entidad_nombre IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND';
  END IF;
  v_entidad_codigo := COALESCE(NULLIF(btrim(COALESCE(v_reeup, '')), ''),
                               NULLIF(btrim(COALESCE(v_nit, '')), ''));

  -- Validar y calcular (motor interno; período como parámetros explícitos)
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;
  v_validated := public.fn_payroll_validate_items(p_store_id, p_period_start, p_period_end, p_items);
  v_currency := ((v_validated->'items'->0)->>'rate_currency');

  -- Idempotencia (misma infraestructura que create_vale_salida)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    v_param_hash := md5(p_store_id::text || '|' || p_tipo_nomina || '|' ||
      p_period_start::text || '|' || p_period_end::text || '|' ||
      COALESCE(p_payment_method, '') || '|' || COALESCE(p_cheque_number, '') || '|' ||
      COALESCE(p_items::text, ''));
    v_existing := public.check_idempotency(p_idempotency_key, 'payroll', v_payroll_id, v_param_hash);
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
  v_payroll_number := public.next_document_number(p_store_id, 'payroll', v_caller_uid);

  INSERT INTO public.payrolls (
    id, store_id, tenant_id, payroll_number, status, tipo_nomina,
    period_start, period_end, currency,
    entidad_nombre, entidad_codigo,
    payment_method, cheque_number, cheque_date, reintegro_number, reintegro_date,
    notes,
    total_workers, total_regular_hours, total_overtime_hours, total_accrued_days,
    total_base_salary, total_overtime, total_complementos, total_other_earnings,
    total_social_security, total_gross, total_deductions, total_net,
    total_vacation_days, total_vacation_amount,
    created_by
  ) VALUES (
    v_payroll_id, p_store_id, v_tenant, v_payroll_number, 'draft', p_tipo_nomina,
    p_period_start, p_period_end, COALESCE(v_currency, 'CUP'),
    v_entidad_nombre, v_entidad_codigo,
    p_payment_method, NULLIF(btrim(COALESCE(p_cheque_number, '')), ''), p_cheque_date,
    NULLIF(btrim(COALESCE(p_reintegro_number, '')), ''), p_reintegro_date,
    COALESCE(btrim(p_notes), ''),
    (v_validated->'totals'->>'total_workers')::int,
    (v_validated->'totals'->>'total_regular_hours')::numeric,
    (v_validated->'totals'->>'total_overtime_hours')::numeric,
    (v_validated->'totals'->>'total_accrued_days')::numeric,
    (v_validated->'totals'->>'total_base_salary')::numeric,
    (v_validated->'totals'->>'total_overtime')::numeric,
    (v_validated->'totals'->>'total_complementos')::numeric,
    (v_validated->'totals'->>'total_other_earnings')::numeric,
    (v_validated->'totals'->>'total_social_security')::numeric,
    (v_validated->'totals'->>'total_gross')::numeric,
    (v_validated->'totals'->>'total_deductions')::numeric,
    (v_validated->'totals'->>'total_net')::numeric,
    (v_validated->'totals'->>'total_vacation_days')::numeric,
    (v_validated->'totals'->>'total_vacation_amount')::numeric,
    v_caller_uid
  );

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_validated->'items') LOOP
    v_item_id := gen_random_uuid();
    INSERT INTO public.payroll_items (
      id, payroll_id, worker_id,
      expediente_laboral, worker_names, categoria_ocupacional, cargo, area_trabajo,
      rate_type, rate_amount, rate_currency,
      regular_hours, accrued_days, overtime_hours, overtime_amount,
      vacation_days, vacation_amount,
      base_salary, total_complementos, total_other_earnings, total_social_security,
      total_gross, total_deductions, total_net
    ) VALUES (
      v_item_id, v_payroll_id, (v_row->>'worker_id')::uuid,
      v_row->>'expediente_laboral', v_row->>'worker_names', v_row->>'categoria_ocupacional',
      v_row->>'cargo', v_row->>'area_trabajo',
      v_row->>'rate_type', (v_row->>'rate_amount')::numeric, v_row->>'rate_currency',
      (v_row->>'regular_hours')::numeric, (v_row->>'accrued_days')::numeric,
      (v_row->>'overtime_hours')::numeric, (v_row->>'overtime_amount')::numeric,
      (v_row->>'vacation_days')::numeric, (v_row->>'vacation_amount')::numeric,
      (v_row->>'base_salary')::numeric, (v_row->>'total_complementos')::numeric,
      (v_row->>'total_other_earnings')::numeric, (v_row->>'total_social_security')::numeric,
      (v_row->>'total_gross')::numeric, (v_row->>'total_deductions')::numeric,
      (v_row->>'total_net')::numeric
    );
    FOR v_concept IN SELECT * FROM jsonb_array_elements(COALESCE(v_row->'concepts', '[]'::jsonb)) LOOP
      INSERT INTO public.payroll_item_concepts (item_id, kind, sigla, description, amount)
      VALUES (v_item_id, v_concept->>'kind', btrim(v_concept->>'sigla'),
              COALESCE(btrim(v_concept->>'description'), ''),
              round(COALESCE((v_concept->>'amount')::numeric, 0), 2));
    END LOOP;
  END LOOP;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'payroll', v_payroll_id, v_param_hash,
      jsonb_build_object('status', 'success', 'payroll_id', v_payroll_id,
        'payroll_number', v_payroll_number));
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_PAYROLL', 'payrolls', v_payroll_id, p_store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_payroll_number, 'status', 'draft',
      'tipo_nomina', p_tipo_nomina, 'period_start', p_period_start, 'period_end', p_period_end,
      'payment_method', p_payment_method, 'total_net', (v_validated->'totals'->>'total_net')::numeric,
      'normativa', 'Res. 13/2007 MFP — Modelo SC-4-06 Nómina'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', v_payroll_id,
    'payroll_number', v_payroll_number, 'totals', v_validated->'totals');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RPC update_payroll — SOLO borrador (reemplaza cabecera+líneas;
--    recalcula totales; conserva el número)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_payroll(
  p_payroll_id uuid,
  p_tipo_nomina text,
  p_period_start date,
  p_period_end date,
  p_payment_method text DEFAULT 'efectivo',
  p_cheque_number text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL,
  p_reintegro_number text DEFAULT NULL,
  p_reintegro_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
  v_validated jsonb;
  v_row jsonb;
  v_item_id uuid;
  v_concept jsonb;
  v_currency text;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo se pueden editar nóminas en borrador (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_tipo_nomina NOT IN ('sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros') THEN
    RAISE EXCEPTION 'ERR_INVALID_TIPO_NOMINA: %', p_tipo_nomina;
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'ERR_INVALID_PERIOD';
  END IF;
  IF p_period_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT';
  END IF;
  IF p_period_start < (CURRENT_DATE - INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  v_validated := public.fn_payroll_validate_items(v_pay.store_id, p_period_start, p_period_end, p_items);
  v_currency := ((v_validated->'items'->0)->>'rate_currency');

  UPDATE public.payrolls SET
    tipo_nomina = p_tipo_nomina,
    period_start = p_period_start,
    period_end = p_period_end,
    currency = COALESCE(v_currency, 'CUP'),
    payment_method = p_payment_method,
    cheque_number = NULLIF(btrim(COALESCE(p_cheque_number, '')), ''),
    cheque_date = p_cheque_date,
    reintegro_number = NULLIF(btrim(COALESCE(p_reintegro_number, '')), ''),
    reintegro_date = p_reintegro_date,
    notes = COALESCE(btrim(p_notes), ''),
    total_workers = (v_validated->'totals'->>'total_workers')::int,
    total_regular_hours = (v_validated->'totals'->>'total_regular_hours')::numeric,
    total_overtime_hours = (v_validated->'totals'->>'total_overtime_hours')::numeric,
    total_accrued_days = (v_validated->'totals'->>'total_accrued_days')::numeric,
    total_base_salary = (v_validated->'totals'->>'total_base_salary')::numeric,
    total_overtime = (v_validated->'totals'->>'total_overtime')::numeric,
    total_complementos = (v_validated->'totals'->>'total_complementos')::numeric,
    total_other_earnings = (v_validated->'totals'->>'total_other_earnings')::numeric,
    total_social_security = (v_validated->'totals'->>'total_social_security')::numeric,
    total_gross = (v_validated->'totals'->>'total_gross')::numeric,
    total_deductions = (v_validated->'totals'->>'total_deductions')::numeric,
    total_net = (v_validated->'totals'->>'total_net')::numeric,
    total_vacation_days = (v_validated->'totals'->>'total_vacation_days')::numeric,
    total_vacation_amount = (v_validated->'totals'->>'total_vacation_amount')::numeric,
    updated_at = now()
  WHERE id = p_payroll_id;

  -- Reemplazo transaccional de líneas
  DELETE FROM public.payroll_items WHERE payroll_id = p_payroll_id;
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_validated->'items') LOOP
    v_item_id := gen_random_uuid();
    INSERT INTO public.payroll_items (
      id, payroll_id, worker_id,
      expediente_laboral, worker_names, categoria_ocupacional, cargo, area_trabajo,
      rate_type, rate_amount, rate_currency,
      regular_hours, accrued_days, overtime_hours, overtime_amount,
      vacation_days, vacation_amount,
      base_salary, total_complementos, total_other_earnings, total_social_security,
      total_gross, total_deductions, total_net
    ) VALUES (
      v_item_id, p_payroll_id, (v_row->>'worker_id')::uuid,
      v_row->>'expediente_laboral', v_row->>'worker_names', v_row->>'categoria_ocupacional',
      v_row->>'cargo', v_row->>'area_trabajo',
      v_row->>'rate_type', (v_row->>'rate_amount')::numeric, v_row->>'rate_currency',
      (v_row->>'regular_hours')::numeric, (v_row->>'accrued_days')::numeric,
      (v_row->>'overtime_hours')::numeric, (v_row->>'overtime_amount')::numeric,
      (v_row->>'vacation_days')::numeric, (v_row->>'vacation_amount')::numeric,
      (v_row->>'base_salary')::numeric, (v_row->>'total_complementos')::numeric,
      (v_row->>'total_other_earnings')::numeric, (v_row->>'total_social_security')::numeric,
      (v_row->>'total_gross')::numeric, (v_row->>'total_deductions')::numeric,
      (v_row->>'total_net')::numeric
    );
    FOR v_concept IN SELECT * FROM jsonb_array_elements(COALESCE(v_row->'concepts', '[]'::jsonb)) LOOP
      INSERT INTO public.payroll_item_concepts (item_id, kind, sigla, description, amount)
      VALUES (v_item_id, v_concept->>'kind', btrim(v_concept->>'sigla'),
              COALESCE(btrim(v_concept->>'description'), ''),
              round(COALESCE((v_concept->>'amount')::numeric, 0), 2));
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('UPDATE_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'status', 'draft',
      'total_net', (v_validated->'totals'->>'total_net')::numeric));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'totals', v_validated->'totals');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. RPC confirm_payroll — BORRADOR → CONFIRMADA (firma revisa y aprueba;
--    recalcula totales desde la BD y valida consistencia — protección de
--    documento confirmado contra modificaciones silenciosas)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_payroll(
  p_payroll_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
  v_items_count integer;
  v_gross numeric := 0;
  v_ded numeric := 0;
  v_net numeric := 0;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo se pueden confirmar nóminas en borrador (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT count(*), COALESCE(sum(total_gross), 0), COALESCE(sum(total_deductions), 0),
         COALESCE(sum(total_net), 0)
    INTO v_items_count, v_gross, v_ded, v_net
    FROM public.payroll_items WHERE payroll_id = p_payroll_id;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;
  -- Consistencia de los totales almacenados (fuente de verdad: filas)
  IF round(v_gross, 2) <> round(v_pay.total_gross, 2)
     OR round(v_ded, 2) <> round(v_pay.total_deductions, 2)
     OR round(v_net, 2) <> round(v_pay.total_net, 2) THEN
    RAISE EXCEPTION 'ERR_INCONSISTENT_TOTALS: el documento no coincide con sus líneas (recalcule y guarde antes de confirmar)';
  END IF;

  UPDATE public.payrolls
     SET status = 'confirmed',
         reviewed_by = v_caller_uid,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CONFIRM_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'from', 'draft', 'to', 'confirmed',
      'total_net', v_net, 'firma', 'revisa y aprueba (SC-4-06)'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'to', 'confirmed',
    'reviewed_by', v_caller_uid);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. RPC account_payroll — firma de CONTABILIZA (solo confirmada;
--     sin cambio de estado; trazabilidad)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.account_payroll(
  p_payroll_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo se contabilizan nóminas confirmadas (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_pay.accounted_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_ACCOUNTED';
  END IF;

  UPDATE public.payrolls
     SET accounted_by = v_caller_uid, accounted_at = now(), updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ACCOUNT_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'firma', 'contabiliza (SC-4-06)'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'accounted_by', v_caller_uid);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 11. RPC mark_payroll_paid — CONFIRMADA → PAGADA (cuando corresponda)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(
  p_payroll_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo se marcan pagadas las nóminas confirmadas (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.payrolls
     SET status = 'paid', paid_by = v_caller_uid, paid_at = now(), updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('MARK_PAYROLL_PAID', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'from', 'confirmed', 'to', 'paid'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'to', 'paid');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 12. RPC void_payroll — BORRADOR|CONFIRMADA → ANULADA (motivo OBLIGATORIO;
--     jamás borrado físico; numeración e historial conservados)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_payroll(
  p_payroll_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
  v_items_count integer;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'ERR_NOT_VOIDABLE: solo se pueden anular nóminas en borrador o confirmadas (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_TOO_LONG';
  END IF;

  SELECT count(*) INTO v_items_count FROM public.payroll_items WHERE payroll_id = p_payroll_id;

  UPDATE public.payrolls
     SET status = 'voided',
         voided_at = now(), voided_by = v_caller_uid, void_reason = btrim(p_reason),
         updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'from', v_pay.status, 'to', 'voided',
      'reason', btrim(p_reason), 'items_count', v_items_count));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'to', 'voided');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 13. ACLs de las RPC (patrón sec_definer_hardening: sin EXECUTE para
--     PUBLIC/anon; el helper interno fn_payroll_validate_items queda solo
--     para service_role — invocado exclusivamente por las RPC gobernadas)
-- ─────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.set_worker_salary_rate(uuid, text, numeric, text, date, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_worker_salary_rate(uuid, text, numeric, text, date, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.fn_payroll_validate_items(uuid, date, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_payroll_validate_items(uuid, date, date, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_payroll(uuid, text, date, date, text, text, date, text, date, text, jsonb, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_payroll(uuid, text, date, date, text, text, date, text, date, text, jsonb, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_payroll(uuid, text, date, date, text, text, date, text, date, text, jsonb, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_payroll(uuid, text, date, date, text, text, date, text, date, text, jsonb, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_payroll(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_payroll(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.account_payroll(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.account_payroll(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_payroll_paid(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_payroll_paid(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.void_payroll(uuid, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.void_payroll(uuid, text, uuid) FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 14. Comentarios de trust boundary (documentación viva)
-- ─────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.create_payroll(uuid, text, date, date, text, text, date, text, date, text, jsonb, text, uuid) IS
'TRUST BOUNDARY: p_user_id DEBE venir del JWT (session.user.id), NUNCA del body. El cliente SOLO envía identificadores y cantidades (worker_id, horas/días, importes de extras/vacaciones y conceptos con sigla); nombres, categoría, cargo, área, expediente, tarifa vigente, moneda y entidad se resuelven SIEMPRE servidor con SNAPSHOT en las líneas. Modelo SC-4-06 «Nómina» (Res. 13/2007 MFP): datos de uso obligatorio cubiertos; crear → estado draft; totales calculados por el servidor (única fuente de verdad).';
COMMENT ON FUNCTION public.confirm_payroll(uuid, uuid) IS
'SC-4-06 firma «revisa y aprueba»: confirm_payroll valida consistencia totales↔líneas (ERR_INCONSISTENT_TOTALS), fija reviewed_by/at y pasa draft → confirmed. El documento confirmado queda protegido (update/void con guardas de estado).';
COMMENT ON FUNCTION public.account_payroll(uuid, uuid) IS
'SC-4-06 firma «contabiliza»: marca accounted_by/at sin cambio de estado (solo confirmed, idempotente ERR_ALREADY_ACCOUNTED). Identidad histórica preservada.';
COMMENT ON FUNCTION public.set_worker_salary_rate(uuid, text, numeric, text, date, uuid) IS
'Tarifa salarial del trabajador (NO comisión): horaria o diaria, con historial de vigencia (cierre de la abierta al insertar una nueva — ERR_RATE_OVERLAP). La nómina SNAPSHOT la tarifa vigente al período: una modificación posterior no altera nóminas históricas.';

-- ─────────────────────────────────────────────────────────────────────────
-- 15. Verificación post-migración fail-closed (patrón del repo)
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_PAYROLLS_SC406_GUARD$
DECLARE
  v_n integer;
  v_fn text;
  v_trg integer;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN
     ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CP-PAYROLLS-SC406-GUARD: faltan tablas del módulo (encontradas %)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_class c
   WHERE c.relnamespace='public'::regnamespace AND c.relname IN
     ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates')
     AND c.relrowsecurity;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CP-PAYROLLS-SC406-GUARD: RLS debe estar activo en las 4 tablas nuevas';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND policyname IN
     ('payrolls_store_isolation','payroll_items_store_isolation',
      'payroll_item_concepts_store_isolation','worker_salary_rates_store_isolation');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CP-PAYROLLS-SC406-GUARD: faltan políticas de aislamiento por tienda';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='next_document_number';
  IF v_fn NOT LIKE '%WHEN ''payroll'' THEN ''NOM''%' THEN
    RAISE EXCEPTION 'CP-PAYROLLS-SC406-GUARD: next_document_number sin el tipo payroll (NOM)';
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('create_payroll','update_payroll','confirm_payroll','account_payroll',
      'mark_payroll_paid','void_payroll','set_worker_salary_rate');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'CP-PAYROLLS-SC406-GUARD: faltan RPCs del documento (encontradas %)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='workers'
     AND column_name IN ('expediente_laboral','categoria_ocupacional','cargo','area_trabajo');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CP-PAYROLLS-SC406-GUARD: faltan columnas del perfil laboral de workers';
  END IF;

  RAISE NOTICE 'CP-PAYROLLS-SC406-GUARD OK: tablas+RLS+políticas+RPCs+numeración NOM+perfil laboral presentes';
END
$CP_PAYROLLS_SC406_GUARD$;
