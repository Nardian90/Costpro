-- ============================================================================
-- w7d1-acl-patch.sql — W7-D1 ACL REMEDIATION (enmienda al paquete 01)
-- Orden: GO W7-D1 ACL REMEDIATION + RE-GATE (sesión de laboratorio, clon efímero)
-- PRODUCCIÓN CONGELADA: este parche NUNCA se aplica a producción sin orden
--   explícita del dueño; su aplicación aquí es exclusivamente en clon de prueba.
--
-- Problema (W7-03 §12.2): CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto;
-- el paquete 01 añadió GRANT a service_role pero nunca revocó PUBLIC/anon/
-- authenticated → mutación arbitraria de WAC reproducible por roles de cliente.
--
-- Firma verificada en pg_proc ANTES de este parche (FASE 1, sin overloads):
--   public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text,
--                        p_qty_in numeric, p_uc_in numeric,
--                        p_source_ref jsonb DEFAULT NULL) RETURNS numeric
--   SECURITY DEFINER, SET search_path TO 'public','extensions', owner postgres
--
-- Principio de mínimo privilegio (FASE 4):
--   PUBLIC        = DENY   (nunca fue intención; default de PostgreSQL)
--   anon          = DENY   (rol de identidad anónima de PostgREST)
--   authenticated = DENY   (el writer se invoca INTERNAMENTE por 12 rutinas
--                           SECURITY DEFINER owner postgres — la cadena
--                           consumer→canonical writer no necesita EXECUTE
--                           directo del rol cliente)
--   service_role  = KEEP   (rol de confianza server-side; GRANT ya emitido por
--                           pkg 01 L838; único caso de uso externo legítimo:
--                           recalculo administrativo vía RPC server-side)
--   postgres      = KEEP   (owner; bypass intrínseco)
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM authenticated;

COMMIT;
