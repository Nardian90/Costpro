-- ═══════════════════════════════════════════════════════════════════════════
-- CP-SEC-PRIVILEGES — MÍNIMO PRIVILEGIO: revocar TRUNCATE/TRIGGER/REFERENCES
-- a anon y authenticated en el esquema public (tablas actuales y futuras)
-- Misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 (2026-11-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ESTADO MEDIDO EN PRODUCCIÓN (2026-11-14 [MEDIDO], fase 1):
--   · anon: TRUNCATE ×149 tablas, TRIGGER ×152, REFERENCES ×152.
--   · authenticated: TRUNCATE ×155, TRIGGER ×158, REFERENCES ×158.
--   · DEFAULT PRIVILEGES vigentes (pg_default_acl) para tablas futuras del
--     esquema public otorgan arwdDxtm (TODO, incluidos t/x/D) a anon y
--     authenticated cuando el creador es postgres o supabase_admin.
--   · Roles con CREATE en public (creadores reales): SOLO postgres y
--     supabase_admin [MEDIDO]. No existe ningún otro rol creador.
--
-- JUSTIFICACIÓN:
--   · PostgREST no expone operaciones TRUNCATE/CREATE TRIGGER/CREATE FK, y
--     anon/authenticated no abren conexiones SQL directas: estos privilegios
--     NO son necesarios para la aplicación (higiene de seguridad).
--   · La defensa en profundidad exige que ni un futuro desvío de PostgREST
--     ni un error de configuración dispongan de esa superficie.
--   · El freno de TRUNCATE (CP-INFRA-020) complementa (no sustituye) esta
--     revocación: el freno protege también frente a service_role/postgres.
--
-- ALCANCE DELIBERADO:
--   · SOLO esquema public. SOLO roles anon y authenticated.
--   · NO se tocan SELECT/INSERT/UPDATE/DELETE ni EXECUTE (la app sigue
--     igual), ni los permisos de service_role, postgres, supabase_admin u
--     otros roles administrativos [se verifica tras aplicar].
--   · ALTER DEFAULT PRIVILEGES se configura para los DOS roles creadores
--     reales (postgres y supabase_admin): configurar solo uno dejaría
--     desprotegidas las tablas creadas por el otro.
--
-- Idempotente: REVOKE y ALTER DEFAULT PRIVILEGES ... REVOKE son re-ejecutables.
-- Reversibilidad: GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA
--   public TO anon, authenticated; + ALTER DEFAULT PRIVILEGES FOR ROLE
--   postgres IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES TO anon,
--   authenticated; (y lo mismo FOR ROLE supabase_admin).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Revocación sobre TODAS las tablas existentes del esquema public
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- 2) Privilegios por defecto para tablas futuras — creador postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES FROM anon, authenticated;

-- 3) Privilegios por defecto para tablas futuras — creador supabase_admin
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Verificación fail-closed de cierre
-- ─────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_residuales int;
  v_defacl_residuales int;
  v_service_intacto int;
BEGIN
  -- (a) cero privilegios TRUNCATE/TRIGGER/REFERENCES de anon/authenticated
  --     sobre tablas del esquema public
  SELECT count(*) INTO v_residuales
    FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF v_residuales <> 0 THEN
    RAISE EXCEPTION 'CP-SEC-PRIVILEGES: quedan % privilegios TRUNCATE/TRIGGER/REFERENCES de anon/authenticated en public', v_residuales;
  END IF;

  -- (b) cero privilegios por defecto TRUNCATE/TRIGGER/REFERENCES para
  --     anon/authenticated de cualquier creador en public
  SELECT count(*) INTO v_defacl_residuales
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
   WHERE d.defaclnamespace = 'public'::regnamespace::oid
     AND a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
     AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF v_defacl_residuales <> 0 THEN
    RAISE EXCEPTION 'CP-SEC-PRIVILEGES: quedan % privilegios por defecto TRUNCATE/TRIGGER/REFERENCES para anon/authenticated en public', v_defacl_residuales;
  END IF;

  -- (c) service_role conserva sus privilegios sobre tablas de negocio
  --     (muestra representativa: payrolls y products)
  SELECT count(*) INTO v_service_intacto
    FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND grantee = 'service_role'
     AND table_name IN ('payrolls', 'products', 'transactions')
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  IF v_service_intacto < 3 THEN
    RAISE EXCEPTION 'CP-SEC-PRIVILEGES: service_role perdió privilegios de negocio (verificados %)', v_service_intacto;
  END IF;

  RAISE NOTICE 'CP-SEC-PRIVILEGES OK: 0 residuales en tablas, 0 en defaults, service_role intacto';
END
$verify$;
