-- ============================================================================
-- Migration: 20260810000001_v2_19_1_document_sequences.sql
-- Iteración Fiscal — Fix F-C1 (numeración secuencial)
-- ============================================================================
-- Tabla document_sequences + RPC next_document_number.
-- Aclaración 1: CHECK incluye ('invoice', 'credit_note', 'quotation', 'z_report') desde el inicio.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('invoice', 'credit_note', 'quotation', 'z_report')),
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_sequences_store_type_year_idx
  ON public.document_sequences (store_id, document_type, year);

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_sequences_select_admin" ON public.document_sequences;
CREATE POLICY "document_sequences_select_admin" ON public.document_sequences
  FOR SELECT TO authenticated USING (public.is_admin() OR public.has_store_access(store_id));
-- INSERT/UPDATE solo via RPC (SECURITY DEFINER bypasses RLS)

DROP FUNCTION IF EXISTS public.next_document_number;

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_store_id uuid,
  p_document_type text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  -- SELECT FOR UPDATE para atomicidad
  SELECT last_number INTO v_last
    FROM public.document_sequences
    WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
    FOR UPDATE;

  IF v_last IS NULL THEN
    -- Primera vez: INSERT
    INSERT INTO public.document_sequences (store_id, document_type, year, last_number)
    VALUES (p_store_id, p_document_type, v_year, 1)
    ON CONFLICT (store_id, document_type, year) DO NOTHING
    RETURNING last_number INTO v_next;

    -- Si ON CONFLICT disparó (race condition), re-select
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
    -- Ya existe: incrementar
    v_next := v_last + 1;
    UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
      WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
  END IF;

  v_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'FAC'
    WHEN 'credit_note' THEN 'NC'
    WHEN 'quotation' THEN 'COT'
    WHEN 'z_report' THEN 'ZR'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.next_document_number FROM anon;
GRANT EXECUTE ON FUNCTION public.next_document_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number TO service_role;

COMMENT ON FUNCTION public.next_document_number IS
  'Iteración Fiscal (F-C1): Generates sequential document number per store+type+year. Atomic via SELECT FOR UPDATE. Format: FAC-000001-2026.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.next_document_number;
-- DROP TABLE IF EXISTS public.document_sequences CASCADE;
-- ============================================================================
