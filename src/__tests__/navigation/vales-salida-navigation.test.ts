/**
 * VALES DE SALIDA — Contrato de navegación (vista documental de issue_slips).
 *
 * Verifica el registro COMPLETO de la vista en la fuente única de navegación:
 *   1. La hoja 'vales_salida' vive en OPERACIÓN → Almacén con label EXACTO
 *      "Vales de Salida" (requisito textual del brief).
 *   2. ViewType del store + VALID_VIEWS + viewRegistry + TerminalShell case.
 *   3. La ruta resuelve directa (sin tab) — NAVIGATION_MAP y breadcrumb.
 *   4. El tab móvil Inventario la activa.
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

describe('Vales de Salida — registro en navegación', () => {
  it('1 · la hoja existe en OPERACIÓN → Almacén con label exacto "Vales de Salida"', () => {
    const operacion = NAVIGATION_SECTIONS.find(s => s.id === 'operacion');
    expect(operacion).toBeDefined();
    const almacen = operacion?.children?.find(c => c.id === 'almacen_gestion');
    expect(almacen).toBeDefined();
    expect(almacen?.label).toBe('Almacén');

    const leaf = almacen?.children?.find(c => c.id === 'vales_salida');
    expect(leaf).toBeDefined();
    expect(leaf?.type).toBe('item');
    expect(leaf?.label).toBe('Vales de Salida');

    // Convive con Ajustes Documentales (mismo nivel documental, brief FASE 3)
    expect(almacen?.children?.some(c => c.id === 'inventory_adjustments')).toBe(true);
  });

  it('2 · el ViewType está declarado en el store y en VALID_VIEWS (cero destinos muertos)', () => {
    expect(VALID_VIEWS.has('vales_salida')).toBe(true);
    const leaf = flattenNavigation().find(l => l.id === 'vales_salida');
    expect(leaf).toBeDefined();
  });

  it('3 · NAVIGATION_MAP resuelve la ruta directa y el breadcrumb pasa por Almacén', () => {
    const route = getNavigationRoute('vales_salida');
    expect(route).not.toBeNull();
    expect((route as { type: string }).type).toBe('direct');
    expect((route as { view: string }).view).toBe('vales_salida');

    const breadcrumb = getBreadcrumbForView('vales_salida');
    const labels = breadcrumb.map(b => String(b.label ?? b));
    expect(labels).toContain('Almacén');
    expect(labels.join(' ')).not.toContain('undefined');
  });

  it('4 · el tab móvil Inventario activa la vista', () => {
    const invTab = MOBILE_MAIN_TABS.find(t => t.id === 'inventory');
    expect(invTab?.activeViews).toContain('vales_salida');
  });

  it('5 · viewRegistry declara la vista con acciones documentales', () => {
    const entry = VIEW_REGISTRY.find(v => v.id === 'vales_salida');
    expect(entry).toBeDefined();
    expect(entry?.route).toBe('/?view=vales_salida');
    expect(entry?.actions).toContain('reverse_vale');
  });
});

describe('Vales de Salida — TerminalShell renderiza la vista', () => {
  const shellSource = readFileSync(
    join(process.cwd(), 'src/components/views/TerminalShell.tsx'),
    'utf-8',
  );

  it('6 · el switch de TerminalShell tiene el case + dynamic import de ValesSalidaView', () => {
    expect(shellSource).toContain("case 'vales_salida'");
    expect(shellSource).toContain('views/inventory/ValesSalidaView');
  });

  it('7 · el ViewType del store declara vales_salida', () => {
    const storeSource = readFileSync(join(process.cwd(), 'src/store/index.ts'), 'utf-8');
    expect(storeSource).toContain("'vales_salida'");
  });
});
