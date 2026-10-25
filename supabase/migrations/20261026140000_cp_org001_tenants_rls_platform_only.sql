-- ═══════════════════════════════════════════════════════════════════════════
-- CP-ORG-001 (continuación, 2026-10-25) — tenants: escrituras SOLO plataforma
-- ═══════════════════════════════════════════════════════════════════════════
-- BRECHA (prueba de aceptación §4.2: «usuarios no autorizados no pueden crear
-- organizaciones mediante llamadas directas a la API»):
--
--   Las policies RLS de escritura de `tenants` usaban `is_admin()`, que tras
--   20261026120000 acepta role IN ('admin','superadmin'). Consecuencia: un
--   `admin` de TIENDA podía, con su JWT + anon key, INSERTAR/UPDATEAR/BORRAR
--   filas de `tenants` directamente por PostgREST, saltándose la ruta
--   /api/organizations que restringe esas operaciones a SuperAdmin («crear
--   empresas es una acción de plataforma»).
--
--   SELECT permanece como está (los miembros/owner leen su organización).
--   La app NO usa escrituras cliente de `tenants` (verificado: 0 accesos
--   `from('tenants')` fuera de rutas API con service_role, que no pasa por
--   RLS), así que este endurecimiento no afecta ningún flujo legítimo.
--
--   · INSERT  → solo SuperAdmin (la ruta POST ya lo exige; ahora también BD).
--   · UPDATE  → SuperAdmin o el OWNER de la organización (auto-gestión del
--     propietario preservada; fuera el admin de tienda transversal).
--   · DELETE  → solo SuperAdmin (la ruta DELETE ya lo exige; ahora también BD).
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY. Sin cambios de datos.
-- NO APLICADA A PRODUCCIÓN: se despliega junto con 20261026120000/130000 tras
-- la autorización del propietario. Validada en el proyecto E2E aislado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── INSERT: plataforma solamente ─────────────────────────────────────────
DROP POLICY IF EXISTS "tenants_insert_admin_only" ON public.tenants;
CREATE POLICY "tenants_insert_admin_only" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (is_superadmin());

-- ─── UPDATE: SuperAdmin global o el propietario de la organización ─────────
DROP POLICY IF EXISTS "tenants_update_own_or_admin" ON public.tenants;
CREATE POLICY "tenants_update_own_or_admin" ON public.tenants
  FOR UPDATE TO authenticated
  USING (is_superadmin() OR (owner_id = auth.uid()))
  WITH CHECK (is_superadmin() OR (owner_id = auth.uid()));

-- ─── DELETE: plataforma solamente ──────────────────────────────────────────
DROP POLICY IF EXISTS "tenants_delete_admin_only" ON public.tenants;
CREATE POLICY "tenants_delete_admin_only" ON public.tenants
  FOR DELETE TO authenticated
  USING (is_superadmin());

-- ─── Verificación local del estado final ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'tenants_insert_admin_only'
      AND with_check LIKE '%is_superadmin()%'
      AND with_check NOT LIKE '%is_admin()%'
  ) THEN
    RAISE EXCEPTION 'tenants_insert_admin_only debe ser is_superadmin()-only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'tenants_delete_admin_only'
      AND qual LIKE '%is_superadmin()%'
      AND qual NOT LIKE '%is_admin()%'
  ) THEN
    RAISE EXCEPTION 'tenants_delete_admin_only debe ser is_superadmin()-only';
  END IF;
END
$$;
