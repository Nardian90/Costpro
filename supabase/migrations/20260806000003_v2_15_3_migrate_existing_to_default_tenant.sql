-- ============================================================================
-- Migration: 20260806000003_v2_15_3_migrate_existing_to_default_tenant.sql
-- Iteración 13 — Migrate existing stores/profiles to default tenant
-- ============================================================================
-- Crea un "default" tenant y asigna todos los stores y profiles existentes
-- (con tenant_id NULL) a ese tenant. El owner es el primer admin global
-- por created_at.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_default_tenant_id uuid;
  v_first_admin_id uuid;
BEGIN
  -- Verificar si ya existe un default tenant (idempotente)
  SELECT id INTO v_default_tenant_id FROM public.tenants WHERE name = 'Default Tenant' LIMIT 1;

  IF v_default_tenant_id IS NULL THEN
    -- Encontrar el primer admin global por created_at
    SELECT id INTO v_first_admin_id
      FROM public.profiles
      WHERE role = 'admin' AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1;

    -- Si no hay admin, usar el primer profile disponible
    IF v_first_admin_id IS NULL THEN
      SELECT id INTO v_first_admin_id
        FROM public.profiles
        WHERE deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- Crear default tenant
    INSERT INTO public.tenants (id, name, owner_id, plan, subscription_status, is_active)
    VALUES (
      COALESCE(v_default_tenant_id, gen_random_uuid()),
      'Default Tenant',
      v_first_admin_id,
      'enterprise'::plan_t,
      'active',
      true
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_default_tenant_id;

    -- Si ON CONFLICT disparó, re-fetch
    IF v_default_tenant_id IS NULL THEN
      SELECT id INTO v_default_tenant_id FROM public.tenants WHERE name = 'Default Tenant' LIMIT 1;
    END IF;
  END IF;

  -- Migrar profiles con tenant_id NULL
  UPDATE public.profiles SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL AND deleted_at IS NULL;

  -- Migrar stores con tenant_id NULL
  UPDATE public.stores SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  -- Migrar inventory con tenant_id NULL
  UPDATE public.inventory SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  -- Migrar transactions con tenant_id NULL
  UPDATE public.transactions SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  -- Migrar stock_movements con tenant_id NULL
  UPDATE public.stock_movements SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  -- Migrar transfers con tenant_id NULL
  UPDATE public.transfers SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  -- Migrar products con tenant_id NULL
  UPDATE public.products SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  RAISE NOTICE 'Default tenant created/migrated: %', v_default_tenant_id;
END $$;

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- UPDATE public.profiles SET tenant_id = NULL WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'Default Tenant');
-- UPDATE public.stores SET tenant_id = NULL WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'Default Tenant');
-- ... (igual para inventory, transactions, stock_movements, transfers, products)
-- DELETE FROM public.tenants WHERE name = 'Default Tenant';
-- ============================================================================
