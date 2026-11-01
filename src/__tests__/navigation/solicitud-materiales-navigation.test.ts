/**
 * SOLICITUD DE MATERIALES — Contrato de navegación (MISIÓN RESOLUCIÓN 11,
 * 2026-10-31 · Modelo SC-2-07 «Solicitud de Entrega», Res. 11/2007 MFP).
 *
 * Verifica el registro COMPLETO de la vista en la fuente única de navegación:
 *   1. La hoja 'solicitud_materiales' vive en OPERACIÓN → Almacén con label
 *      EXACTO "Solicitud de Materiales" (requisito textual de la misión).
 *   2. ViewType del store + VALID_VIEWS + viewRegistry + TerminalShell case.
 *   3. La ruta resuelve directa (sin tab) — NAVIGATION_MAP y breadcrumb.
 *   4. El tab móvil Inventario la activa.
 *   5. Coexistencia documental: convive con Ajustes Documentales y Vales de
 *      Salida (mismo nivel del menú Almacén, sin duplicidades).
 *
 * La integridad global (cero destinos muertos, palette, sidebar derivado) ya
 * la exige gate1-navigation.test.ts; aquí se ancla el contrato específico.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NAVIGATION_SECTIONS,
  VALID_VIEWS,
  MOBILE_MAIN_TABS,
  flattenNavigation,
} from '@/config/navigation/navigation-definition';
import { getNavigationRoute, getBreadcrumbForView } from '@/config/navigation/navigation-map';
import { VIEW_REGISTRY } from '@/config/viewRegistry';

describe('Solicitud de Materiales — registro en navegación', () => {
  it('1 · la hoja existe en OPERACIÓN → Almacén con label exacto "Solicitud de Materiales"', () => {
    const operacion = NAVIGATION_SECTIONS.find(s => s.id === 'operacion');
    expect(operacion).toBeDefined();
    const almacen = operacion?.children?.find(c => c.id === 'almacen_gestion');
    expect(almacen).toBeDefined();
    expect(almacen?.label).toBe('Almacén');

    const leaf = almacen?.children?.find(c => c.id === 'solicitud_materiales');
    expect(leaf).toBeDefined();
    expect(leaf?.type).toBe('item');
    expect(leaf?.label).toBe('Solicitud de Materiales');
    // Roles operativos del almacén (mismos que Vales de Salida).
    expect(leaf?.roles).toEqual(['admin', 'manager', 'encargado', 'warehouse', 'clerk', 'usuario']);

    // Convive con Ajustes Documentales y Vales de Salida (mismo nivel documental).
    expect(almacen?.children?.some(c => c.id === 'inventory_adjustments')).toBe(true);
    expect(almacen?.children?.some(c => c.id === 'vales_salida')).toBe(true);
  });

  it('2 · el ViewType está declarado en el store y en VALID_VIEWS (cero destinos muertos)', () => {
    expect(VALID_VIEWS.has('solicitud_materiales')).toBe(true);
    const leaf = flattenNavigation().find(l => l.id === 'solicitud_materiales');
    expect(leaf).toBeDefined();
  });

  it('3 · NAVIGATION_MAP resuelve la ruta directa y el breadcrumb pasa por Almacén', () => {
    const route = getNavigationRoute('solicitud_materiales');
    expect(route).not.toBeNull();
    expect((route as { type: string }).type).toBe('direct');
    expect((route as { view: string }).view).toBe('solicitud_materiales');

    const breadcrumb = getBreadcrumbForView('solicitud_materiales');
    const labels = breadcrumb.map(b => String(b.label ?? b));
    expect(labels).toContain('Almacén');
    expect(labels.join(' ')).not.toContain('undefined');
  });

  it('4 · el tab móvil Inventario activa la vista', () => {
    const invTab = MOBILE_MAIN_TABS.find(t => t.id === 'inventory');
    expect(invTab?.activeViews).toContain('solicitud_materiales');
  });

  it('5 · viewRegistry declara la vista con las acciones del flujo documental', () => {
    const entry = VIEW_REGISTRY.find(v => v.id === 'solicitud_materiales');
    expect(entry).toBeDefined();
    expect(entry?.route).toBe('/?view=solicitud_materiales');
    for (const action of ['create_request', 'submit_review', 'confirm_request', 'void_request']) {
      expect(entry?.actions).toContain(action);
    }
  });
});

describe('Solicitud de Materiales — TerminalShell renderiza la vista', () => {
  const shellSource = readFileSync(
    join(process.cwd(), 'src/components/views/TerminalShell.tsx'),
    'utf-8',
  );

  it('importa MaterialRequestsView con dynamic() ssr:false (patrón del shell)', () => {
    expect(shellSource).toMatch(
      /const MaterialRequestsView = dynamic\(\(\) => import\('@\/components\/views\/terminal\/views\/inventory\/MaterialRequestsView'\), \{ ssr: false \}\);/
    );
  });

  it('el switch de vistas tiene el case con ViewErrorBoundary', () => {
    expect(shellSource).toMatch(
      /case 'solicitud_materiales': return <ViewErrorBoundary viewName="Solicitud de Materiales"><MaterialRequestsView \/><\/ViewErrorBoundary>;/
    );
  });
});

describe('Solicitud de Materiales — badge de estado documental', () => {
  it('DocumentStatusBadge declara el tipo material_request con los 4 estados', async () => {
    const badgeSource = readFileSync(
      join(process.cwd(), 'src/components/ui/DocumentStatusBadge.tsx'),
      'utf-8',
    );
    expect(badgeSource).toMatch(/material_request: \{/);
    expect(badgeSource).toMatch(/draft:\s*\{ label: 'Borrador'/);
    expect(badgeSource).toMatch(/in_review:\s*\{ label: 'En Revisión'/);
    expect(badgeSource).toMatch(/confirmed:\s*\{ label: 'Confirmada'/);
    expect(badgeSource).toMatch(/voided:\s*\{ label: 'Anulada'/);
    // El vale gana el estado pending (En Revisión) — misma misión.
    expect(badgeSource).toMatch(/pending:\s*\{ label: 'En Revisión', icon: Clock/);
  });
});

describe('Solicitud de Materiales — autorización de la confirmación (dato 7)', () => {
  it('roles.ts exporta canConfirmMaterialRequestInStore (admin/manager/encargado)', async () => {
    const roles = await import('@/lib/roles');
    expect(typeof roles.canConfirmMaterialRequestInStore).toBe('function');
    // Admin global transversal.
    expect(roles.canConfirmMaterialRequestInStore({ role: 'admin' }, 'store-1')).toBe(true);
    expect(roles.canConfirmMaterialRequestInStore({ role: 'superadmin' }, 'store-1')).toBe(true);
    // Miembro activo con rol autorizado EN ESA tienda.
    expect(roles.canConfirmMaterialRequestInStore({
      role: 'clerk',
      memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }],
    }, 'store-1')).toBe(true);
    // Miembro de OTRA tienda o rol insuficiente → false.
    expect(roles.canConfirmMaterialRequestInStore({
      role: 'clerk',
      memberships: [{ store_id: 'store-2', role: 'manager', status: 'active' }],
    }, 'store-1')).toBe(false);
    expect(roles.canConfirmMaterialRequestInStore({
      role: 'clerk',
      memberships: [{ store_id: 'store-1', role: 'clerk', status: 'active' }],
    }, 'store-1')).toBe(false);
    // Sin membership activa → false.
    expect(roles.canConfirmMaterialRequestInStore({
      role: 'clerk',
      memberships: [{ store_id: 'store-1', role: 'manager', status: 'revoked' }],
    }, 'store-1')).toBe(false);
  });
});
