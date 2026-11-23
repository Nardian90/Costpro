/**
 * MISIÓN COMPARAR PRODUCTOS 2026-11-23 · Registro oficial de la vista
 * «Comparar Productos» en el árbol de navegación (ANÁLISIS).
 *
 * Antes: la vista solo era alcanzable desde el botón del Ranking Comercial
 * del Inicio — sin registro en la fuente única, el breadcrumb caía en el
 * fallback ("product comparison" + "Módulo No Disponible") aunque la vista
 * estaba implementada. Ahora: hoja de ANÁLISIS con roles explícitos que
 * PRESERVAN el acceso universal efectivo (todos los roles operativos).
 */
import { describe, it, expect } from 'vitest';
import { getBreadcrumbForView } from '@/config/navigation/navigation-map';
import { NAVIGATION_SECTIONS } from '@/config/navigation/navigation-definition';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import { VIEW_TIPS } from '@/config/navigation/view-tips';

const TODOS_LOS_ROLES = ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'] as const;

describe('Comparar Productos — navegación oficial (misión 2026-11-23)', () => {
  it('el breadcrumb deriva del árbol: ANÁLISIS > Comparar Productos (sin inglés ni fallback)', () => {
    const items = getBreadcrumbForView('product-comparison').map((i) => i.label);
    expect(items).toEqual(['ANÁLISIS', 'Comparar Productos']);
    expect(items.some((l) => l === 'Módulo No Disponible')).toBe(false);
    expect(items.some((l) => /product comparison/i.test(l))).toBe(false);
  });

  it('la hoja existe en el árbol ANÁLISIS con label en español', () => {
    const analisis = NAVIGATION_SECTIONS.find((s) => s.id === 'analisis');
    const leaf = analisis?.children?.find((c) => c.id === 'product-comparison');
    expect(leaf).toBeDefined();
    expect(leaf?.label).toBe('Comparar Productos');
    expect(leaf?.type).toBe('item');
  });

  it('roles explícitos preservan el acceso universal efectivo (sin cambio de permisos)', () => {
    const analisis = NAVIGATION_SECTIONS.find((s) => s.id === 'analisis');
    const leaf = analisis?.children?.find((c) => c.id === 'product-comparison');
    expect(leaf?.roles).toEqual([...TODOS_LOS_ROLES]);
    for (const role of TODOS_LOS_ROLES) {
      expect(isViewAllowedForRole('product-comparison', role), role).toBe(true);
    }
  });

  it('tip de la vista en español con la ubicación oficial', () => {
    expect(VIEW_TIPS['product-comparison']).toContain('Comparar Productos');
    expect(VIEW_TIPS['product-comparison']).toContain('Análisis');
  });
});
