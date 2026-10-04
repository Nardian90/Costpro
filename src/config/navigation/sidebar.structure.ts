/**
 * SIDEBAR_STRUCTURE — DERIVADO de navigation-definition.ts (fuente única).
 *
 * GATE 1: este archivo ya NO declara su propio árbol. Convierte la definición
 * canónica (secciones → hubs → vistas) al formato NavModule que consume el
 * componente Sidebar. Toda nueva entrada de navegación se declara en
 * navigation-definition.ts — editar el árbol aquí rompería la fuente única.
 */

import { NAVIGATION_SECTIONS as DERIVED_TREE, NavEntry } from './navigation-definition';

export type NavItemType = 'item' | 'submenu' | 'group';

export interface NavModule {
  id: string;
  label: string;
  type: NavItemType;
  icon?: any;
  ariaLabel?: string;
  children?: NavModule[];
  allowedRoles?: string[];
  isBeta?: boolean;
  isNew?: boolean;
  /** Descripción REAL para tarjetas de SectionHubView / tooltips. */
  description?: string;
}

function toNavModule(entry: NavEntry): NavModule {
  return {
    id: entry.id,
    label: entry.label,
    type: entry.type,
    icon: entry.icon,
    ariaLabel: entry.description || entry.label,
    description: entry.description,
    allowedRoles: entry.roles,
    isBeta: entry.isBeta,
    isNew: entry.isNew,
    children: entry.children?.map(toNavModule),
  };
}

/** Árbol del sidebar derivado de la definición canónica. */
export const SIDEBAR_STRUCTURE: NavModule[] = DERIVED_TREE.map(toNavModule);

// ════════════════════════════════════════════════════════════════════
// Filtro por rol (UI-only — la seguridad real vive en backend/RLS).
// Herencia: el allowedRoles del ancestro más cercano manda; si nadie
// define roles, acceso universal (default-open, comportamiento previo
// conservado — no hay cambios de permisos en GATE 1).
// ════════════════════════════════════════════════════════════════════

/**
 * Filtra el árbol por rol a CADA nivel (la visibilidad de un grupo depende
 * de su propio allowedRoles). Puro y sin dependencia del store — usado por
 * useFilteredNavigation y validado directamente por los tests de la
 * reorganización (fix/navigation-orphaned-development).
 */
export function filterModulesByRole(modules: NavModule[], role: string): NavModule[] {
  return modules
    .filter(mod => {
      // Si no tiene allowedRoles definido, acceso universal
      if (!mod.allowedRoles) return true;
      return mod.allowedRoles.includes(role);
    })
    .map(mod => {
      if (!mod.children) return mod;
      const filteredChildren = filterModulesByRole(mod.children, role);
      return { ...mod, children: filteredChildren };
    })
    // Elimina grupos/submenús que quedaron vacíos después de filtrar
    .filter(mod => {
      if (mod.type === 'item') return true;
      return (mod.children?.length ?? 0) > 0;
    });
}

function findModuleAndAncestors(
  modules: NavModule[],
  viewId: string,
  ancestors: NavModule[] = []
): { module: NavModule; ancestors: NavModule[] } | null {
  for (const m of modules) {
    if (m.id === viewId) {
      return { module: m, ancestors };
    }
    if (m.children && m.children.length > 0) {
      const found = findModuleAndAncestors(m.children, viewId, [...ancestors, m]);
      if (found) return found;
    }
  }
  return null;
}

export function isViewAllowedForRole(viewId: string, userRole: string | undefined | null): boolean {
  if (!userRole) return false;

  // Home única (GATE 1 §1): el dashboard es la home role-aware; 'occ' es
  // alias técnico de migración que el store normaliza a 'dashboard'.
  if (viewId === 'dashboard' || viewId === 'occ') return true;

  const result = findModuleAndAncestors(SIDEBAR_STRUCTURE, viewId);
  if (!result) {
    // Vista contextual/técnica fuera del menú (recepcion, sales_catalog,
    // devolutions, tarjetas de hubs, vistas whatsapp-*/telegram-*…).
    // Se permite igual que hoy: el menú NO es el mecanismo de seguridad.
    return true;
  }

  // Buscar el allowedRoles más cercano (del módulo o de sus ancestros)
  let allowedRoles: string[] | undefined = result.module.allowedRoles;
  if (!allowedRoles) {
    for (let i = result.ancestors.length - 1; i >= 0; i--) {
      if (result.ancestors[i].allowedRoles) {
        allowedRoles = result.ancestors[i].allowedRoles;
        break;
      }
    }
  }

  // Sin roles definidos en ningún nivel → acceso universal
  if (!allowedRoles || allowedRoles.length === 0) return true;

  return allowedRoles.includes(userRole);
}
