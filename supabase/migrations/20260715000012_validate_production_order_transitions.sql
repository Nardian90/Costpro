-- ════════════════════════════════════════════════════════════════════
-- Fase 5: Validación de transiciones de estado en production_orders
-- ════════════════════════════════════════════════════════════════════
-- Problema: el PATCH acepta cualquier status sin validar transiciones.
-- Se puede saltar de draft → closed sin pasar por approved/in_progress.
--
-- Matriz de transiciones permitidas:
--   draft       → approved | voided
--   approved    → in_progress | voided
--   in_progress → paused | completed | voided
--   paused      → in_progress | voided
--   completed   → closed | voided
--   closed      → (terminal, no permite cambios)
--   voided      → (terminal, no permite cambios)
--
-- Excepción: si el cambio viene con action='close' o action='receive_output',
-- el endpoint PATCH fuerza status='closed' o mantiene status. El trigger
-- permite estas transiciones especiales.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_production_order_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo validar si status está cambiando
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Estados terminales: no se puede salir de closed o voided
        IF OLD.status IN ('closed', 'voided') THEN
            RAISE EXCEPTION 'ERR_INVALID_TRANSITION: No se puede cambiar el estado de una orden %.', OLD.status;
        END IF;

        -- Validar transición específica
        CASE OLD.status
            WHEN 'draft' THEN
                IF NEW.status NOT IN ('approved', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde draft solo se puede pasar a approved o voided (intentado: %).', NEW.status;
                END IF;
            WHEN 'approved' THEN
                IF NEW.status NOT IN ('in_progress', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde approved solo se puede pasar a in_progress o voided (intentado: %).', NEW.status;
                END IF;
            WHEN 'in_progress' THEN
                IF NEW.status NOT IN ('paused', 'completed', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde in_progress solo se puede pasar a paused, completed o voided (intentado: %).', NEW.status;
                END IF;
            WHEN 'paused' THEN
                IF NEW.status NOT IN ('in_progress', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde paused solo se puede pasar a in_progress o voided (intentado: %).', NEW.status;
                END IF;
            WHEN 'completed' THEN
                IF NEW.status NOT IN ('closed', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde completed solo se puede pasar a closed o voided (intentado: %).', NEW.status;
                END IF;
            ELSE
                NULL; -- cualquier otro estado → permitir (no debería ocurrir)
        END CASE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_validate_production_order_status ON public.production_orders;
CREATE TRIGGER trigger_validate_production_order_status
    BEFORE UPDATE OF status ON public.production_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_production_order_transition();

-- Verificación
SELECT 'transitions_validated' AS status,
       (SELECT count(*) FROM pg_trigger
        WHERE tgname = 'trigger_validate_production_order_status'
          AND NOT tgisinternal) AS trigger_count;
