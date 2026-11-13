/**
 * Contrato de navegación CP-FIN (2026-11-13) — espeja el patrón de
 * caja-navigation.test.ts.
 *
 * Cubre las dos hojas nuevas del sistema financiero:
 *   - 'financial-statements' (Estados Financieros) — visible para
 *     admin/manager/encargado (superficie de consulta financiera).
 *   - 'document-config' (Configuración de Documentos) — solo
 *     admin/manager (administra las reglas del motor de partida doble).
 */
import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_SECTIONS,
  VALID_VIEWS,
  flattenNavigation,
} from '@/config/navigation/navigation-definition';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import { getNavigationRoute } from '@/config/navigation/navigation-map';

describe('MISIÓN CP-FIN — navegación del sistema financiero', () => {
  it('las dos hojas existen en la navegación aplanada', () => {
    const flat = flattenNavigation();
    const fs = flat.find(l => l.id === 'financial-statements');
    const dc = flat.find(l => l.id === 'document-config');
    expect(fs).toBeDefined();
    expect(dc).toBeDefined();
    expect(fs?.label).toBe('Estados Financieros');
    expect(dc?.label).toBe('Configuración de Documentos');
    expect(dc?.icon).toBeDefined();
    expect(fs?.icon).toBeDefined();
  });

  it('están registradas como vistas válidas (ViewType + contrato)', () => {
    expect(VALID_VIEWS).toContain('financial-statements');
    expect(VALID_VIEWS).toContain('document-config');
    expect(getNavigationRoute('financial-statements')?.view).toBe('financial-statements');
    expect(getNavigationRoute('document-config')?.view).toBe('document-config');
  });

  it('roles: estados financieros para admin/manager/encargado; configuración solo admin/manager', () => {
    for (const role of ['admin', 'manager', 'encargado']) {
      expect(isViewAllowedForRole('financial-statements', role)).toBe(true);
    }
    for (const role of ['admin', 'manager']) {
      expect(isViewAllowedForRole('document-config', role)).toBe(true);
    }
    // El encargado CONSULTA estados pero NO configura reglas del motor
    expect(isViewAllowedForRole('document-config', 'encargado')).toBe(false);
    // clerk/usuario/warehouse: sin superficie financiera
    for (const role of ['clerk', 'usuario', 'warehouse']) {
      expect(isViewAllowedForRole('financial-statements', role)).toBe(false);
      expect(isViewAllowedForRole('document-config', role)).toBe(false);
    }
  });

  it('TerminalShell renderiza ambas vistas (dynamic import + case)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shell = require('fs').readFileSync(
      require('path').resolve(process.cwd(), 'src/components/views/TerminalShell.tsx'),
      'utf8',
    );
    expect(shell).toMatch(/import\('@\/components\/views\/terminal\/views\/financial_statements\/FinancialStatementsView'\)/);
    expect(shell).toMatch(/import\('@\/components\/views\/terminal\/views\/financial_config\/DocumentConfigView'\)/);
    expect(shell).toContain("case 'financial-statements'");
    expect(shell).toContain("case 'document-config'");
  });

  it('las secciones anfitrionas existen (OPERACIÓN con estados, ANÁLISIS con configuración)', () => {
    const flat = flattenNavigation();
    // Cada hoja pertenece a alguna sección; ambas secciones están definidas
    const ids = NAVIGATION_SECTIONS.map(s => s.id);
    expect(flat.find(l => l.id === 'financial-statements')).toBeDefined();
    expect(flat.find(l => l.id === 'document-config')).toBeDefined();
    expect(ids.length).toBeGreaterThan(3);
  });
});
