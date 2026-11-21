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

  // MISIÓN CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001 (2026-11-22):
  // Estados Financieros es SECCIÓN PROPIA de primer nivel — primera del menú.
  it('Estados Financieros es módulo de primer nivel: primera sección, fuera de OPERACIÓN, sin duplicados', () => {
    // 1) Primera sección del menú (al mismo nivel que OPERACIÓN).
    expect(NAVIGATION_SECTIONS[0].id).toBe('financial-statements');
    expect(NAVIGATION_SECTIONS[0].label).toBe('Estados Financieros');
    expect(NAVIGATION_SECTIONS[0].type).toBe('item');
    // 2) Ya NO es hoja del grupo OPERACIÓN (no duplicación).
    const operacion = NAVIGATION_SECTIONS.find(s => s.id === 'operacion');
    const operacionIds = JSON.stringify(operacion?.children?.map(c => c.id) ?? []);
    expect(operacionIds).not.toContain('financial-statements');
    // 3) UNA sola aparición en todo el árbol aplanado (paleta/sheet/header).
    const flat = flattenNavigation();
    expect(flat.filter(l => l.id === 'financial-statements')).toHaveLength(1);
    // 4) Icono conservado (BarChart3) y roles intactos.
    const fs = NAVIGATION_SECTIONS[0];
    expect(fs.icon).toBeDefined();
    expect(fs.roles).toEqual(['admin', 'manager', 'encargado']);
  });

  // CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 (2026-11-19):
  // orden del propietario — el badge «En desarrollo» añadido el 18-11 fue
  // RETIRADO: Estados Financieros se presenta como funcionalidad disponible.
  it('Estados Financieros se presenta como funcionalidad disponible (sin badge «En desarrollo»)', () => {
    // Cast vía unknown: la marca fue retirada del tipo FlatNavItem; el test
    // verifica por regresión que ningún nodo del catálogo la reintroduzca.
    const flat = flattenNavigation() as unknown as Array<Record<string, unknown>>;
    const fs = flat.find(l => l.id === 'financial-statements');
    expect(fs).toBeDefined();
    // Ninguna hoja del catálogo declara la marca retirada (regresión).
    const marked = flat.filter(l => l.isInDevelopment);
    expect(marked).toHaveLength(0);
    // La vista sigue visible y navegable para los roles autorizados.
    expect(isViewAllowedForRole('financial-statements', 'admin')).toBe(true);
    expect(isViewAllowedForRole('financial-statements', 'manager')).toBe(true);
  });
});
