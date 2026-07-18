-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-18): ampliar matriz de transiciones para permitir cierre directo
-- ════════════════════════════════════════════════════════════════════
-- El endpoint PATCH con action='close' fuerza status='closed' desde
-- cualquier estado no terminal. La matriz original no permitía:
--   in_progress → closed (saltaba completed)
--   approved → closed (saltaba in_progress y completed)
--
-- Esto es intencional: el admin puede cerrar directamente desde
-- in_progress o approved si el trabajo se completó rápidamente.
-- Actualizamos la función para permitir estas transiciones.
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
        -- Matriz ampliada: permite cierre directo (→ closed) desde approved/in_progress/paused/completed
        CASE OLD.status
            WHEN 'draft' THEN
                IF NEW.status NOT IN ('approved', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde "Borrador" solo se puede pasar a "Aprobada" o "Anulada" (intentado: %).', NEW.status;
                END IF;
            WHEN 'approved' THEN
                IF NEW.status NOT IN ('in_progress', 'closed', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde "Aprobada" solo se puede pasar a "En Progreso", "Cerrada" o "Anulada" (intentado: %).', NEW.status;
                END IF;
            WHEN 'in_progress' THEN
                IF NEW.status NOT IN ('paused', 'completed', 'closed', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde "En Progreso" solo se puede pasar a "Pausada", "Completada", "Cerrada" o "Anulada" (intentado: %).', NEW.status;
                END IF;
            WHEN 'paused' THEN
                IF NEW.status NOT IN ('in_progress', 'closed', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde "Pausada" solo se puede pasar a "En Progreso", "Cerrada" o "Anulada" (intentado: %).', NEW.status;
                END IF;
            WHEN 'completed' THEN
                IF NEW.status NOT IN ('closed', 'voided') THEN
                    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: Desde "Completada" solo se puede pasar a "Cerrada" o "Anulada" (intentado: %).', NEW.status;
                END IF;
            ELSE
                NULL; -- cualquier otro estado → permitir
        END CASE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'transitions_amplified' AS status;
