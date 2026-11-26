/**
 * CP-BRA-INV005-FIN011-CLOSURE-001 — Línea A (R-05), caso 14 de la misión §2.6:
 * coherencia entre UI y RPC. La interfaz debe aplicar EXACTAMENTE la misma
 * política de autorización que el servidor (pero la UI nunca es el control:
 * la última barrera es el RPC — mig 20261126170000).
 *
 * Verifica estáticamente que:
 *   1. Ambas vistas de confirmación (Ajustes Documentales tarjetas+tabla y el
 *      panel de Ajustes de Inventario Físico) gatean la acción Confirmar.
 *   2. El gate usa la función canónica canReverseDocumentInStore(…,
 *      'adjustment') cuyos roles (admin|manager|encargado) son el espejo
 *      EXACTO del guard server-side has_store_role_as(ARRAY['admin','manager',
 *      'encargado']).
 *   3. Ambos llamadores del RPC mapean ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED
 *      a un mensaje comprensible (misión §2.5).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ADJ_VIEW = readFileSync(
  resolve(process.cwd(), 'src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx'),
  'utf8',
);
const PI_DETAIL = readFileSync(
  resolve(process.cwd(), 'src/components/views/terminal/views/physical_inventory/PhysicalInventoryDetail.tsx'),
  'utf8',
);
const ROLES_LIB = readFileSync(resolve(process.cwd(), 'src/lib/roles.ts'), 'utf8');

describe('R-05 caso 14 — coherencia UI ↔ RPC para confirmar ajustes', () => {
  it('InventoryAdjustmentsView: canConfirmAdj con la función canónica (roles admin|manager|encargado)', () => {
    expect(ADJ_VIEW).toContain(
      "const canConfirmAdj = canReverseDocumentInStore(user, storeId ?? '', 'adjustment');",
    );
    // Ambos modos de vista (tarjetas y tabla) gatean la acción
    expect((ADJ_VIEW.match(/canConfirmAdj/g) || []).length).toBeGreaterThanOrEqual(3);
    // El botón deshabilitado lleva mensaje comprensible
    expect(ADJ_VIEW).toContain('No autorizado: la confirmación requiere rol de gestión');
  });

  it('PhysicalInventoryDetail: el panel recibe el gate del padre (canAuthorize) y lo aplica', () => {
    expect(PI_DETAIL).toContain('canConfirm={canAuthorize}');
    expect(PI_DETAIL).toContain('canConfirm = false');
    expect(PI_DETAIL).toContain('Confirmación restringida a gestión');
    // canAuthorize del padre = admin|manager|encargado (espejo server-side)
    expect(PI_DETAIL).toContain("['admin', 'manager', 'encargado'].includes(m?.role || '')");
  });

  it('manejo de error accionable en ambos llamadores del RPC', () => {
    expect((ADJ_VIEW.match(/ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((PI_DETAIL.match(/ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('el conjunto de roles del frontend es el espejo EXACTO del guard server-side', () => {
    // DOCUMENT_REVERSE_ROLES.adjustment en src/lib/roles.ts
    expect(ROLES_LIB).toContain("adjustment: ['admin', 'manager', 'encargado']");
    // Guard server-side en la migración 20261126170000
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql'),
      'utf8',
    );
    expect(sql).toContain("ARRAY['admin','manager','encargado']::text[]");
  });

  it('la UI mantiene la consulta del ajuste sin permitir confirmarlo (leer ≠ confirmar)', () => {
    // El botón deshabilitado sigue visible (no se oculta la capacidad de ver)
    expect(ADJ_VIEW).toContain('aria-label="Confirmar ajuste no disponible: requiere rol de gestión"');
    // El botón Anular/Revertir no cambió de política (alcance: solo confirmar)
    expect(ADJ_VIEW).toContain('Anular ajuste (sin efecto en stock)');
  });
});
