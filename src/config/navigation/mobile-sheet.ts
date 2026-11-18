/**
 * MOBILE_SHEET — CP-ORG-003 Fase 1: paridad segura de navegación móvil.
 *
 * GATE 1 §8/§9 exige UNA sola doctrina de filtrado por superficie. Antes de
 * este módulo convivían TRES: el sidebar desktop filtraba por ROL GLOBAL
 * estricto (filterModulesByRole), el guard denegaba por catálogo
 * (isViewAllowedForRole) y el sheet «Más» del móvil filtraba con hasRole()
 * — que satisface con JERARQUÍA y MEMBRESÍAS de tienda (paso 3/4 de roles.ts).
 * Resultado (auditoría CP-ORG-003, D1/D2): un clerk global con membresía
 * admin veía SISTEMA/EN DESARROLLO/AUDITORÍA en el sheet que el guard
 * denegaba al tap (visible-denied), y los 4 tabs fijos (Vender/Recibir/
 * Inventario/Caja) se renderizaban SIN gate para cualquier sesión.
 *
 * Este módulo restaura la paridad alineando el móvil con la política EFECTIVA
 * de autorización (la más restrictiva), sin tocar permisos de servidor:
 *
 *   1. Sheet «Más»: mismo predicado que filterModulesByRole — rol global
 *      estricto vía effectiveNavRole sobre las listas `roles` del catálogo.
 *      Las membresías de tienda DEJAN de ampliar la visibilidad del menú
 *      (la autorización operativa por tienda sigue viva en el servidor:
 *      has_store_role_as, canManageStore, RLS — el menú no es seguridad).
 *   2. Tabs fijos: cada tab visible pasa el MISMO guard que su tap
 *      (isViewAllowedForRole). Tab invisible ⇔ guard niega su vista.
 *
 * Regla CP-ORG-002/003: NINGÚN filtro de navegación muestra una entrada que
 * el guard rechaza. La seguridad real vive server-side/RLS.
 */

import { Home } from 'lucide-react';
import {
  MOBILE_MAIN_TABS,
  NAVIGATION_SECTIONS,
  ACTION_EXTENSIONS,
  type NavEntry,
  type MobileMainTab,
} from './navigation-definition';
import { effectiveNavRole, isViewAllowedForRole } from './sidebar.structure';

export interface MobileSheetItem {
  id: string;
  label: string;
  icon?: any;
}

export interface MobileSheetGroup {
  section: string;
  items: MobileSheetItem[];
}

/**
 * Predicado canónico de visibilidad por ROL GLOBAL — la MISMA doctrina que
 * filterModulesByRole (sidebar desktop): sin `roles` declarado = acceso
 * universal; con `roles` = lista estricta sobre el rol efectivo de
 * navegación (superadmin→admin vía effectiveNavRole).
 *
 * NOTA: no recibe membresías NI jerarquía (hasRole queda fuera del
 * wayfinding móvil desde CP-ORG-003) — si el guard/catálogo no lo declara,
 * no se muestra.
 */
export function mobileRoleAllows(
  roles: readonly string[] | undefined | null,
  role: string | null | undefined,
): boolean {
  if (!roles || roles.length === 0) return true; // acceso universal (doctrina del catálogo)
  const navRole = effectiveNavRole(role ?? null);
  return navRole != null && (roles as readonly string[]).includes(navRole);
}

/**
 * Tabs fijos móviles (Vender/Recibir/Inventario/Caja) visibles para un rol.
 *
 * CP-ORG-003 D2: antes se renderizaban sin gate — tenant_admin, costo,
 * clerk (Inventario/Recibir) o warehouse (Vender/Caja) los veían y el tap
 * acababa en AccessDenied. Ahora cada tab visible pasa el MISMO guard que
 * su navegación (isViewAllowedForRole) — política de visibilidad coherente
 * con la autorización efectiva, sin cambiar ninguna autorización.
 *
 * Sin rol resuelto (sesión cargando / no autenticado) se preserva el
 * comportamiento previo (todos los tabs) — igual que useFilteredNavigation
 * devuelve el árbol completo en modo optimistic. El shell autenticado
 * siempre resuelve el rol antes de navegar.
 */
export function visibleMobileMainTabs(role: string | null | undefined): MobileMainTab[] {
  if (!role) return MOBILE_MAIN_TABS;
  return MOBILE_MAIN_TABS.filter(tab => isViewAllowedForRole(tab.id, role));
}

/**
 * Grupos del sheet «Más» para un rol — derivados del MISMO árbol canónico
 * (NAVIGATION_SECTIONS) que el sidebar desktop, con el predicado estricto
 * mobileRoleAllows (antes: hasRole con membresías/jerarquía — doctrina
 * divergente D1).
 *
 * Contrato preservado del walk histórico: INICIO primero, secciones del
 * catálogo con ≥1 ítem visible, hojas type 'item' excluyendo los tabs
 * fijos (ya viven en la bottom bar) y mobileHide, y el grupo ACCIONES con
 * las extensiones de acción no ocultas.
 */
export function buildMobileSheetGroups(role: string | null | undefined): MobileSheetGroup[] {
  const mainTabIds = MOBILE_MAIN_TABS.map(t => t.id);
  const groups: MobileSheetGroup[] = [];

  // Inicio siempre primero
  groups.push({ section: 'INICIO', items: [{ id: 'dashboard', label: 'Inicio', icon: Home }] });

  for (const section of NAVIGATION_SECTIONS) {
    if (!mobileRoleAllows(section.roles, role)) continue;
    const items: MobileSheetItem[] = [];

    const walk = (entries: NavEntry[]) => {
      for (const e of entries) {
        // Doctrina EXACTA de filterModulesByRole: se filtra CADA nivel del
        // árbol. Un submenú/grupo gated oculta TODAS sus hojas aunque no
        // declaren roles propios — el guard (isViewAllowedForRole) hereda
        // los roles del ancestro más cercano, y el sheet NO puede mostrar
        // lo que desktop filtra y el guard niega (p.ej. whatsapp-hub/
        // telegram-hub dentro de un grupo admin-level: visibles-denegados
        // en el sheet histórico para cualquier rol operativo).
        if (!mobileRoleAllows(e.roles, role)) continue;
        if (e.type === 'item') {
          if (mainTabIds.includes(e.id)) continue; // ya son tabs fijos
          if (e.mobileHide) continue;              // widget/acción
          items.push({ id: e.id, label: e.label, icon: e.icon });
        } else if (e.children) {
          walk(e.children);
        }
      }
    };
    walk(section.children || []);
    if (items.length > 0) groups.push({ section: section.label, items });
  }

  // Extensiones de acción (nueva recepción, vitrina, …) — misma doctrina
  // estricta por rol global que el Command Palette (CP-ORG-002).
  const extItems = ACTION_EXTENSIONS.filter(e => !e.mobileHide && mobileRoleAllows(e.roles, role))
    .map(e => ({ id: e.id, label: e.label, icon: e.icon }));
  if (extItems.length > 0) groups.push({ section: 'ACCIONES', items: extItems });

  return groups;
}
