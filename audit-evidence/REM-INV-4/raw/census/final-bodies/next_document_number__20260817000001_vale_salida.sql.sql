-- DECLARED FINAL STATE (Git) de next_document_number
-- fuente: 20260817000001_vale_salida.sql stmt#48

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
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida') THEN
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
    WHEN 'vale_salida' THEN 'VS'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$
