-- ═══════════════════════════════════════════════════════════════════════════
-- BUGFIX CP-PROVEEDORES-001 · Proveedores como recurso operativo compartido
-- de la tienda — visibilidad multiusuario y creación desde recepciones.
--
-- DEFECTO (causa raíz demostrada contra BD viva, reproducción con JWT real):
--   Las tres políticas RLS de public.suppliers (era pre-organizaciones)
--   resolvían el nivel administrativo con un check ESTRICTO
--   «profiles.role = 'admin'» literal y la membresía SIN exigir
--   status = 'active':
--     · suppliers_select_authenticated  → superadmin NO ve NINGÚN
--       proveedor (SELECT filtrado a []) aunque su tienda activa tenga
--       proveedores reales (demostrado: admin@demo.com superadmin en
--       ENERVIDA-VITALLCONS, 5 proveedores existentes, lista vacía).
--     · suppliers_insert_authenticated  → superadmin RECIBE
--       HTTP 403 code 42501 «new row violates row-level security policy
--       for table "suppliers"» al crear un proveedor desde la recepción
--       (reproducido con JWT real; 0 filas escritas). El hook de la app
--       imprime «Error al crear proveedor: desconocido» porque el objeto
--       PostgrestError no es instanceof Error (fix de app en este mismo PR).
--     · suppliers_update_authenticated  → mismo falso rechazo para
--       superadmin en actualizaciones.
--   La memberships sin status también deja ver proveedores de tiendas cuya
--   membresía fue revocada (endurecimiento menor, alineado con las políticas
--   modernas «*_rls» de products/receipts que exigen status='active').
--
-- PRECEDENTE: este defecto de clase ya fue corregido para la familia de
--   autorización RPC en 20261027120000 (has_store_access_as y derivadas,
--   check estricto «= 'admin'» que rechazaba falsamente al superadmin).
--   suppliers — tabla operada directamente por la app vía PostgREST, no por
--   RPC — quedó fuera de aquella barrida. Esta migración cierra ese hueco
--   con la MISMA fuente de verdad: las funciones canónicas de autorización.
--
-- MODELO DE NEGOCIO (misión §3): un proveedor pertenece a una TIENDA
--   (suppliers.store_id FK stores.id, sin created_by — NO es un recurso
--   privado del usuario que lo creó). La visibilidad correcta es la misma
--   de products/receipts: cualquier usuario autorizado de la tienda lo
--   consulta; el nivel administrativo de plataforma (admin|superadmin) es
--   transversal.
--
-- CORRECCIÓN (alcance mínimo — solo metadatos de acceso, 0 filas de datos):
--   1. SELECT → has_store_access(suppliers.store_id) OR is_admin()
--      · has_store_access: membresía ACTIVA (status='active') con chequeo
--        de coherencia tenant (la función canónica vigente, SECURITY
--        DEFINER, ya usada por las políticas *_tenant_* de products y
--        receipts vía rama ELSE).
--      · is_admin(): ('admin','superadmin') — el check central del sistema
--        (usado por ~70 políticas RLS y las RPC; MISMA semántica que
--        isAdminLevel() en la app).
--   2. INSERT → mismo predicado que products/receipts modernas:
--      membresía ACTIVA con rol operativo de tienda
--      ('admin','manager','encargado' — roles que hoy ya podían crear en la
--      policy legada, ahora con status='active' exigido) OR is_admin().
--   3. UPDATE → igual que INSERT (rol operativo con membresía activa OR
--      is_admin()). La policy legada era idéntica en cual y solo cambiaba
--      el literal de perfil.
--   4. DELETE → SIN política (como hoy): la app no expone borrado de
--      proveedores (baja lógica vía is_active, UPDATE). No se abre ningún
--      permiso nuevo que no existiera.
--
-- POLÍTICA EFECTIVA RESULTANTE (tabla de verdad):
--   · superadmin / admin de plataforma: ve y gestiona proveedores de
--     cualquier tienda (transversal, igual que ya hace con products,
--     receipts y purchase_orders vía is_admin()).
--   · manager/encargado con membresía ACTIVA: consulta y crea (igual que
--     hoy, ahora sin dejar pasar membresías revocadas).
--   · Cualquier otro usuario autenticado: SOLO consulta con membresía
--     ACTIVA de esa tienda. clerk/warehouse/costo/usuario no ganan
--     escritura (no la tenían).
--   · anon: NADA (RLS sigue activa; sin políticas para anon; grants de
--     tabla intactos — los grants legacy de anon sobre suppliers son
--     preexistentes del esquema y SIN política anon toda fila queda
--     invisible; no se amplían).
--   · Otra organización: sin membresía y sin is_admin → false (aislamiento
--     por tienda intacto, idéntico a products/receipts).
--
-- COMPATIBILIDAD:
--   · DROP ... IF EXISTS de las tres políticas legadas y CREATE de las
--     nuevas — ningún otro objeto depende de estos nombres.
--   · Sin cambios de esquema, datos, grants, triggers ni funciones:
--     el contract-surface de funciones queda intacto.
--   · Los 5 proveedores existentes de ENERVIDA-VITALLCONS se conservan
--     intactos (verificación pre/post en el expediente del PR).
--   · receipts.supplier es texto libre (compatibilidad histórica): el
--     guardado de recepciones no depende de FK a suppliers.
--
-- IDEMPOTENCIA: DROP IF EXISTS + CREATE (las políticas PERMISSIVE se
--   reemplazan limpio en re-aplicación). GUARD inicial fail-closed verifica
--   que las funciones canónicas existen con la semántica esperada antes de
--   tocar nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- Guard fail-closed: las funciones canónicas deben existir con la
-- semántica vigente antes de delegar la autorización.
--   · is_admin() incluye ('admin','superadmin')
--   · has_store_access(uuid) exige membresía status='active'
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin'
      AND pg_get_functiondef(p.oid) ILIKE '%''admin'', ''superadmin''%'
  ) THEN
    RAISE EXCEPTION 'GUARD: public.is_admin() con roles (''admin'',''superadmin'') no existe — abortando (validación de firma de la migración 20261101120000)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_store_access'
      AND pg_get_functiondef(p.oid) ILIKE '%status::text = ''active''%'
  ) THEN
    RAISE EXCEPTION 'GUARD: public.has_store_access(uuid) con membresía activa no existe — abortando (validación de firma de la migración 20261101120000)';
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 1) Retiro de las tres políticas legadas (check estricto
--    «profiles.role = 'admin'» que excluía al superadmin y memberships
--    sin status). Definiciones literales conservadas en el historial del
--    repositorio y documentadas en el expediente del PR.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "suppliers_select_authenticated" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert_authenticated" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update_authenticated" ON public.suppliers;

-- ──────────────────────────────────────────────────────────────
-- 2) SELECT — recurso operativo compartido de la tienda:
--    usuarios con membresía ACTIVA de la tienda (vía has_store_access,
--    que incluye el chequeo de coherencia tenant) o nivel administrativo
--    de plataforma (admin|superadmin vía is_admin).
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "suppliers_select_authenticated" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.has_store_access(store_id) OR public.is_admin());

-- ──────────────────────────────────────────────────────────────
-- 3) INSERT — creación desde recepciones y órdenes de compra:
--    membresía ACTIVA con rol operativo de tienda ('admin','manager',
--    'encargado' — los mismos roles de la policy legada) o nivel
--    administrativo de plataforma.
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "suppliers_insert_authenticated" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      store_id IN (
        SELECT m.store_id
        FROM public.user_store_memberships m
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('admin', 'manager', 'encargado')
      )
    )
    OR public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────
-- 4) UPDATE — edición/actualización de proveedores de la tienda:
--    mismo predicado que INSERT (la policy legada era simétrica).
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "suppliers_update_authenticated" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    (
      store_id IN (
        SELECT m.store_id
        FROM public.user_store_memberships m
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('admin', 'manager', 'encargado')
      )
    )
    OR public.is_admin()
  )
  WITH CHECK (
    (
      store_id IN (
        SELECT m.store_id
        FROM public.user_store_memberships m
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('admin', 'manager', 'encargado')
      )
    )
    OR public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────
-- Verificación post-migración (fail-closed): las tres políticas nuevas
-- existen, ninguna legada quedó viva y RLS sigue habilitada. Si algo de
-- esto falla, la migración aborta SIN dejar el estado a medio aplicar
-- (cada CREATE anterior ya es atómico).
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_lesser_total int;
  v_select int;
  v_insert int;
  v_update int;
  v_rls_enabled boolean;
BEGIN
  SELECT count(*) INTO v_lesser_total
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'suppliers';

  SELECT count(*) INTO v_select
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'suppliers' AND cmd = 'SELECT';

  SELECT count(*) INTO v_insert
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'suppliers' AND cmd = 'INSERT';

  SELECT count(*) INTO v_update
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'suppliers' AND cmd = 'UPDATE';

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'suppliers';

  IF v_lesser_total <> 3 OR v_select <> 1 OR v_insert <> 1 OR v_update <> 1 THEN
    RAISE EXCEPTION 'VERIFICACIÓN: políticas suppliers inesperadas (total=%, SELECT=%, INSERT=%, UPDATE=%) — esperadas exactamente 3/1/1/1', v_lesser_total, v_select, v_insert, v_update;
  END IF;

  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'VERIFICACIÓN: RLS de suppliers quedó deshabilitada — inaceptable';
  END IF;
END;
$$;
