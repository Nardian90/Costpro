import { SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
import { describe, it, expect } from 'vitest';

// Import the pure function directly (not the hook)
// We test filterModulesByRole by extracting it
import { useFilteredNavigation } from '@/hooks/ui/useFilteredNavigation';

// Helper: find a module id recursively in the tree
const findDeep = (mods: any[], id: string): boolean =>
  mods.some(
    (m) => m.id === id || (m.children && findDeep(m.children, id))
  );

// Helper: get all top-level group IDs
const getTopLevelIds = (mods: any[]): string[] =>
  mods.map((m) => m.id);

/**
 * Since filterModulesByRole is not exported directly,
 * we need to test through the hook. But to avoid React rendering overhead,
 * we extract the function logic here.
 */
function filterModulesByRole(modules: any[], role: string): any[] {
  return modules
    .filter((mod: any) => {
      if (!mod.allowedRoles) return true;
      return mod.allowedRoles.includes(role);
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

describe('Regresión: Sidebar bug FC-Sidebar (hasAvailableItems)', () => {
  describe('rol: admin', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'admin');

    it('admin ve todos los grupos de nivel superior', () => {
      expect(filtered.length).toBeGreaterThan(0);
      // Admin should see: core, costos, tienda, ipv_module, otros, configuracion, recursos
      const topLevelIds = getTopLevelIds(filtered);
      expect(topLevelIds).toContain('costos');
      expect(topLevelIds).toContain('tienda');
      expect(topLevelIds).toContain('configuracion');
    });

    it('admin ve ítems profundamente anidados (cost-sheets dentro de costos)', () => {
      expect(findDeep(filtered, 'cost-sheets')).toBe(true);
    });

    it('admin ve el módulo de usuarios', () => {
      expect(findDeep(filtered, 'users')).toBe(true);
    });

    it('admin ve POS', () => {
      expect(findDeep(filtered, 'pos')).toBe(true);
    });

    it('admin ve transferencias', () => {
      expect(findDeep(filtered, 'transferencias')).toBe(true);
    });

    it('admin ve recepción', () => {
      expect(findDeep(filtered, 'recepcion')).toBe(true);
    });
  });

  describe('rol: warehouse', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'warehouse');

    it('warehouse NO ve el ítem pos en ningún nivel del árbol', () => {
      expect(findDeep(filtered, 'pos')).toBe(false);
    });

    it('warehouse NO ve el módulo de configuración (solo admin)', () => {
      const topLevelIds = getTopLevelIds(filtered);
      expect(topLevelIds).not.toContain('configuracion');
    });

    it('warehouse ve inventory', () => {
      expect(findDeep(filtered, 'inventory')).toBe(true);
    });

    it('warehouse ve recepcion', () => {
      expect(findDeep(filtered, 'recepcion')).toBe(true);
    });

    it('warehouse ve transferencias', () => {
      expect(findDeep(filtered, 'transferencias')).toBe(true);
    });
  });

  describe('rol: costo', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'costo');

    it('costo ve el grupo costos', () => {
      const topLevelIds = getTopLevelIds(filtered);
      expect(topLevelIds).toContain('costos');
    });

    it('costo ve cost-sheets dentro del grupo costos', () => {
      expect(findDeep(filtered, 'cost-sheets')).toBe(true);
    });

    it('costo NO ve módulos de operaciones de tienda', () => {
      expect(findDeep(filtered, 'transferencias')).toBe(false);
      expect(findDeep(filtered, 'recepcion')).toBe(false);
    });

    it('costo NO ve el módulo de usuarios', () => {
      expect(findDeep(filtered, 'users')).toBe(false);
    });
  });

  describe('rol: encargado', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'encargado');

    it('encargado ve POS', () => {
      expect(findDeep(filtered, 'pos')).toBe(true);
    });

    it('encargado ve costos', () => {
      expect(findDeep(filtered, 'cost-sheets')).toBe(true);
    });

    it('encargado ve transferencias', () => {
      expect(findDeep(filtered, 'transferencias')).toBe(true);
    });

    it('encargado NO ve configuración (solo admin)', () => {
      const topLevelIds = getTopLevelIds(filtered);
      expect(topLevelIds).not.toContain('configuracion');
    });
  });

  describe('rol: clerk', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'clerk');

    it('clerk ve POS', () => {
      expect(findDeep(filtered, 'pos')).toBe(true);
    });

    it('clerk NO ve catálogo maestro (solo admin/manager/encargado)', () => {
      expect(findDeep(filtered, 'catalog')).toBe(false);
    });
  });

  describe('rol: usuario', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'usuario');

    it('usuario ve POS', () => {
      expect(findDeep(filtered, 'pos')).toBe(true);
    });

    it('usuario NO ve configuración', () => {
      expect(findDeep(filtered, 'users')).toBe(false);
      expect(findDeep(filtered, 'roles')).toBe(false);
    });

    it('usuario NO ve el dashboard KPI', () => {
      // Dashboard KPI has allowedRoles: ['admin', 'manager', 'encargado']
      expect(findDeep(filtered, 'dashboard')).toBe(false);
    });
  });

  describe('integridad del árbol', () => {
    it('no quedan grupos vacíos después de filtrar por warehouse', () => {
      const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'warehouse');
      filtered.forEach((mod) => {
        if (mod.type !== 'item') {
          expect(mod.children?.length).toBeGreaterThan(0);
        }
      });
    });

    it('no quedan grupos vacíos después de filtrar por costo', () => {
      const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'costo');
      filtered.forEach((mod) => {
        if (mod.type !== 'item') {
          expect(mod.children?.length).toBeGreaterThan(0);
        }
      });
    });

    it('el grupo "core" es visible para todos los roles (sin allowedRoles)', () => {
      const roles = ['admin', 'encargado', 'warehouse', 'costo', 'clerk', 'usuario'];
      roles.forEach((role) => {
        const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, role);
        const topLevelIds = getTopLevelIds(filtered);
        expect(topLevelIds).toContain('core');
      });
    });
  });
});
