/**
 * W9.5 — B-8 · MODELO C — Iteración 14
 *
 * Política de autorización diferenciada para anulaciones/reversiones de ventas:
 *
 *   NIVEL 1 — POS Undo ("Deshacer", ventana 30s, venta propia, flujo POS):
 *     DB:  void_transaction + can_pos_undo_transaction
 *     UI:  usePOSCheckout (toast gated con canUndoSaleInStore)
 *     RBAC: canUndoSales = admin/manager/encargado/clerk
 *
 *   NIVEL 2 — Reversión administrativa ("Revertir", sin ventana, venta ajena OK):
 *     DB:  reverse_transaction_v2 + can_admin_reverse_transaction
 *     API: /api/reverse boundary (type='transaction')
 *     UI:  SalesHistoryView botón gated con canAdminReverseSaleInStore
 *     RBAC: canReverseSales = admin/manager/encargado
 *
 * Fuente normativa: audit-evidence/20260905-w9-b8-impl/01-policy-matrix.md
 * Este test congela la política: si alguien la rompe en cualquiera de las
 * capas, la suite falla.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { canUndoSaleInStore, canAdminReverseSaleInStore } from '@/lib/roles';
import { ROLE_PERMISSIONS } from '@/types';

const MIGRATION = '20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const readSrc = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

// ═══════════════════════════════════════════════════════════════════
// Helpers de usuario para tests unitarios de los espejos UI
// ═══════════════════════════════════════════════════════════════════
type MockUser = {
  role: ReturnType<typeof String> extends never ? never : any;
  memberships?: Array<{ store_id: string; role: any; status: string }>;
};

const uid = (n: string) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STORE_A = uid('a00000000001');
const STORE_B = uid('b00000000001');

const member = (role: string, storeId = STORE_A, status = 'active'): MockUser => ({
  role: 'usuario', // rol global sin privilegio: lo que manda es la membership
  memberships: [{ store_id: storeId, role, status }],
});

describe('PT-B8.1 — MODELO C Nivel 1: canUndoSaleInStore (espejo UI de can_pos_undo_transaction)', () => {
  it('admin global: true en cualquier tienda (alcance transversal *)', () => {
    const user: MockUser = { role: 'admin', memberships: [] };
    expect(canUndoSaleInStore(user as any, STORE_A)).toBe(true);
    expect(canUndoSaleInStore(user as any, STORE_B)).toBe(true);
  });

  it('membership activa con rol operativo POS: admin/manager/encargado/clerk → true', () => {
    for (const role of ['admin', 'manager', 'encargado', 'clerk']) {
      expect(canUndoSaleInStore(member(role) as any, STORE_A)).toBe(true);
    }
  });

  it('membership activa con rol NO operativo: warehouse/usuario/costo → false', () => {
    for (const role of ['warehouse', 'usuario', 'costo']) {
      expect(canUndoSaleInStore(member(role) as any, STORE_A)).toBe(false);
    }
  });

  it('rol POS en OTRA tienda no autoriza (misma-tienda estricta)', () => {
    expect(canUndoSaleInStore(member('clerk', STORE_B) as any, STORE_A)).toBe(false);
  });

  it('membership revocada no autoriza', () => {
    expect(canUndoSaleInStore(member('clerk', STORE_A, 'revoked') as any, STORE_A)).toBe(false);
  });

  it('sin usuario/tienda → false (fail-closed)', () => {
    expect(canUndoSaleInStore(null, STORE_A)).toBe(false);
    expect(canUndoSaleInStore(member('clerk') as any, '')).toBe(false);
  });
});

describe('PT-B8.2 — MODELO C Nivel 2: canAdminReverseSaleInStore (espejo UI de can_admin_reverse_transaction)', () => {
  it('admin global: true en cualquier tienda (alcance transversal *)', () => {
    const user: MockUser = { role: 'admin', memberships: [] };
    expect(canAdminReverseSaleInStore(user as any, STORE_A)).toBe(true);
    expect(canAdminReverseSaleInStore(user as any, STORE_B)).toBe(true);
  });

  it('membership admin/manager/encargado → true (venta ajena permitida, sin ventana)', () => {
    for (const role of ['admin', 'manager', 'encargado']) {
      expect(canAdminReverseSaleInStore(member(role) as any, STORE_A)).toBe(true);
    }
  });

  it('clerk NUNCA puede reversión administrativa (aunque sea miembro activo)', () => {
    expect(canAdminReverseSaleInStore(member('clerk') as any, STORE_A)).toBe(false);
  });

  it('warehouse/usuario/costo → false', () => {
    for (const role of ['warehouse', 'usuario', 'costo']) {
      expect(canAdminReverseSaleInStore(member(role) as any, STORE_A)).toBe(false);
    }
  });

  it('manager de otra tienda → false (cross-store DENIED)', () => {
    expect(canAdminReverseSaleInStore(member('manager', STORE_B) as any, STORE_A)).toBe(false);
  });

  it('membership revocada no autoriza; null fail-closed', () => {
    expect(canAdminReverseSaleInStore(member('manager', STORE_A, 'revoked') as any, STORE_A)).toBe(false);
    expect(canAdminReverseSaleInStore(null, STORE_A)).toBe(false);
  });
});

describe('PT-B8.3 — Matriz RBAC estática (types): canUndoSales / canReverseSales', () => {
  const expected = {
    admin: { undo: true, reverse: true },
    manager: { undo: true, reverse: true },
    encargado: { undo: true, reverse: true },
    clerk: { undo: true, reverse: false },
    warehouse: { undo: false, reverse: false },
    usuario: { undo: false, reverse: false },
    costo: { undo: false, reverse: false },
  } as const;

  it('valores exactos por rol (7 roles)', () => {
    for (const [role, vals] of Object.entries(expected)) {
      const perms = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
      expect(perms.canUndoSales, `canUndoSales[${role}]`).toBe(vals.undo);
      expect(perms.canReverseSales, `canReverseSales[${role}]`).toBe(vals.reverse);
    }
  });

  it('el flag ambiguo legacy canVoidTransactions ya no existe', () => {
    expect('canVoidTransactions' in ROLE_PERMISSIONS.admin).toBe(false);
  });
});

describe('PT-B8.4 — Migración DB: helpers normativos + guards en los RPC', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf-8');

  it('define can_pos_undo_transaction (SECURITY DEFINER, search_path endurecido)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_pos_undo_transaction(p_transaction_id uuid, p_actor uuid)');
    expect(sql).toContain("SET search_path TO 'pg_catalog', 'public'");
  });

  it('define can_admin_reverse_transaction (SECURITY DEFINER)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_admin_reverse_transaction(p_actor uuid, p_store_id uuid)');
  });

  it('Nivel 1: ownership + ventana 30s + estado completed + rol POS por membership', () => {
    expect(sql).toContain("v_tx.seller_id <> p_actor");
    expect(sql).toContain("INTERVAL '30 seconds'");
    expect(sql).toContain("v_tx.status <> 'completed'");
    expect(sql).toContain("IN ('admin','manager','encargado','clerk')");
  });

  it('Nivel 2: rol admin/manager/encargado por tienda de la venta (patrón canManageStore)', () => {
    expect(sql).toContain("IN ('admin','manager','encargado')");
    expect(sql).toContain("m.status = 'active'");
  });

  it('void_transaction invoca la política única y conserva FOR UPDATE como 1ª lectura', () => {
    const voidBody = sql.slice(sql.indexOf('public.void_transaction(p_transaction_id'));
    expect(voidBody).toContain('public.can_pos_undo_transaction(p_transaction_id, v_caller_uid)');
    const forUpdatePos = voidBody.indexOf('FOR UPDATE');
    const helperPos = voidBody.indexOf('can_pos_undo_transaction(p_transaction_id');
    expect(forUpdatePos).toBeGreaterThan(-1);
    expect(helperPos).toBeGreaterThan(forUpdatePos);
  });

  it('reverse_transaction_v2 invoca la política única y conserva FOR UPDATE + idempotencia', () => {
    const v2Body = sql.slice(sql.indexOf('public.reverse_transaction_v2(p_transaction_id'));
    expect(v2Body).toContain('public.can_admin_reverse_transaction(v_caller_uid, v_tx.store_id)');
    expect(v2Body.indexOf('FOR UPDATE')).toBeGreaterThan(-1);
    expect(v2Body).toContain("'idempotent'");
    expect(v2Body).toContain('ERR_INVALID_STATUS');
  });

  it('audit distinguible: metadata.operation = POS_UNDO / ADMIN_REVERSE (aditivo)', () => {
    expect(sql).toContain("'operation', 'POS_UNDO'");
    expect(sql).toContain("'operation', 'ADMIN_REVERSE'");
    expect(sql).toContain("'old_status', v_tx.status, 'new_status', 'voided'");
  });

  it('ACL endurecido de los helpers: sin PUBLIC/anon/authenticated; service_role sí', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.can_pos_undo_transaction\(uuid, uuid\) FROM PUBLIC;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.can_pos_undo_transaction\(uuid, uuid\) FROM authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.can_admin_reverse_transaction\(uuid, uuid\) TO service_role;/);
  });

  it('sin DROP destructivos', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|FUNCTION|VIEW|TRIGGER)[^;]*CASCADE/i);
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('PT-B8.5 — API /api/reverse: authorization boundary para ventas', () => {
  const route = readSrc('src/app/api/reverse/route.ts');

  it('evalúa can_admin_reverse_transaction para type=transaction ANTES del RPC', () => {
    expect(route).toContain("parsed.data.type === 'transaction'");
    expect(route).toContain("'can_admin_reverse_transaction'");
    const boundaryPos = route.indexOf('can_admin_reverse_transaction');
    const rpcPos = route.indexOf('supabase.rpc(mapping.rpc, rpcParams)');
    expect(boundaryPos).toBeGreaterThan(-1);
    expect(rpcPos).toBeGreaterThan(boundaryPos);
  });

  it('deniega con 403 ERR_INSUFFICIENT_ROLE', () => {
    expect(route).toContain('ERR_INSUFFICIENT_ROLE');
  });

  it('los demás tipos: boundary extendida por B-10 (can_reverse_document por tipo)', () => {
    // W9.5 B-10 ejecutó el backlog que este test registraba: la boundary ahora
    // cubre receipt/transfer/adjustment/devolution/production_order vía
    // can_reverse_document(actor, store, type).
    expect(route).toContain("'can_reverse_document'");
    expect(route).toContain('REVERSE_ENTITY');
  });
});

describe('PT-B8.6 — UI: un solo flujo por operación, sin gates muertos', () => {
  it('useSalesHistoryView: flujo void legacy eliminado (sin import/uso del hook de inversión)', () => {
    const hook = readSrc('src/components/views/terminal/views/sales/useSalesHistoryView.ts');
    expect(hook).not.toMatch(/from '@\/hooks\/api\/useDocumentActions'/);
    expect(hook).not.toContain('invertDocumentMutation');
    expect(hook).not.toContain('handleRequestVoid');
    expect(hook).not.toContain('handleConfirmVoid');
    expect(hook).not.toContain('canVoidTransactions');
  });

  it('SalesHistoryView: botón Revertir gated por rol administrativo', () => {
    const view = readSrc('src/components/views/terminal/views/sales/SalesHistoryView.tsx');
    expect(view).toContain('canAdminReverseSaleInStore');
    expect(view).toContain('canReverseTx && canAdminReverseTx');
  });

  it('usePOSCheckout: toast Deshacer gated por rol POS (30s, venta propia)', () => {
    const pos = readSrc('src/components/views/terminal/views/pos/usePOSCheckout.ts');
    expect(pos).toContain('canUndoSaleInStore(user, storeIdForUndo)');
    expect(pos).toContain('duration: 30000');
  });

  it('documentación vigente describe MODELO C y la histórica está supersesada', () => {
    const vigente = readSrc('knowledge/help/04-configuracion/roles-y-permisos.md');
    expect(vigente).toContain('canUndoSales');
    expect(vigente).toContain('canReverseSales');
    expect(vigente).toContain('MODELO C');
    const historica = readSrc('knowledge/help/03-referencia/02-roles-permisos.md');
    expect(historica).toContain('SUPERSEDADO');
  });
});
