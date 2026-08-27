-- ============================================================================
-- 20260827000005_audit_f3p001_rls_write_isolation.sql
-- FIX · F3-P0-01 — RLS cross-store WRITE isolation (familia ELSE true)
-- ============================================================================
-- ORIGEN DEL DEFECTO
--   Nueve políticas de escritura (INSERT / UPDATE con WITH CHECK) incluían la
--   rama `ELSE true` condicionada al flag muerto `app.use_tenant_rls`. Como el
--   flag jamás se establece (F3-P2-01: USE_TENANT_RLS ausente), el runtime
--   resolvía SIEMPRE por la rama `ELSE true`, desactivando de facto el control
--   multi-tienda sobre escrituras directas del rol `authenticated`.
--
--   Evidencia empírica producción: FASE-3/09-policy-danger-patterns.json y
--   FASE-3/05-idor-results-FULL.json (transactions 201-fantasma, kardex 201,
--   price_change_history 201, products PATCH 204 cross-store).
--
-- MODELO DE AUTORIZACIÓN CANÓNICO (DECISION-GM-01)
--   La condición de escritura deja depender del flag muerto y pasa a depender
--   EXCLUSIVAMENTE de la membresía efectiva del usuario vía helpers ya
--   canónicos del sistema (mismo modelo que las políticas SELECT vigentes):
--
--     store_id = ANY (current_user_store_ids())
--       → rol `admin`          : todas las tiendas activas de su tenant
--                                (semántica previa explícita del helper,
--                                 coherente con la capa de lectura actual;
--                                 marcada para ratificación del dueño).
--       → cualquier otro rol   : SOLO tiendas con membresía activa
--                                (`user_store_memberships.status='active'`).
--       → global manager SIN membresía: ARRAY[]() vacío ⇒ DENY. El rol por sí
--         solo NO otorga acceso a escrituras.
--
--   Tablas con columna tenant_id añaden además la igualdad
--     tenant_id = current_user_tenant_id()
--   replicando la rama "buena" original de cada política (no se amplían
--   privilegios respecto de dicha rama).
--
-- IMPACTO FUNCIONAL
--   - Usuarios legítimos con membresía activa: sin cambio.
--   - Administradores: sin cambio respecto de la capa de lectura y del helper.
--   - RPC SECURITY DEFINER y rutas service-role: sin cambio en BD (siguen
--     fuera del alcance de estas políticas); SU capa de autorización se
--     corrige aparte (F3-P0-02, F3-P1-01, F3-P1-02) y se valida con las
--     pruebas canónicas de regresión del Audit Harness.
--   - Escrituras cross-store por actores sin membresía: AHORA DENEGADAS
--     (objetivo del fix; era el bypass P0).
--
-- VALIDACIÓN OBLIGATORIA ANTES DE APLICAR EN PRODUCCIÓN
--   Ciclo completo ejecutado en Audit Harness (PostgreSQL 17.6 local,
--   políticas verbatim producción):
--     bun /home/z/my-project/harness/fixtures/regression_rls.mjs --phase reg
--   Criterio de cierre F3: 9/9 políticas corregidas, matriz de negativos
--   completa (cross-store READ/WRITE, revoked, none, manager-sin-membresía),
--   positivos mismos-tienda intactos y reconciliación censal pre==post.
-- ============================================================================

BEGIN;

-- ── 1/9 · transactions (tenant_id + store_id) ───────────────────────────────
DROP POLICY IF EXISTS "transactions_tenant_insert_with_check" ON public.transactions;
CREATE POLICY "transactions_tenant_insert_with_check" ON public.transactions
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (tenant_id = public.current_user_tenant_id())
  AND (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 2/9 · payment_transactions (store_id) ───────────────────────────────────
DROP POLICY IF EXISTS "payment_transactions_tenant_insert_with_check" ON public.payment_transactions;
CREATE POLICY "payment_transactions_tenant_insert_with_check" ON public.payment_transactions
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 3/9 · devolutions (store_id) ────────────────────────────────────────────
DROP POLICY IF EXISTS "devolutions_tenant_insert_with_check" ON public.devolutions;
CREATE POLICY "devolutions_tenant_insert_with_check" ON public.devolutions
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 4/9 · cash_closures (store_id) ──────────────────────────────────────────
DROP POLICY IF EXISTS "cash_closures_tenant_insert_with_check" ON public.cash_closures;
CREATE POLICY "cash_closures_tenant_insert_with_check" ON public.cash_closures
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 5/9 · inventory_adjustments (store_id) ──────────────────────────────────
DROP POLICY IF EXISTS "inventory_adjustments_tenant_insert_with_check" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_tenant_insert_with_check" ON public.inventory_adjustments
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 6/9 · kardex_entries (store_id) ─────────────────────────────────────────
DROP POLICY IF EXISTS "kardex_entries_tenant_insert_with_check" ON public.kardex_entries;
CREATE POLICY "kardex_entries_tenant_insert_with_check" ON public.kardex_entries
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 7/9 · price_change_history (tenant_id + store_id) ───────────────────────
DROP POLICY IF EXISTS "price_change_history_tenant_insert_with_check" ON public.price_change_history;
CREATE POLICY "price_change_history_tenant_insert_with_check" ON public.price_change_history
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (tenant_id = public.current_user_tenant_id())
  AND (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 8/9 · products INSERT (tenant_id + store_id) ────────────────────────────
DROP POLICY IF EXISTS "products_tenant_insert" ON public.products;
CREATE POLICY "products_tenant_insert" ON public.products
 AS permissive FOR INSERT TO authenticated
 WITH CHECK (
  (tenant_id = public.current_user_tenant_id())
  AND (store_id = ANY (public.current_user_store_ids()))
 );

-- ── 9/9 · products UPDATE (USING + WITH CHECK; elimina la rama ELSE muerta
--        tanto en el USING como en el WITH CHECK conservando las ramas buenas
--        originales de cada uno) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "products_tenant_update" ON public.products;
CREATE POLICY "products_tenant_update" ON public.products
 AS permissive FOR UPDATE TO authenticated
 USING (
  (tenant_id = public.current_user_tenant_id())
  AND (public.is_admin() OR (store_id = ANY (public.current_user_store_ids())))
 )
 WITH CHECK (
  (tenant_id = public.current_user_tenant_id())
  AND (store_id = ANY (public.current_user_store_ids()))
 );

COMMIT;

-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN (operador): ninguna política restante debe
-- contener el literal `ELSE true` en expresiones de WITH CHECK/USING de esta
-- familia. Chequeo rápido:
--   SELECT policyname FROM pg_policies
--    WHERE tablename IN ('transactions','payment_transactions','devolutions',
--      'cash_closures','inventory_adjustments','kardex_entries',
--      'price_change_history','products')
--      AND COALESCE(with_check::text,'') LIKE '%ELSE true%';
-- Resultado esperado: 0 filas.
-- ============================================================================
