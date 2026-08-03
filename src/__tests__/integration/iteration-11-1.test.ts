/**
 * Iteración 11.1 — Pruebas PT-11.1.x
 *
 * Tests para los 12 quick wins críticos del módulo POS.
 * Cubre: C-4, C-5, C-7, H-1, H-2, H-12, H-13, H-14, H-16, M-5, M-7, M-16.
 *
 * Nota: Las pruebas de DB (RLS, RPCs, constraints) requieren una instancia
 * de Supabase con las migraciones aplicadas. Estas pruebas son unit/integration
 * de la lógica frontend + validación de esquema de migraciones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

// ============================================================================
// PT-11.1.1 — C-4: SyncEngine rutea a /api/sync/batch (no /api/pos/checkout)
// ============================================================================
describe('PT-11.1.1 — C-4: SyncEngine offline endpoint fix', () => {
  it('SyncEngine no referencia /api/pos/checkout en código activo (endpoint fantasma)', () => {
    const syncEngineSrc = readFileSync(
      join(process.cwd(), 'src', 'lib', 'sync', 'sync-engine.ts'),
      'utf-8'
    );
    // Filtrar comentarios para verificar que no hay referencias activas
    const activeCode = syncEngineSrc
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
    expect(activeCode).not.toContain('/api/pos/checkout');
    expect(activeCode).not.toContain('/api/pos/payment');
    expect(activeCode).toContain('/api/sync/batch');
  });

  it('SyncEngine no tiene método getEndpointForType (eliminado)', () => {
    const syncEngineSrc = readFileSync(
      join(process.cwd(), 'src', 'lib', 'sync', 'sync-engine.ts'),
      'utf-8'
    );
    expect(syncEngineSrc).not.toContain('getEndpointForType');
  });

  it('SyncEngine.executeOperation envuelve operation en formato batch', () => {
    const syncEngineSrc = readFileSync(
      join(process.cwd(), 'src', 'lib', 'sync', 'sync-engine.ts'),
      'utf-8'
    );
    // Verifica que el payload enviado a /api/sync/batch tiene la estructura
    // { clientInfo, operations: [{ idempotencyKey, entity, operationType, payload }] }
    expect(syncEngineSrc).toContain('clientInfo');
    expect(syncEngineSrc).toContain('operations:');
    expect(syncEngineSrc).toContain('idempotencyKey: operation.idempotencyKey');
    expect(syncEngineSrc).toContain('entity: operation.entity');
  });
});

// ============================================================================
// PT-11.1.2 — C-5: audit_logs INSERT lockdown
// ============================================================================
describe('PT-11.1.2 — C-5: audit_logs INSERT lockdown', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000001_v2_13_1_audit_logs_lockdown.sql'),
    'utf-8'
  );

  it('la migration hace DROP de la policy abierta WITH CHECK (true)', () => {
    expect(migrationFile).toContain('DROP POLICY IF EXISTS "audit_logs_insert_authenticated"');
  });

  it('la migration crea policy restrictiva con user_id = auth.uid()', () => {
    // Buscar líneas con WITH CHECK que NO sean comentarios (-- ...)
    const withCheckLines = migrationFile
      .split('\n')
      .filter(line => line.includes('WITH CHECK') && !line.trim().startsWith('--'));
    expect(withCheckLines.length).toBeGreaterThan(0);
    // La policy activa debe usar user_id = auth.uid()
    const hasRestrictivePolicy = withCheckLines.some(l => l.includes('user_id = auth.uid()'));
    expect(hasRestrictivePolicy).toBe(true);
    // Ninguna línea activa debe tener WITH CHECK (true)
    const hasOpenPolicy = withCheckLines.some(l => l.includes('WITH CHECK (true)'));
    expect(hasOpenPolicy).toBe(false);
  });

  it('la migration tiene sección DOWN clara', () => {
    expect(migrationFile).toContain('DOWN');
    expect(migrationFile).toContain('WITH CHECK (true)');
  });
});

// ============================================================================
// PT-11.1.3 — C-7: void_transaction con conversion_factor
// ============================================================================
describe('PT-11.1.3 — C-7: void_transaction + create_sale conversion_factor', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000002_v2_13_2_void_transaction_conversion_factor.sql'),
    'utf-8'
  );

  it('void_transaction busca conversion_factor de product_variants', () => {
    expect(migrationFile).toContain('SELECT conversion_factor INTO v_conversion_factor');
    expect(migrationFile).toContain('FROM public.product_variants WHERE id = v_item.variant_id');
  });

  it('void_transaction restaura v_units_to_restore = quantity * conversion_factor', () => {
    expect(migrationFile).toContain('v_units_to_restore := v_item.quantity * v_conversion_factor');
  });

  it('void_transaction usa COALESCE para fallback a 1 si no hay variant', () => {
    expect(migrationFile).toContain('v_conversion_factor := COALESCE(v_conversion_factor, 1)');
  });

  it('create_sale también multiplica por conversion_factor (simetría)', () => {
    expect(migrationFile).toContain('v_units_to_deduct := v_qty * v_conversion_factor');
  });

  it('create_sale persiste variant_id en transaction_items (no NULL hardcoded)', () => {
    expect(migrationFile).toContain('v_variant_id := NULLIF(v_item->>\'variant_id\', \'\')::uuid');
    expect(migrationFile).toContain('VALUES (v_tx_id, v_pid, v_variant_id,');
  });

  it('create_sale extrae variant_id del payload JSONB', () => {
    expect(migrationFile).toContain('v_variant_id');
    expect(migrationFile).toContain('product_variants WHERE id = v_variant_id');
  });
});

// ============================================================================
// PT-11.1.4 — H-1: UNIQUE index en transactions.idempotency_key
// ============================================================================
describe('PT-11.1.4 — H-1: transactions idempotency unique index', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000003_v2_13_3_transactions_idempotency_unique.sql'),
    'utf-8'
  );

  it('crea UNIQUE INDEX partial en (idempotency_key, store_id)', () => {
    expect(migrationFile).toContain('CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_store_idx');
    expect(migrationFile).toContain('(idempotency_key, store_id)');
    expect(migrationFile).toContain('WHERE idempotency_key IS NOT NULL');
  });

  it('tiene sección DOWN', () => {
    expect(migrationFile).toContain('DROP INDEX');
  });
});

// ============================================================================
// PT-11.1.5 — H-2: create_sale llama validate_operation_date
// ============================================================================
describe('PT-11.1.5 — H-2: create_sale validate_operation_date', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000004_v2_13_4_create_sale_validate_op_date.sql'),
    'utf-8'
  );

  it('create_sale llama validate_operation_date cuando p_operation_date IS NOT NULL', () => {
    expect(migrationFile).toContain('IF p_operation_date IS NOT NULL THEN');
    expect(migrationFile).toContain('PERFORM public.validate_operation_date(p_operation_date, p_store_id)');
  });

  it('preserva C-7 (conversion_factor + variant_id)', () => {
    expect(migrationFile).toContain('v_conversion_factor');
    expect(migrationFile).toContain('v_units_to_deduct');
    expect(migrationFile).toContain('v_variant_id');
  });
});

// ============================================================================
// PT-11.1.6 — H-12: Kardex usa balance_after del RPC
// ============================================================================
describe('PT-11.1.6 — H-12: Kardex balance_after', () => {
  it('useKardex usa item.balance_after en vez de hardcoded 0', () => {
    const useKardexSrc = readFileSync(
      join(process.cwd(), 'src', 'hooks', 'api', 'useKardex.ts'),
      'utf-8'
    );
    expect(useKardexSrc).not.toMatch(/running_balance:\s*0/);
    expect(useKardexSrc).toContain('running_balance: item.balance_after ?? 0');
  });

  it('KardexModal no recalcula running balance client-side', () => {
    const kardexModalSrc = readFileSync(
      join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'inventory', 'KardexModal.tsx'),
      'utf-8'
    );
    // No debe tener el patrón de recálculo "balance -= reversed[i].quantity_change"
    expect(kardexModalSrc).not.toContain('balance -= reversed');
    // Debe usar data.data directamente
    expect(kardexModalSrc).toContain('return data.data');
  });
});

// ============================================================================
// PT-11.1.7 — H-13: stock_movements inmutable
// ============================================================================
describe('PT-11.1.7 — H-13: stock_movements immutable RLS', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000005_v2_13_5_stock_movements_immutable.sql'),
    'utf-8'
  );

  it('UPDATE policy usa USING (false) para denegar a authenticated', () => {
    expect(migrationFile).toContain('FOR UPDATE TO authenticated');
    expect(migrationFile).toContain('USING (false)');
  });

  it('DELETE policy usa USING (false) para denegar a authenticated', () => {
    expect(migrationFile).toContain('FOR DELETE TO authenticated');
  });

  it('INSERT policy usa WITH CHECK (false) para denegar a authenticated', () => {
    expect(migrationFile).toContain('FOR INSERT TO authenticated');
    expect(migrationFile).toContain('WITH CHECK (false)');
  });

  it('SELECT policy permite lectura a store members', () => {
    expect(migrationFile).toContain('FOR SELECT TO authenticated');
    expect(migrationFile).toContain('has_store_role');
  });
});

// ============================================================================
// PT-11.1.8 — H-14: inventory_reservations expiry
// ============================================================================
describe('PT-11.1.8 — H-14: inventory_reservations expires_at + cleanup', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000006_v2_13_6_inventory_reservations_expiry.sql'),
    'utf-8'
  );

  it('añade columna expires_at con default 24h', () => {
    expect(migrationFile).toContain('ADD COLUMN IF NOT EXISTS expires_at');
    expect(migrationFile).toContain("interval '24 hours'");
  });

  it('crea función release_expired_reservations()', () => {
    expect(migrationFile).toContain('CREATE OR REPLACE FUNCTION public.release_expired_reservations()');
    expect(migrationFile).toContain("SET status = 'RELEASED'");
    expect(migrationFile).toContain("WHERE status = 'ACTIVE' AND expires_at < now()");
  });

  it('la función retorna el count de rows liberadas', () => {
    expect(migrationFile).toContain('RETURNS integer');
    expect(migrationFile).toContain('GET DIAGNOSTICS v_count = ROW_COUNT');
    expect(migrationFile).toContain('RETURN v_count');
  });

  it('tiene sección DOWN', () => {
    expect(migrationFile).toContain('DROP FUNCTION IF EXISTS public.release_expired_reservations()');
    expect(migrationFile).toContain('DROP COLUMN IF EXISTS expires_at');
  });
});

// ============================================================================
// PT-11.1.9 — H-16: useSalesCatalog envía p_idempotency_key
// ============================================================================
describe('PT-11.1.9 — H-16: useSalesCatalog idempotency_key', () => {
  it('useSalesCatalog genera p_idempotency_key con crypto.randomUUID()', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'pos', 'useSalesCatalog.ts'),
      'utf-8'
    );
    expect(src).toContain('p_idempotency_key');
    expect(src).toContain('crypto.randomUUID()');
    expect(src).toContain('sale-');
  });
});

// ============================================================================
// PT-11.1.10 — M-5: get_products_for_pos con LIMIT
// ============================================================================
describe('PT-11.1.10 — M-5: get_products_for_pos LIMIT', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000007_v2_13_7_get_products_for_pos_limit.sql'),
    'utf-8'
  );

  it('añade parámetros p_limit y p_offset', () => {
    expect(migrationFile).toContain('p_limit integer DEFAULT 500');
    expect(migrationFile).toContain('p_offset integer DEFAULT 0');
  });

  it('clampa p_limit entre 1 y 5000', () => {
    expect(migrationFile).toContain('LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000)');
  });

  it('clampa p_offset a mínimo 0', () => {
    expect(migrationFile).toContain('GREATEST(COALESCE(p_offset, 0), 0)');
  });

  it('aplica LIMIT v_limit OFFSET v_offset en el RETURN QUERY', () => {
    expect(migrationFile).toContain('LIMIT v_limit OFFSET v_offset');
  });
});

// ============================================================================
// PT-11.1.11 — M-7: Índice en transaction_items.transaction_id
// ============================================================================
describe('PT-11.1.11 — M-7: transaction_items index', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000008_v2_13_8_transaction_items_index.sql'),
    'utf-8'
  );

  it('crea índice en transaction_items(transaction_id)', () => {
    expect(migrationFile).toContain('CREATE INDEX IF NOT EXISTS transaction_items_transaction_id_idx');
    expect(migrationFile).toContain('ON public.transaction_items (transaction_id)');
  });

  it('tiene sección DOWN', () => {
    expect(migrationFile).toContain('DROP INDEX IF EXISTS public.transaction_items_transaction_id_idx');
  });
});

// ============================================================================
// PT-11.1.12 — M-16: transfer_status enum REVERSADA
// ============================================================================
describe('PT-11.1.12 — M-16: transfer_status REVERSADA', () => {
  const migrationFile = readFileSync(
    join(MIGRATIONS_DIR, '20260803000009_v2_13_9_transfer_status_reversada.sql'),
    'utf-8'
  );

  it('hace ALTER TYPE ADD VALUE IF NOT EXISTS REVERSADA', () => {
    expect(migrationFile).toContain("ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'REVERSADA'");
  });
});

// ============================================================================
// PT-11.1.13 — Feature flag USE_V2_CHECKOUT
// ============================================================================
describe('PT-11.1.13 — Feature flag USE_V2_CHECKOUT', () => {
  it('src/config/features.ts existe y exporta FEATURES', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'config', 'features.ts'),
      'utf-8'
    );
    expect(src).toContain('USE_V2_CHECKOUT');
    expect(src).toContain('false');
  });

  it('USE_V2_CHECKOUT default es false (no activo en 11.1)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'config', 'features.ts'),
      'utf-8'
    );
    // Debe default a false a menos que NEXT_PUBLIC_USE_V2_CHECKOUT=true
    expect(src).toContain("process.env.NEXT_PUBLIC_USE_V2_CHECKOUT === 'true' || false");
  });
});

// ============================================================================
// PT-11.1.14 — Inventario de migraciones creadas
// ============================================================================
describe('PT-11.1.14 — Todas las migraciones de 11.1 existen', () => {
  const expectedMigrations = [
    '20260803000001_v2_13_1_audit_logs_lockdown.sql',
    '20260803000002_v2_13_2_void_transaction_conversion_factor.sql',
    '20260803000003_v2_13_3_transactions_idempotency_unique.sql',
    '20260803000004_v2_13_4_create_sale_validate_op_date.sql',
    '20260803000005_v2_13_5_stock_movements_immutable.sql',
    '20260803000006_v2_13_6_inventory_reservations_expiry.sql',
    '20260803000007_v2_13_7_get_products_for_pos_limit.sql',
    '20260803000008_v2_13_8_transaction_items_index.sql',
    '20260803000009_v2_13_9_transfer_status_reversada.sql',
  ];

  for (const filename of expectedMigrations) {
    it(`${filename} existe`, () => {
      const files = readdirSync(MIGRATIONS_DIR);
      expect(files).toContain(filename);
    });
  }
});

// ============================================================================
// PT-11.1.15 — Cada migration tiene sección DOWN
// ============================================================================
describe('PT-11.1.15 — Todas las migraciones tienen sección DOWN', () => {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.startsWith('20260803') && f.endsWith('.sql'));

  for (const filename of migrationFiles) {
    it(`${filename} tiene sección DOWN documentada`, () => {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      expect(content).toContain('DOWN');
    });
  }
});
