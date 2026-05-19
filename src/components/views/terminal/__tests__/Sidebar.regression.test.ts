import { SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
import { SYSTEM_ACTIONS, getActionsForUser } from '@/config/actions';
import { describe, it, expect } from 'vitest';

// Helper: find a module id recursively in the tree
const findDeep = (mods: any[], id: string): boolean =>
  mods.some(
    (m) => m.id === id || (m.children && findDeep(m.children, id))
  );

// Helper: get all top-level group IDs
const getTopLevelIds = (mods: any[]): string[] =>
  mods.map((m) => m.id);

function filterModulesByRole(modules: any[], role: string): any[] {
  return modules
    .filter((mod: any) => {
      if (!mod.allowedRoles) return true;
      return mod.allowedRoles.map((r: string) => r.toLowerCase()).includes(role.toLowerCase());
    })
    .map((mod: any) => {
      if (!mod.children) return mod;
      const filteredChildren = filterModulesByRole(mod.children, role);
      return { ...mod, children: filteredChildren };
    })
    .filter((mod: any) => {
      if (mod.type === 'item') return true;
      return (mod.children?.length ?? 0) > 0;
    });
}

describe('Regresión: Control de Acceso Reforzado', () => {
  describe('rol: costo (Case-insensitive check)', () => {
    // Test with uppercase to ensure robustness
    const role = 'COSTO';
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, role);
    const topLevelIds = getTopLevelIds(filtered);
    const actions = getActionsForUser(role);

    it('costo ve el grupo costos', () => {
      expect(topLevelIds).toContain('costos');
    });

    it('costo ve Ajustes Globales (settings)', () => {
      expect(findDeep(filtered, 'settings')).toBe(true);
    });

    it('costo NO ve el grupo core (GENERAL/ESCRITORIO)', () => {
      expect(topLevelIds).not.toContain('core');
    });

    it('costo NO ve el grupo ipv_module (IPV)', () => {
      expect(topLevelIds).not.toContain('ipv_module');
    });

    it('costo NO ve el grupo otros (OTROS)', () => {
      expect(topLevelIds).not.toContain('otros');
    });

    it('getActionsForUser para COSTO no devuelve acciones de IPV', () => {
      const hasIpvAction = actions.some(a => ['analytics', 'receipts', 'transfers'].includes(a.id));
      expect(hasIpvAction).toBe(false);
    });

    it('getActionsForUser para COSTO no devuelve acciones de POS', () => {
      const hasPosAction = actions.some(a => a.id === 'pos');
      expect(hasPosAction).toBe(false);
    });
  });

  describe('rol: admin', () => {
    const role = 'admin';
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, role);
    const actions = getActionsForUser(role);

    it('admin ve todo en el sidebar', () => {
      expect(getTopLevelIds(filtered)).toContain('core');
      expect(getTopLevelIds(filtered)).toContain('ipv_module');
    });

    it('admin ve todas las acciones principales', () => {
      expect(actions.some(a => a.id === 'pos')).toBe(true);
      expect(actions.some(a => a.id === 'analytics')).toBe(true);
    });
  });
});
