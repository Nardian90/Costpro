-- =============================================================================
-- Migration: 20260802000006_v2_12_45_backup_registry.sql
-- Iteración 7 — Backup Restore (BR-1)
--
-- Propósito: Establecer el esquema auxiliar para backup/restore:
--   1. backup_table_registry  — catálogo de 82 tablas (75 activas + 7 excluded)
--   2. restore_sessions       — tracking de operaciones de restore
--   3. discover_backup_tables() — introspección runtime (information_schema)
--   4. get_backup_table_list()  — tablas activas en orden topológico
--   5. validate_post_restore()  — validaciones post-restore (esqueleto)
--
-- NO modifica triggers ni funciones de negocio existentes.
-- NO implementa el RPC restore_store_backup() (eso es Migration 3).
--
-- Diseño: ver docs/BACKUP_RESTORE_RISK_REVIEW.md
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. backup_table_registry
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.backup_table_registry (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name              TEXT NOT NULL UNIQUE,
  tier                    INTEGER NOT NULL CHECK (tier >= 0 AND tier <= 99),
  filter_strategy         TEXT NOT NULL CHECK (
                            filter_strategy IN ('store_id', 'global', 'via_parent',
                                                'via_origin_dest', 'via_entity_id', 'by_id')
                          ),
  parent_table            TEXT,
  parent_foreign_key      TEXT,
  date_column             TEXT,
  excluded_from_restore   BOOLEAN NOT NULL DEFAULT FALSE,
  exclude_reason          TEXT,
  -- v2.12.45b (aprobación controlada): source_of_truth indica qué papel juega la tabla
  -- en la consistencia de datos. Evita que un restore reconstruya datos desde una
  -- tabla que es solo auditoría (stock_movements) sobre-escribiendo la fuente
  -- primaria (inventory.quantity).
  -- Valores:
  --   'primary'    → fuente de verdad. Se restaura directamente, sin recálculo.
  --   'derived'    → calculado a partir de otras tablas. NO se restaura (se recalcula).
  --   'audit'      → historial inmutable. Se restaura directamente, no se usa para
  --                  reconstruir fuentes primarias.
  --   'reference'  → catálogo/configuración. Se restaura directamente.
  --   'ephemeral'  → datos transitorios (logs, notificaciones). Se respalda por
  --                  completitud pero no se restaura.
  --   'unset'      → pendiente de clasificar (default temporal).
  source_of_truth         TEXT NOT NULL DEFAULT 'unset' CHECK (
                            source_of_truth IN ('primary', 'derived', 'audit',
                                                'reference', 'ephemeral', 'unset')
                          ),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_registry_tier
  ON public.backup_table_registry(tier, table_name)
  WHERE excluded_from_restore = FALSE;

CREATE INDEX IF NOT EXISTS idx_backup_registry_active
  ON public.backup_table_registry(table_name)
  WHERE excluded_from_restore = FALSE;

CREATE INDEX IF NOT EXISTS idx_backup_registry_truth
  ON public.backup_table_registry(source_of_truth)
  WHERE excluded_from_restore = FALSE;

COMMENT ON TABLE public.backup_table_registry IS
  'Catálogo central de tablas para backup/restore. 82 tablas detectadas vía introspección OpenAPI + análisis de migraciones. tier = orden topológico de restauración (0=sin dependencias, 7=mensajería). source_of_truth clasifica cada tabla según su papel en la consistencia (primary/derived/audit/reference/ephemeral) — evita que un restore reconstruya datos desde una tabla de auditoría.';

COMMENT ON COLUMN public.backup_table_registry.source_of_truth IS
  'Clasificación de la tabla en el modelo de verdad: primary=fuente de verdad, derived=calculado, audit=historial inmutable, reference=catálogo, ephemeral=transitorio, unset=pendiente.';

-- =============================================================================
-- 2. restore_sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.restore_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  initiated_by             UUID NOT NULL REFERENCES public.profiles(id),
  initiated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                   TEXT NOT NULL CHECK (
                             status IN ('PREPARING', 'DRY_RUN', 'EXECUTING',
                                        'COMPLETED', 'FAILED', 'ROLLED_BACK')
                           ),
  mode                     TEXT NOT NULL CHECK (mode IN ('dry_run', 'execute')),
  backup_payload           JSONB,
  pre_restore_snapshot     JSONB,
  post_restore_validation  JSONB,
  completed_at             TIMESTAMPTZ,
  failed_at                TIMESTAMPTZ,
  failure_reason           TEXT,
  lock_acquired            BOOLEAN NOT NULL DEFAULT FALSE,
  lock_token               TEXT,
  tables_processed         INTEGER DEFAULT 0,
  tables_failed            INTEGER DEFAULT 0,
  total_rows_processed     INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_restore_sessions_store
  ON public.restore_sessions(store_id, initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_restore_sessions_active
  ON public.restore_sessions(store_id)
  WHERE status IN ('PREPARING', 'EXECUTING');

COMMENT ON TABLE public.restore_sessions IS
  'Tracking de operaciones de restore. status PREPARING/EXECUTING actúa como flag RESTORE_IN_PROGRESS. pre_restore_snapshot contiene un JSONB con el estado previo de la tienda para recuperación ante desastre.';

-- =============================================================================
-- 3. discover_backup_tables() — introspección runtime
-- =============================================================================
-- Esta función consulta information_schema.table_constraints y pg_catalog
-- para devolver la lista REAL de tablas con store_id en el esquema actual.
-- Se usa para comparar contra backup_table_registry y detectar drift.

CREATE OR REPLACE FUNCTION public.discover_backup_tables()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'has_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'store_id'
    ),
    'has_origin_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'origin_store_id'
    ),
    'has_destination_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'destination_store_id'
    ),
    'parent_tables', COALESCE((
      SELECT jsonb_agg(DISTINCT cl2.relname)
      FROM pg_constraint con2
      JOIN pg_class cl2 ON con2.confrelid = cl2.oid
      WHERE con2.conrelid = t.table_id
        AND con2.contype = 'f'
    ), '[]'::jsonb),
    'child_tables', COALESCE((
      SELECT jsonb_agg(DISTINCT cl3.relname)
      FROM pg_constraint con3
      JOIN pg_class cl3 ON con3.conrelid = cl3.oid
      WHERE con3.confrelid = t.table_id
        AND con3.contype = 'f'
    ), '[]'::jsonb)
  ) ORDER BY t.table_name)
  FROM (
    SELECT
      c.relname AS table_name,
      c.oid AS table_id
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'  -- solo tablas reales (no vistas)
      AND c.relname NOT LIKE 'pg_%'
      AND c.relname NOT LIKE 'schema_%'
      AND c.relname NOT IN ('schema_migrations')
    ORDER BY c.relname
  ) t;
$$;

COMMENT ON FUNCTION public.discover_backup_tables() IS
  'Introspección runtime: lista TODAS las tablas públicas con sus FKs. Usar para comparar contra backup_table_registry y detectar drift.';

-- =============================================================================
-- 4. get_backup_table_list() — lista activa ordenada
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_backup_table_list(
  p_include_excluded BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  table_name          TEXT,
  tier                INTEGER,
  filter_strategy     TEXT,
  parent_table        TEXT,
  parent_foreign_key  TEXT,
  date_column         TEXT,
  excluded_from_restore BOOLEAN,
  exclude_reason      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    table_name,
    tier,
    filter_strategy,
    parent_table,
    parent_foreign_key,
    date_column,
    excluded_from_restore,
    exclude_reason
  FROM public.backup_table_registry
  WHERE (p_include_excluded OR excluded_from_restore = FALSE)
  ORDER BY tier ASC, table_name ASC;
$$;

COMMENT ON FUNCTION public.get_backup_table_list(BOOLEAN) IS
  'Devuelve la lista de tablas para backup/restore en orden topológico. Por defecto excluye las marcadas excluded_from_restore=TRUE.';

-- =============================================================================
-- 5. validate_backup_registry_drift() — comparar registry vs schema real
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_backup_registry_drift()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discovered JSONB;
  v_registered TEXT[];
  v_in_db TEXT[];
  v_missing_in_registry TEXT[];
  v_missing_in_db TEXT[];
BEGIN
  -- Lista real desde information_schema
  SELECT jsonb_agg(t->>'table_name') INTO v_discovered
  FROM jsonb_array_elements(public.discover_backup_tables()) AS t;

  SELECT array_agg(value::text) INTO v_in_db
  FROM jsonb_array_elements_text(v_discovered);

  -- Lista registrada
  SELECT array_agg(table_name) INTO v_registered
  FROM public.backup_table_registry;

  -- Tablas en DB pero no en registry
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::TEXT[]) INTO v_missing_in_registry
  FROM unnest(v_in_db) AS t
  WHERE NOT (t = ANY(v_registered));

  -- Tablas en registry pero no en DB
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::TEXT[]) INTO v_missing_in_db
  FROM unnest(v_registered) AS t
  WHERE NOT (t = ANY(v_in_db));

  RETURN jsonb_build_object(
    'tables_in_db', jsonb_build_array(v_in_db),
    'tables_in_registry', jsonb_build_array(v_registered),
    'missing_in_registry', to_jsonb(v_missing_in_registry),
    'missing_in_db', to_jsonb(v_missing_in_db),
    'drift_detected', jsonb_build_array(v_missing_in_registry) != '[]'::jsonb
                       OR jsonb_build_array(v_missing_in_db) != '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.validate_backup_registry_drift() IS
  'Detecta drift entre el registry y el esquema real. Llamar después de aplicar migrations para validar que el registry esté al día.';

-- =============================================================================
-- 6. validate_post_restore() — ESQUELETO (se completa en Migration 3)
-- =============================================================================
-- Esta función es un esqueleto. En Migration 3 se ampliará con:
--   - Verificación de conteos por tabla
--   - Verificación de inventory.quantity vs backup
--   - Verificación de kardex_entries duplicadas
--   - Verificación de FK integrity
--
-- Por ahora retorna un JSON mínimo para que el contract exista.

CREATE OR REPLACE FUNCTION public.validate_post_restore(
  p_store_id UUID,
  p_backup_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_inventory_count INTEGER;
  v_movements_count INTEGER;
  v_products_count INTEGER;
  v_kardex_count INTEGER;
BEGIN
  -- Conteos básicos
  SELECT COUNT(*) INTO v_inventory_count
  FROM public.inventory WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_movements_count
  FROM public.stock_movements WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_products_count
  FROM public.products WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_kardex_count
  FROM public.kardex_entries WHERE store_id = p_store_id;

  v_result := jsonb_build_object(
    'validated_at', NOW(),
    'store_id', p_store_id,
    'counts', jsonb_build_object(
      'inventory', v_inventory_count,
      'stock_movements', v_movements_count,
      'products', v_products_count,
      'kardex_entries', v_kardex_count
    ),
    'checks', jsonb_build_object(
      'inventory_movements_consistency', NULL,  -- TODO: Migration 3
      'kardex_no_duplicates', NULL,              -- TODO: Migration 3
      'fk_integrity', NULL,                      -- TODO: Migration 3
      'products_stock_current_match', NULL       -- TODO: Migration 3
    ),
    'overall_status', 'PENDING_MIGRATION_3'
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.validate_post_restore(UUID, JSONB) IS
  'Esqueleto de validación post-restore. Se completa en Migration 3 con verificaciones de inventory/kardex/FK.';

-- =============================================================================
-- 7. RLS policies
-- =============================================================================

ALTER TABLE public.backup_table_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restore_sessions ENABLE ROW LEVEL SECURITY;

-- backup_table_registry: lectura para cualquier usuario autenticado del tenant,
-- escritura solo para admin
DROP POLICY IF EXISTS "registry_read_authenticated" ON public.backup_table_registry;
CREATE POLICY "registry_read_authenticated" ON public.backup_table_registry
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "registry_write_admin_only" ON public.backup_table_registry;
CREATE POLICY "registry_write_admin_only" ON public.backup_table_registry
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- restore_sessions: solo usuarios con acceso a la tienda
DROP POLICY IF EXISTS "restore_sessions_store_access" ON public.restore_sessions;
CREATE POLICY "restore_sessions_store_access" ON public.restore_sessions
  FOR ALL TO authenticated
  USING (public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));


-- =============================================================================
-- 8. Seed: 82 tablas en backup_table_registry (con source_of_truth)
-- =============================================================================
-- Generado por scripts/generate_registry_seed_v2.py desde OpenAPI spec real
-- Fecha: 2026-08-02 (v2 — aprobación controlada, incluye source_of_truth)
--
-- Distribución source_of_truth:
--   primary:   13 tablas (inventory, products.stock_current, transfers, etc.)
--   derived:    3 tablas (inventory_batches, inventory_snapshots, abc_classifications)
--   audit:     36 tablas (stock_movements, kardex_entries, transactions, audit_logs)
--   reference: 23 tablas (categories, products, suppliers, customers, etc.)
--   ephemeral:  7 tablas (sync_log, store_notifications, profiles, etc.)

-- Tier 0 [reference]: categories
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('categories', 0, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: report_definitions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('report_definitions', 0, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: saved_analytics_views
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('saved_analytics_views', 0, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: service_types
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('service_types', 0, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: store_cost_templates
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('store_cost_templates', 0, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: store_exchange_rates
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('store_exchange_rates', 0, 'store_id', NULL, NULL, 'rate_date', FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [ephemeral]: store_notifications
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('store_notifications', 0, 'store_id', NULL, NULL, 'created_at', TRUE, 'Notificaciones transitorias — no se restauran', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [primary]: stores
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('stores', 0, 'by_id', NULL, NULL, NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [ephemeral]: sync_log
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('sync_log', 0, 'store_id', NULL, NULL, 'created_at', TRUE, 'Log efímero de sincronización — no se restaura', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: tax_configurations
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('tax_configurations', 0, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 0 [reference]: warehouses
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('warehouses', 0, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [derived]: abc_classifications
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('abc_classifications', 1, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'derived') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [reference]: customers
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('customers', 1, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [reference]: ofertas
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('ofertas', 1, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [audit]: price_change_history
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('price_change_history', 1, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [audit]: price_commit_log
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('price_commit_log', 1, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [reference]: product_cost_sheets
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('product_cost_sheets', 1, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [primary]: product_lots
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('product_lots', 1, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [reference]: product_variants
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('product_variants', 1, 'via_parent', 'products', 'product_id', NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [primary]: products
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('products', 1, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [ephemeral]: profiles
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('profiles', 1, 'store_id', NULL, NULL, NULL, TRUE, 'Multi-store: pertenece a auth.users, no se restaura (active_store_id es global)', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [reference]: suppliers
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('suppliers', 1, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 1 [reference]: workers
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('workers', 1, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [primary]: inventory
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('inventory', 2, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [audit]: inventory_adjustment_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('inventory_adjustment_items', 2, 'via_parent', 'inventory_adjustments', 'adjustment_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [audit]: inventory_adjustments
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('inventory_adjustments', 2, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [derived]: inventory_batches
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('inventory_batches', 2, 'store_id', NULL, NULL, NULL, TRUE, 'Lotes derivados de inventory + product_lots — se recalculan', 'derived') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [primary]: inventory_reservations
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('inventory_reservations', 2, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [derived]: inventory_snapshots
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('inventory_snapshots', 2, 'store_id', NULL, NULL, NULL, TRUE, 'Snapshots derivados — se recalculan', 'derived') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [audit]: kardex_entries
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('kardex_entries', 2, 'store_id', NULL, NULL, 'entry_date', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [audit]: physical_count_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('physical_count_items', 2, 'via_parent', 'physical_counts', 'count_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [audit]: physical_counts
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('physical_counts', 2, 'store_id', NULL, NULL, 'count_date', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [audit]: stock_movements
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('stock_movements', 2, 'store_id', NULL, NULL, 'movement_date', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 2 [primary]: warehouse_stock
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('warehouse_stock', 2, 'store_id', NULL, NULL, 'updated_at', FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: bank_statement_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('bank_statement_items', 3, 'via_parent', 'bank_statements', 'bank_statement_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: bank_statements
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('bank_statements', 3, 'store_id', NULL, NULL, 'statement_date', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: business_events
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('business_events', 3, 'via_entity_id', NULL, NULL, NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: cash_closures
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('cash_closures', 3, 'store_id', NULL, NULL, 'closed_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: cash_movements
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('cash_movements', 3, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [ephemeral]: cash_register_sessions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('cash_register_sessions', 3, 'store_id', NULL, NULL, NULL, TRUE, 'Legacy: reemplazada por cash_sessions — mantener excluida', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [primary]: cash_sessions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('cash_sessions', 3, 'store_id', NULL, NULL, 'opened_at', FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: devolution_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('devolution_items', 3, 'via_parent', 'devolutions', 'devolution_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: devolutions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('devolutions', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: fiscal_closings
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('fiscal_closings', 3, 'store_id', NULL, NULL, 'closed_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: payment_transactions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('payment_transactions', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: purchase_order_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('purchase_order_items', 3, 'via_parent', 'purchase_orders', 'purchase_order_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: purchase_orders
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('purchase_orders', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: quotation_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('quotation_items', 3, 'via_parent', 'quotations', 'quotation_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: quotations
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('quotations', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: receipts
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('receipts', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: received_services
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('received_services', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: sales_transactions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('sales_transactions', 3, 'store_id', NULL, NULL, 'sale_date', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: service_cost_distributions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('service_cost_distributions', 3, 'via_parent', 'received_services', 'received_service_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: service_reception_links
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('service_reception_links', 3, 'via_parent', 'receipts', 'receipt_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: transaction_item_lots
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('transaction_item_lots', 3, 'via_parent', 'transaction_items', 'transaction_item_id', 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: transaction_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('transaction_items', 3, 'via_parent', 'transactions', 'transaction_id', 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 3 [audit]: transactions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('transactions', 3, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [audit]: commission_payments
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('commission_payments', 4, 'store_id', NULL, NULL, 'paid_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [audit]: commission_reception_links
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('commission_reception_links', 4, 'via_parent', 'commission_payments', 'commission_payment_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [reference]: commission_rule_products
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('commission_rule_products', 4, 'via_parent', 'commission_rules', 'rule_id', NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [audit]: commission_rule_versions
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('commission_rule_versions', 4, 'via_parent', 'commission_rules', 'rule_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [reference]: commission_rules
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('commission_rules', 4, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [primary]: production_order_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('production_order_items', 4, 'via_parent', 'production_orders', 'order_id', NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 4 [primary]: production_orders
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('production_orders', 4, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 5 [reference]: transfer_approval_rules
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('transfer_approval_rules', 5, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 5 [primary]: transfer_items
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('transfer_items', 5, 'via_parent', 'transfers', 'transfer_id', NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 5 [primary]: transfers
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('transfers', 5, 'via_origin_dest', NULL, NULL, 'created_at', FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 6 [audit]: audit_events
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('audit_events', 6, 'store_id', NULL, NULL, 'utc_timestamp', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 6 [audit]: audit_logs
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('audit_logs', 6, 'store_id', NULL, NULL, 'created_at', FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 6 [ephemeral]: cost_sheet_templates
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('cost_sheet_templates', 6, 'store_id', NULL, NULL, NULL, TRUE, 'Plantillas globales — no son data de tienda', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 6 [ephemeral]: report_runs
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('report_runs', 6, 'store_id', NULL, NULL, NULL, TRUE, 'Logs de ejecución de reportes — no se restauran', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [reference]: telegram_configs
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('telegram_configs', 7, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [reference]: telegram_contacts
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('telegram_contacts', 7, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [reference]: telegram_invitations
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('telegram_invitations', 7, 'store_id', 'telegram_contacts', 'contact_id', NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [audit]: telegram_messages
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('telegram_messages', 7, 'store_id', 'telegram_contacts', 'contact_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [primary]: user_store_memberships
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('user_store_memberships', 7, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [reference]: whatsapp_configs
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('whatsapp_configs', 7, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [reference]: whatsapp_contacts
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('whatsapp_contacts', 7, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [reference]: whatsapp_invitations
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('whatsapp_invitations', 7, 'store_id', 'whatsapp_contacts', 'contact_id', NULL, FALSE, NULL, 'reference') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [audit]: whatsapp_messages
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('whatsapp_messages', 7, 'store_id', 'whatsapp_contacts', 'contact_id', NULL, FALSE, NULL, 'audit') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 7 [primary]: whatsapp_risk_state
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('whatsapp_risk_state', 7, 'store_id', NULL, NULL, NULL, FALSE, NULL, 'primary') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();

-- Tier 99 [ephemeral]: store_reset_snapshots
INSERT INTO public.backup_table_registry (table_name, tier, filter_strategy, parent_table, parent_foreign_key, date_column, excluded_from_restore, exclude_reason, source_of_truth) VALUES ('store_reset_snapshots', 99, 'store_id', NULL, NULL, NULL, TRUE, 'Metadata de resets previos — no se restaura', 'ephemeral') ON CONFLICT (table_name) DO UPDATE SET tier = EXCLUDED.tier, filter_strategy = EXCLUDED.filter_strategy, parent_table = EXCLUDED.parent_table, parent_foreign_key = EXCLUDED.parent_foreign_key, date_column = EXCLUDED.date_column, excluded_from_restore = EXCLUDED.excluded_from_restore, exclude_reason = EXCLUDED.exclude_reason, source_of_truth = EXCLUDED.source_of_truth, updated_at = NOW();


-- =============================================================================
-- 9. Verificación post-migration
-- =============================================================================

-- Validar que el registry tiene el número esperado de tablas y source_of_truth asignado
DO $$
DECLARE
  v_total INTEGER;
  v_active INTEGER;
  v_excluded INTEGER;
  v_unset INTEGER;
  v_primary INTEGER;
  v_audit INTEGER;
  v_derived INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.backup_table_registry;
  SELECT COUNT(*) INTO v_active FROM public.backup_table_registry WHERE excluded_from_restore = FALSE;
  SELECT COUNT(*) INTO v_excluded FROM public.backup_table_registry WHERE excluded_from_restore = TRUE;
  SELECT COUNT(*) INTO v_unset FROM public.backup_table_registry WHERE source_of_truth = 'unset';
  SELECT COUNT(*) INTO v_primary FROM public.backup_table_registry WHERE source_of_truth = 'primary';
  SELECT COUNT(*) INTO v_audit FROM public.backup_table_registry WHERE source_of_truth = 'audit';
  SELECT COUNT(*) INTO v_derived FROM public.backup_table_registry WHERE source_of_truth = 'derived';

  RAISE NOTICE 'backup_table_registry: % total, % active, % excluded', v_total, v_active, v_excluded;
  RAISE NOTICE 'source_of_truth: % primary, % derived, % audit, % unset', v_primary, v_derived, v_audit, v_unset;

  IF v_total < 70 THEN
    RAISE EXCEPTION 'Registry incompleto: % tablas (esperadas >= 70)', v_total;
  END IF;

  IF v_unset > 0 THEN
    RAISE EXCEPTION 'Hay % tablas con source_of_truth=unset. Todas deben clasificarse antes de BR-2.', v_unset;
  END IF;

  -- Invariantes críticas del modelo de verdad:
  --   inventory debe ser 'primary' (es la fuente de verdad del saldo)
  --   stock_movements debe ser 'audit' (NO se usa para reconstruir inventory)
  --   kardex_entries debe ser 'audit'
  --   products debe ser 'primary' (catálogo + stock_current)
  IF NOT EXISTS (SELECT 1 FROM public.backup_table_registry
                  WHERE table_name = 'inventory' AND source_of_truth = 'primary') THEN
    RAISE EXCEPTION 'Invariante violada: inventory debe tener source_of_truth=primary';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.backup_table_registry
                  WHERE table_name = 'stock_movements' AND source_of_truth = 'audit') THEN
    RAISE EXCEPTION 'Invariante violada: stock_movements debe tener source_of_truth=audit (no primary)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.backup_table_registry
                  WHERE table_name = 'kardex_entries' AND source_of_truth = 'audit') THEN
    RAISE EXCEPTION 'Invariante violada: kardex_entries debe tener source_of_truth=audit';
  END IF;

  RAISE NOTICE 'Invariantes del modelo de verdad verificadas ✓';
END $$;

COMMIT;

-- =============================================================================
-- FIN Migration 1 (v2 — aprobación controlada)
-- =============================================================================
-- Próximos pasos:
--   1. Aplicar esta migration a Supabase Studio SQL Editor
--   2. Verificar: SELECT count(*), source_of_truth FROM backup_table_registry GROUP BY source_of_truth;
--   3. Llamar a validate_backup_registry_drift() para comparar contra schema real
--   4. Si hay drift, agregar tablas faltantes al registry
--   5. Migration 2 (backup-service.ts refactor) ya está aplicada en código
--   6. Ejecutar PT-1, PT-2, PT-3 (scripts/run_pt1_pt3.py)
--   7. Resolver el inventory truth model (docs/BACKUP_RESTORE_INVENTORY_TRUTH_MODEL.md)
--   8. Solo después: BR-2 (Migration 3 — restore RPC + trigger bypass)
-- =============================================================================
