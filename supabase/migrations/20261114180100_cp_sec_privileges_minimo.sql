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
--   · Roles con CREATE en public: postgres y supabase_admin [MEDIDO].
--   · PROPIETARIOS REALES de las 178 tablas de public: 178/178 postgres
--     [MEDIDO]. supabase_admin NO ha creado ninguna tabla en public (sus
--     objetos son de plataforma, en otros esquemas).
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
--   · ALTER DEFAULT PRIVILEGES se configura para los DOS roles con CREATE
--     en public. El de postgres (creador REAL de 178/178 tablas) se aplica
--     de forma efectiva. El de supabase_admin se INTENTA y, si el entorno
--     no lo permite (postgres no es miembro de supabase_admin — medido
--     2026-11-14: pg_has_role=false), queda como RESIDUAL INERTE
--     documentado: 0 tablas de public son de supabase_admin; su default ACL
--     solo produciría efecto si la plataforma creara tablas en public, lo
--     cual requiere además una operación de plataforma (documentado en el
--     expediente de la misión y verificado por catálogo).
--
-- Idempotente: REVOKE y ALTER DEFAULT PRIVILEGES ... REVOKE son re-ejecutables.
-- Reversibilidad: GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA
--   public TO anon, authenticated; + ALTER DEFAULT PRIVILEGES FOR ROLE
--   postgres IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES
--   TO anon, authenticated; (y, si la plataforma lo permite, lo mismo FOR
--   ROLE supabase_admin).
-- NOTA de sintaxis: en ALTER DEFAULT PRIVILEGES el tipo de objeto (ON TABLES)
--   es OBLIGATORIO — sin él PostgreSQL rechaza la sentencia (corregido tras
--   el fallo real del primer replay contra CostproE2E, evidencia
--   apply-replay.json del 2026-11-14).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Revocación sobre TODAS las tablas existentes del esquema public
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- 2) Privilegios por defecto para tablas futuras — creador postgres
--    (creador REAL de 178/178 tablas de public [MEDIDO])
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- 3) Privilegios por defecto para tablas futuras — creador supabase_admin
--    (con CREATE en public pero 0 tablas creadas [MEDIDO]). INTENTO
--    controlado: si el rol de conexión no puede alterar los defaults de
--    supabase_admin (postgres no es miembro — medido), queda como residual
--    inerte documentado en el DO de verificación (no aborta la protección
--    efectiva del creador real).
DO $supabase_admin_defaults$
BEGIN
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
         || 'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated';
    RAISE NOTICE 'CP-SEC-PRIVILEGES: defaults de supabase_admin también revocados (el entorno lo permitió)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CP-SEC-PRIVILEGES: defaults de supabase_admin NO alterables por este rol (%) — RESIDUAL INERTE documentado: 0/178 tablas de public son de supabase_admin; requiere operación de plataforma', SQLERRM;
  END;
END
$supabase_admin_defaults$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Verificación fail-closed de cierre
-- ─────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_residuales int;
  v_defacl_postgres int;
  v_defacl_sba int;
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
  --     anon/authenticated del creador postgres (el creador real)
  SELECT count(*) INTO v_defacl_postgres
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
   WHERE d.defaclnamespace = 'public'::regnamespace::oid
     AND pg_get_userbyid(d.defaclrole) = 'postgres'
     AND a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
     AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF v_defacl_postgres <> 0 THEN
    RAISE EXCEPTION 'CP-SEC-PRIVILEGES: quedan % privilegios por defecto del creador postgres para anon/authenticated en public', v_defacl_postgres;
  END IF;

  -- (c) supabase_admin: INFORMAR (no abortar) los residuales inertes
  SELECT count(*) INTO v_defacl_sba
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
   WHERE d.defaclnamespace = 'public'::regnamespace::oid
     AND pg_get_userbyid(d.defaclrole) = 'supabase_admin'
     AND a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
     AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF v_defacl_sba > 0 THEN
    RAISE NOTICE 'CP-SEC-PRIVILEGES: residual inerte documentado — % defaults de supabase_admin (rol sin tablas en public, 0/178 [MEDIDO]; alterarlos exige operación de plataforma)', v_defacl_sba;
  END IF;

  -- (d) service_role conserva sus privilegios sobre tablas de negocio
  --     (muestra representativa: payrolls, products, transactions)
  SELECT count(*) INTO v_service_intacto
    FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND grantee = 'service_role'
     AND table_name IN ('payrolls', 'products', 'transactions')
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  IF v_service_intacto < 3 THEN
    RAISE EXCEPTION 'CP-SEC-PRIVILEGES: service_role perdió privilegios de negocio (verificados %)', v_service_intacto;
  END IF;

  RAISE NOTICE 'CP-SEC-PRIVILEGES OK: 0 residuales en tablas, 0 en defaults de postgres (creador real), service_role intacto';
END
$verify$;
