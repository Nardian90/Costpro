-- ════════════════════════════════════════════════════════════════════════
-- REM-INV-3C — REMEDIACIÓN MÍNIMA: fn_validate_document_transition
-- ════════════════════════════════════════════════════════════════════════
-- Origen del hallazgo: REM-INV-3R-B hallazgo colateral 04.
-- Defecto reproducido en staging (REM-INV-3C):
--   (1) La función LIVE (drift out-of-band instalado entre jul-26 y ago-28)
--       contiene un mapa reducido a production_orders + transactions.
--       Las tablas ligadas por trigger pero AUSENTES del mapa
--       (devolutions, receipts, transfers, inventory_adjustments) fallan ABIERTO:
--       v_valid_transitions->v_table_name = NULL  ⇒  NULL ? status = NULL
--       ⇒  TRUE ... AND NULL = NULL  ⇒  NOT(NULL) = NULL  ⇒  IF NULL = FALSE
--       ⇒  NO se levanta excepción  ⇒  transición aceptada.
--   (2) Sub-caso NULL puro: (map->tbl->old_status) ? NULL = NULL sobre tabla
--       mapeada ⇒ TRUE AND NULL = NULL ⇒ fail-open (inaccesible en producción
--       por columnas status NOT NULL, pero defecto lógico idéntico).
--
-- Corrección aplicada (mínima, semántica documentada):
--   A. Fallo cerrado para document_type desconocido / condición NULL
--      (patrón COALESCE(...,false) — NULL nunca puede aceptar).
--   B. Restauración de los 4 mapas ausentes con la semántica ORIGINAL
--      documentada en migraciones:
--        - devolutions, receipts, transfers      → V2.3 (commit 48e501e8)
--        - inventory_adjustments                 → V2.11 (commit 970953e9)
--   C. create_devolution_v2 / reverse_devolution / V1 / writers vivos de
--      receipts (7), transfers (5) e inventory_adjustments (5) verificados
--      uno a uno contra los mapas restaurados (REM-INV-3C 06-caller-census):
--      ninguna transición legítima existente queda bloqueada.
--   D. El único UPDATE de create_devolution_v2 sobre devolutions es
--      SET total_amount (sin status) ⇒ trigger UPDATE OF status no dispara.
--   E. El chequeo final fail-closed es equivalente en comportamiento a la
--      forma original para entradas válidas del mapa (booleano no-NULL),
--      y deniega lo que antes era NULL→aceptado:
--        IF NOT (map->tbl ? old AND (map->tbl->old) ? new) THEN RAISE
--      con clave/tabla ausente evaluaba NULL ⇒ "IF NULL" = FALSE ⇒ aceptaba.
--      La nueva forma (IS NULL + COALESCE(...,false)) deniega siempre.
--      NOTA: el cuerpo de la función no lleva comentarios a propósito —
--      prosrc debe ser byte-exacto con el espejo de staging (md5 469c529a).
--
-- Sin cambios: firma (RETURNS trigger, 0 args), SECURITY INVOKER, owner,
-- search_path, grants EXECUTE, triggers, policies, RLS, datos.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_validate_document_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_table_name TEXT := TG_ARGV[0];
  v_old_status TEXT;
  v_new_status TEXT;
  v_valid_transitions JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_new_status := NEW.status;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_status := NULL;
    v_new_status := NEW.status;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_old_status IS NOT NULL AND v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  v_valid_transitions := jsonb_build_object(
    'production_orders', jsonb_build_object(
      'draft',       '["approved","in_progress","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["paused","completed","voided","reversed"]'::jsonb,
      'paused',      '["in_progress","voided","reversed"]'::jsonb,
      'completed',   '["closed","reversed","voided"]'::jsonb,
      'closed',      '["reversed","voided"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'transactions', jsonb_build_object(
      'pending',     '["completed","voided"]'::jsonb,
      'completed',   '["voided","reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'devolutions', jsonb_build_object(
      'pending',   '["completed","voided"]'::jsonb,
      'completed', '["reversed","voided"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'receipts', jsonb_build_object(
      'pending',   '["confirmed","active","voided"]'::jsonb,
      'confirmed', '["active","reversed","voided"]'::jsonb,
      'active',    '["reversed","voided"]'::jsonb,
      'partial',   '["active","confirmed","reversed","voided"]'::jsonb,
      'reversed',  '[]'::jsonb,
      'voided',    '[]'::jsonb
    ),
    'transfers', jsonb_build_object(
      'PENDIENTE',  '["CONFIRMADA","CANCELADA"]'::jsonb,
      'CONFIRMADA', '["REVERSADA"]'::jsonb,
      'CANCELADA',  '[]'::jsonb,
      'REVERSADA',  '[]'::jsonb
    ),
    'inventory_adjustments', jsonb_build_object(
      'pending',   '["confirmed","reversed","voided"]'::jsonb,
      'confirmed', '["reversed"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    )
  );

  IF v_old_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF (v_valid_transitions->v_table_name) IS NULL
     OR NOT COALESCE((v_valid_transitions->v_table_name) ? v_old_status, false)
     OR NOT COALESCE((v_valid_transitions->v_table_name->v_old_status) ? v_new_status, false) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % no puede pasar de % a %',
      v_table_name, v_old_status, v_new_status;
  END IF;

  RETURN NEW;
END;
$function$;
