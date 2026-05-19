import { SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
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

describe('Regresión: Sidebar Access Control', () => {
  describe('rol: costo', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'costo');
    const topLevelIds = getTopLevelIds(filtered);

    it('costo ve el grupo costos', () => {
      expect(topLevelIds).toContain('costos');
    });

    it('costo ve el grupo recursos (Más recursos)', () => {
      expect(topLevelIds).toContain('recursos');
    });

    it('costo ve el grupo configuracion', () => {
      expect(topLevelIds).toContain('configuracion');
    });

    it('costo ve Ajustes Globales (settings) dentro de Sistema', () => {
      expect(findDeep(filtered, 'settings')).toBe(true);
    });

    it('costo NO ve el grupo core (GENERAL)', () => {
      expect(topLevelIds).not.toContain('core');
    });

    it('costo NO ve el grupo tienda (MULTI-TIENDA)', () => {
      expect(topLevelIds).not.toContain('tienda');
    });

    it('costo NO ve el grupo ipv_module (IPV)', () => {
      expect(topLevelIds).not.toContain('ipv_module');
    });

    it('costo NO ve el grupo otros (OTROS)', () => {
      expect(topLevelIds).not.toContain('otros');
    });

    it('costo NO ve el submenu administrativa', () => {
      expect(findDeep(filtered, 'administrativa')).toBe(false);
    });

    it('costo NO ve el submenu comunicacion', () => {
      expect(findDeep(filtered, 'comunicacion')).toBe(false);
    });

    it('costo NO ve Salud Plataforma (health)', () => {
      expect(findDeep(filtered, 'health')).toBe(false);
    });

    it('costo NO ve Auditoría Global (audit)', () => {
      expect(findDeep(filtered, 'audit')).toBe(false);
    });

    it('costo NO ve Generador Reportes (reports)', () => {
      expect(findDeep(filtered, 'reports')).toBe(false);
    });
  });

  describe('rol: admin', () => {
    const filtered = filterModulesByRole(SIDEBAR_STRUCTURE, 'admin');
    const topLevelIds = getTopLevelIds(filtered);

    it('admin ve todo', () => {
      expect(topLevelIds).toContain('core');
      expect(topLevelIds).toContain('costos');
      expect(topLevelIds).toContain('tienda');
      expect(topLevelIds).toContain('ipv_module');
      expect(topLevelIds).toContain('otros');
      expect(topLevelIds).toContain('configuracion');
      expect(topLevelIds).toContain('recursos');

      expect(findDeep(filtered, 'users')).toBe(true);
      expect(findDeep(filtered, 'health')).toBe(true);
      expect(findDeep(filtered, 'audit')).toBe(true);
    });
  });
});
