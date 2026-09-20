/**
 * SYSTEM_ACTIONS — Command Palette (⌘K) — DERIVADO de navigation-definition.ts
 * (fuente única, GATE 1 §8).
 *
 * Las acciones que representan VISTAS se derivan de la misma definición que
 * el Sidebar y el móvil: ya no pueden divergir. Las acciones que NO son
 * vistas de menú (creación contextual, utilidades) viven en
 * ACTION_EXTENSIONS dentro de la definición.
 *
 * Los 3 destinos muertos del palette histórico (res-help, res-system-help,
 * res-academy) desaparecen por construcción: la ayuda se busca como
 * "Centro de Ayuda" / "Wiki" / "Academia" (vistas reales de AYUDA).
 */

import { ViewType } from '@/store';
import {
  ACTION_EXTENSIONS,
  HOME_ITEM,
  flattenNavigation,
  type FlatNavItem,
} from '@/config/navigation/navigation-definition';

export interface Action {
  id: string;
  label: string;
  icon: any; // Lucide icon
  keywords: string[];
  route: string; // ViewType or nav ID (resolved by navigation-map)
  roles?: string[];
  description?: string;
}

function toAction(flat: FlatNavItem): Action {
  return {
    id: flat.id,
    label: flat.label,
    icon: flat.icon,
    keywords: flat.keywords ?? [flat.label.toLowerCase()],
    route: flat.id,
    roles: flat.roles,
    description: flat.description,
  };
}

function buildSystemActions(): Action[] {
  // Home primero ("Inicio" — concepto único, GATE 1 §1)
  const home: Action = {
    id: HOME_ITEM.id,
    label: HOME_ITEM.label,
    icon: HOME_ITEM.icon,
    keywords: HOME_ITEM.keywords ?? [],
    route: HOME_ITEM.id,
    description: HOME_ITEM.description,
  };

  // Vistas de menú derivadas (OPERACIÓN → ANÁLISIS → SISTEMA → AYUDA → EN DESARROLLO)
  const derivedViews = flattenNavigation().map(toAction);

  // Extensiones: acciones que NO son vistas de menú (nueva recepción,
  // calculadora, chat IA, vitrina) — con keywords curadas en la definición.
  const extensions: Action[] = ACTION_EXTENSIONS.map(ext => ({
    id: ext.id,
    label: ext.label,
    icon: ext.icon,
    keywords: ext.keywords ?? [ext.label.toLowerCase()],
    route: ext.route.view,
    roles: ext.roles,
    description: ext.description,
  }));

  return [home, ...derivedViews, ...extensions];
}

export const SYSTEM_ACTIONS: Action[] = buildSystemActions();

export function getActionsForUser(role: string): Action[] {
  return SYSTEM_ACTIONS.filter(action => {
    if (!action.roles) return true;
    return action.roles.includes(role);
  });
}

// Compat de tipos consumidores existentes
export type { ViewType };
