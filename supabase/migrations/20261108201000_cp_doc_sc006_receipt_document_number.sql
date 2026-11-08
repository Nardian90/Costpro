-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-DOC-SC-DATA-MAPPING-006 · PARTE 2 — NÚMERO DOCUMENTAL DE ENTRADA
-- ═══════════════════════════════════════════════════════════════════════════
-- OBJETIVO: que el «DOCUMENTO QUE AMPARA LA RECEPCIÓN» del modelo SC-2-04
--   muestre el TIPO «Entrada» y el NÚMERO REAL del documento de entrada,
--   jamás el nombre del proveedor (defecto observado: reference_doc con el
--   nombre comercial) ni el ID interno uuid.
--
-- DISEÑO (auditoría §5):
--   * receipts no tenía ningún número documental del sistema: reference_doc
--     es el texto libre del usuario (nº de factura externa) y el id es un
--     uuid técnico. Se añade document_number (aditivo), generado con la
--     infraestructura EXISTENTE de numeración (document_sequences +
--     next_document_number, patrón de invoice/vale_salida/etc.), tipo nuevo
--     'entrada', prefijo ENT → formato ENT-000001-2026 por tienda y año.
--   * ASIGNACIÓN = trigger BEFORE INSERT OR UPDATE cuando la recepción pasa
--     a estado 'active' (registro transaccional register_reception O
--     confirmación de borrador): cubre ambos caminos sin alterar las RPCs
--     allowlisteadas. Las recepciones históricas NO se retro-numeran
--     (misión §11: no modificar documentos históricos); en el PDF quedan con
--     la línea de cumplimentación en blanco, conforme a la regla de la
--     misión «si no existe número documental real, conserva el campo vacío».
--   * CONCURRENCIA: next_document_number serializa con SELECT … FOR UPDATE
--     sobre document_sequences (v2_19_1) — dos recepciones simultáneas de la
--     misma tienda jamás comparten número. El índice único parcial añade la
--     garantía de integridad a nivel de fila.
--
-- IDEMPOTENCIA: re-ejecutable (IF NOT EXISTS / OR REPLACE / guardas IF).
-- REVERSIBILIDAD:
--   DROP TRIGGER IF EXISTS trg_receipts_assign_document_number ON public.receipts;
--   DROP FUNCTION IF EXISTS public.assign_receipt_document_number();
--   DROP INDEX IF EXISTS public.receipts_store_document_number_unique;
--   ALTER TABLE public.receipts DROP COLUMN IF EXISTS document_number;
--   (restaurar document_sequences_document_type_check y next_document_number
--    desde 20261031120000_res11_sc207_solicitud_materiales.sql)
-- DESPLIEGUE: NO aplicar a producción sin autorización expresa (misión §14).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columna nueva (aditiva) ──────────────────────────────────────────────
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS document_number text;
COMMENT ON COLUMN public.receipts.document_number IS
  'CP-DOC-SC-DATA-MAPPING-006: número documental real de la ENTRADA (formato ENT-NNNNNN-AAAA por tienda y año, vía document_sequences). Asignado por trg_receipts_assign_document_number al activarse. NULL en recepciones históricas (sin retro-numeración) → línea en blanco en SC-2-04. No es el uuid interno ni reference_doc (factura externa).';

-- ── 2. Tipo 'entrada' en la infraestructura de numeración (supersete) ──────
ALTER TABLE public.document_sequences DROP CONSTRAINT document_sequences_document_type_check;
ALTER TABLE public.document_sequences ADD CONSTRAINT document_sequences_document_type_check
  CHECK (document_type = ANY (ARRAY['invoice'::text, 'credit_note'::text, 'quotation'::text,
    'z_report'::text, 'vale_salida'::text, 'cash_flow'::text, 'material_request'::text,
    'entrada'::text]));

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
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow', 'material_request', 'entrada') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  -- SELECT FOR UPDATE para atomicidad (dos usuarios concurrentes jamás
  -- obtienen el mismo número: la serialización ocurre dentro de la transacción
  -- del RPC creador, que además toma advisory lock por tienda).
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
    WHEN 'cash_flow' THEN 'IE'
    WHEN 'material_request' THEN 'SM'
    WHEN 'entrada' THEN 'ENT'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$;

-- ── 3. Trigger de asignación (backend = base de datos) ─────────────────────
CREATE OR REPLACE FUNCTION public.assign_receipt_document_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Solo la ENTRADA ACTIVA es el documento que ampara y recibe número.
  -- Borradores (pending) y anulaciones (reversed/voided) no numeran.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  -- Ya tiene número (o se creó con uno explícito): se conserva intacto.
  IF NEW.document_number IS NOT NULL AND NEW.document_number <> '' THEN
    RETURN NEW;
  END IF;
  NEW.document_number := public.next_document_number(NEW.store_id, 'entrada', NEW.user_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_receipts_assign_document_number ON public.receipts;
CREATE TRIGGER trg_receipts_assign_document_number
  BEFORE INSERT OR UPDATE OF status, document_number ON public.receipts
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND (NEW.document_number IS NULL OR NEW.document_number = ''))
  EXECUTE FUNCTION public.assign_receipt_document_number();

-- ── 4. Integridad: sin duplicados por tienda ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS receipts_store_document_number_unique
  ON public.receipts (store_id, document_number)
  WHERE document_number IS NOT NULL AND document_number <> '';

-- ── 5. Validación (aborta si algo quedó inconsistente) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.receipts
     WHERE document_number IS NOT NULL AND document_number <> ''
     GROUP BY store_id, document_number HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'RECEIPT_DOCUMENT_NUMBER_DUPLICATES: números de entrada duplicados por tienda';
  END IF;
END;
$$;

-- NOTA: sin retro-numeración de recepciones históricas. En el SC-2-04 de una
-- recepción anterior a esta migración, «Número del documento» queda con la
-- línea de cumplimentación en blanco (regla expresa de la misión §5.7);
-- la trazabilidad del documento sigue disponible en el pie (identificador
-- COSTPRO) y en la UI (reference_doc = factura externa).
