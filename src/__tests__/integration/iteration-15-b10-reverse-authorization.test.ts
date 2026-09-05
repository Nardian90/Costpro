/**
 * W9.5 — B-10 · Iteración 15
 *
 * Autorización diferenciada para los 5 tipos restantes de /api/reverse
 * (receipt, transfer, adjustment, devolution, production_order).
 *
 * Fuente normativa: audit-evidence/20260905-w9-b10/02-policy-matrix.md
 * Helper DB único: can_reverse_document(actor, store, operation)
 * Espejo UI: canReverseDocumentInStore (lib/roles.ts)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { canReverseDocumentInStore } from '@/lib/roles';

const MIGRATION = '20260905000002_w9_b10_reverse_document_authorization.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const readSrc = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

type MockUser = { role: any; memberships?: Array<{ store_id: string; role: any; status: string }> };
const uid = (n: string) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STORE_A = uid('a00000000001');
const STORE_B = uid('b00000000001');
const member = (role: string, storeId = STORE_A, status = 'active'): MockUser => ({
  role: 'usuario',
  memberships: [{ store_id: storeId, role, status }],
});

// Roles congelados por tipo (02-policy-matrix.md)
const POLICY: Record<string, string[]> = {
  receipt: ['admin', 'manager', 'encargado', 'warehouse'],
  transfer: ['admin', 'manager', 'encargado', 'warehouse'],
  adjustment: ['admin', 'manager', 'encargado'],
  devolution: ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  production_order: ['admin', 'manager', 'costo'],
};

describe('PT-B10.1 — Matriz espejo UI canReverseDocumentInStore (7 roles × 5 tipos)', () => {
  const ALL = ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'];

  it('cada tipo permite exactamente los roles congelados (membresía activa, misma tienda)', () => {
    for (const [type, allowed] of Object.entries(POLICY)) {
      for (const role of ALL) {
        const expected = allowed.includes(role);
        expect(canReverseDocumentInStore(member(role) as any, STORE_A, type), `${type}/${role}`)
          .toBe(expected);
      }
    }
  });

  it('admin global: transversal en cualquier tienda y tipo (*)', () => {
    const admin: MockUser = { role: 'admin', memberships: [] };
    for (const type of Object.keys(POLICY)) {
      expect(canReverseDocumentInStore(admin as any, STORE_A, type)).toBe(true);
      expect(canReverseDocumentInStore(admin as any, STORE_B, type)).toBe(true);
    }
  });

  it('rol válido en OTRA tienda no autoriza (cross-store DENIED)', () => {
    for (const type of Object.keys(POLICY)) {
      expect(canReverseDocumentInStore(member('warehouse', STORE_B) as any, STORE_A, type)).toBe(false);
    }
  });

  it('membership revocada no autoriza; sin usuario fail-closed', () => {
    expect(canReverseDocumentInStore(member('warehouse', STORE_A, 'revoked') as any, STORE_A, 'receipt')).toBe(false);
    expect(canReverseDocumentInStore(null, STORE_A, 'receipt')).toBe(false);
  });

  it('tipo desconocido → false (fail-closed)', () => {
    expect(canReverseDocumentInStore(member('manager') as any, STORE_A, 'transaction2')).toBe(false);
  });
});

describe('PT-B10.2 — Migración DB: helper único + guards en los 4 RPC + inversión de ajustes', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf-8');

  it('define can_reverse_document (SECURITY DEFINER, search_path endurecido)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text)');
    expect(sql).toContain("SET search_path TO 'pg_catalog', 'public'");
  });

  it('política por operación dentro del helper (fuente única, CASE)', () => {
    expect(sql).toContain("WHEN 'receipt' THEN");
    expect(sql).toContain("WHEN 'transfer' THEN");
    expect(sql).toContain("WHEN 'adjustment' THEN");
    expect(sql).toContain("WHEN 'devolution' THEN");
    expect(sql).toContain("WHEN 'production_order' THEN");
    // rol de membership 'admin' de tienda pasa siempre; sin membresía → false
    expect(sql).toContain("IF v_membership_role = 'admin' THEN RETURN true; END IF;");
    expect(sql).toContain('IF v_membership_role IS NULL THEN RETURN false; END IF;');
  });

  it('receipt: capa de rol tras STORE ACCESS + audit operation aditivo', () => {
    const body = sql.slice(sql.indexOf('public.reverse_receipt_v2(p_receipt_id'));
    expect(body).toContain("public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt')");
    expect(body.indexOf('can_reverse_document')).toBeGreaterThan(body.indexOf('has_store_access_as'));
    expect(body).toContain("'operation', 'ADMIN_REVERSE_RECEIPT'");
  });

  it('transfer: capa de rol en ORIGEN + acceso DESTINO conservado', () => {
    const body = sql.slice(sql.indexOf('public.reverse_transfer(p_transfer_id'));
    expect(body).toContain("ERR_UNAUTHORIZED_DESTINATION");
    expect(body).toContain("public.can_reverse_document(v_caller_uid, v_transfer.origin_store_id, 'transfer')");
    expect(body).toContain("'operation', 'ADMIN_REVERSE_TRANSFER'");
  });

  it('devolution: FOR UPDATE + estado completed + capa normativa + audit NUEVO', () => {
    const body = sql.slice(sql.indexOf('public.reverse_devolution(p_devolution_id'));
    const fu = body.indexOf('FOR UPDATE');
    expect(fu).toBeGreaterThan(-1);
    expect(body).toContain("IF v_dev.status <> 'completed' THEN");
    expect(body).toContain("public.can_reverse_document(v_uid, v_dev.store_id, 'devolution')");
    expect(body).toContain("'REVERSE_DEVOLUTION', 'devolutions'");
    expect(body).toContain("'operation', 'ADMIN_REVERSE_DEVOLUTION'");
  });

  it('production_order: capa de rol admin/manager/costo + audit aditivo', () => {
    const body = sql.slice(sql.indexOf('public.reverse_production_order(p_order_id'));
    expect(body).toContain("public.can_reverse_document(v_caller_uid, v_order.store_id, 'production_order')");
    expect(body).toContain("'operation', 'ADMIN_REVERSE_PRODUCTION_ORDER'");
  });

  it('reverse_inventory_adjustment_v2: inversión verdadera (contra-documento con items intercambiados, -diff)', () => {
    const body = sql.slice(sql.indexOf('public.reverse_inventory_adjustment_v2(p_adjustment_id'));
    expect(body).toContain('FOR UPDATE');
    expect(body).toContain("v_original.status <> 'confirmed'");
    expect(body).toContain("public.can_reverse_document(v_caller_uid, v_original.store_id, 'adjustment')");
    expect(body).toContain('v_item.counted_quantity, v_item.expected_quantity'); // swap
    expect(body).toContain('p_quantity := -v_diff');
    expect(body).toContain("'REVERSE_ADJUSTMENT_V2', 'inventory_adjustments'");
    expect(body).toContain("'operation', 'ADMIN_REVERSE_ADJUSTMENT'");
  });

  it('duplicate_inventory_adjustment_v2 NO fue modificado (botón Duplicar intacto)', () => {
    expect(sql).not.toContain('duplicate_inventory_adjustment_v2(');
  });

  it('ACL endurecido de las funciones nuevas (patrón F06)', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.can_reverse_document\(uuid, uuid, text\) FROM PUBLIC;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reverse_inventory_adjustment_v2\(uuid, text, uuid\) TO service_role;/);
  });

  it('sin DROP destructivos', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|FUNCTION|VIEW|TRIGGER)[^;]*CASCADE/i);
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('PT-B10.3 — API /api/reverse: boundary extendida a los 6 tipos', () => {
  const route = readSrc('src/app/api/reverse/route.ts');

  it('transaction conserva can_admin_reverse_transaction (B-8)', () => {
    expect(route).toContain("'can_admin_reverse_transaction'");
  });

  it('los 5 tipos restantes evalúan can_reverse_document con su operación', () => {
    expect(route).toContain("'can_reverse_document'");
    expect(route).toContain('p_operation: parsed.data.type');
    expect(route).toContain('REVERSE_ENTITY');
    const boundaryPos = route.indexOf('can_reverse_document');
    const rpcPos = route.indexOf('supabase.rpc(mapping.rpc, rpcParams)');
    expect(boundaryPos).toBeGreaterThan(-1);
    expect(rpcPos).toBeGreaterThan(boundaryPos);
  });

  it('deniega con 403 ERR_INSUFFICIENT_ROLE y 404 si el documento no existe', () => {
    expect(route).toContain('ERR_INSUFFICIENT_ROLE');
    expect(route).toContain('ERR_${parsed.data.type.toUpperCase()}_NOT_FOUND');
  });

  it('mapa V2 apunta adjustment a la inversión verdadera', () => {
    expect(route).toContain("adjustment:       { rpc: 'reverse_inventory_adjustment_v2', idParam: 'p_adjustment_id' }");
  });
});

describe('PT-B10.4 — UI: botones Revertir gated por rol espejo', () => {
  const cases: Array<[string, string, string]> = [
    ['src/components/views/terminal/views/receptions/ReceptionsHistoryView.tsx', 'canReverseReceipt', "'receipt'"],
    ['src/components/views/terminal/views/transfers/TransferenciasView.tsx', "canReverseDocumentInStore(user, user?.activeStoreId ?? '', 'transfer')", "'transfer'"],
    ['src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx', 'canReverseAdj', "'adjustment'"],
    ['src/components/views/terminal/views/devolutions/DevolutionsView.tsx', "canReverseDocumentInStore(user, storeId ?? '', 'devolution')", "'devolution'"],
    ['src/components/views/terminal/views/production_orders/ProductionOrdersView.tsx', "canReverseDocumentInStore(user, user?.activeStoreId ?? '', 'production_order')", "'production_order'"],
  ];
  it.each(cases)('%s gated con %s', (file, gate, type) => {
    const src = readSrc(file);
    expect(src).toContain('canReverseDocumentInStore');
    expect(src).toContain(gate);
    expect(src).toContain(type);
  });
});

describe('PT-B10.5 — Documentación coherente con la política B-10', () => {
  it('doc vigente describe la reversión por módulo', () => {
    const doc = readSrc('knowledge/help/04-configuracion/roles-y-permisos.md');
    expect(doc).toContain('Reversión de otros documentos (MODELO B-10)');
    expect(doc).toContain('can_reverse_document');
  });
});
