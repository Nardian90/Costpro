/**
 * CP-ORG-003 Fase 1 — REGRESIÓN DE PARIDAD tenant_admin (y clase general)
 * escritorio ↔ móvil.
 *
 * Mandato (§3 de la misión): la prueba debe verificar TANTO visibilidad
 * COMO resultado del guard — no basta con snapshots del menú. Los 8
 * escenarios exigidos:
 *   1. tenant_admin sin membresías.
 *   2. tenant_admin con membresía operativa.
 *   3. Usuario operativo con membresía restringida.
 *   4. Usuario con membresía administrativa en una tienda.
 *   5. admin y superadmin.
 *   6. Navegación directa a vistas protegidas.
 *   7. Cambio de tienda y persistencia del contexto.
 *   8. Ningún usuario ve opciones administrativas que no puede ejecutar.
 *
 * Todo se ejercita contra los módulos REALES del catálogo (navigation-
 * definition, sidebar.structure, mobile-sheet) — la misma fuente única que
 * producción. Cero mocks de datos de navegación.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMobileSheetGroups,
  visibleMobileMainTabs,
  mobileRoleAllows,
} from '@/config/navigation/mobile-sheet';
import {
  MOBILE_MAIN_TABS,
  NAVIGATION_SECTIONS,
} from '@/config/navigation/navigation-definition';
import {
  SIDEBAR_STRUCTURE,
  filterModulesByRole,
  isViewAllowedForRole,
} from '@/config/navigation/sidebar.structure';
import { hasRole } from '@/lib/roles';
import type { UserRole, UserStoreMembership } from '@/types';

// ─── Helpers (mismo modelo de usuario que produce el store de sesión) ───────

const ALL_ROLES: UserRole[] = [
  'admin', 'superadmin', 'manager', 'encargado', 'clerk',
  'warehouse', 'usuario', 'costo', 'tenant_admin',
];

const membership = (
  store_id: string,
  role: string,
  status: 'active' | 'revoked' = 'active',
): UserStoreMembership => ({ store_id, role: role as UserRole, status } as UserStoreMembership);

const userWith = (role: UserRole, memberships: UserStoreMembership[] = []) => ({
  role,
  roles: [role] as UserRole[],
  memberships,
});

// Hojas del árbol desktop (misma definición que consume el Sidebar).
interface LeafLike { id: string; type?: string; children?: LeafLike[] }
const leavesOf = (mods: LeafLike[]): LeafLike[] =>
  mods.flatMap(m => (m.type === 'item' ? [m] : leavesOf(m.children ?? [])));

const desktopLeaves = (role: UserRole): string[] =>
  leavesOf(filterModulesByRole(SIDEBAR_STRUCTURE, role) as unknown as LeafLike[])
    .map(l => l.id);

const MAIN_TAB_IDS = MOBILE_MAIN_TABS.map(t => t.id);
/** Hojas desktop que corresponden al SHEET (sin tabs fijos ni mobileHide). */
const desktopSheetLeaves = (role: UserRole): string[] =>
  desktopLeaves(role).filter(id => !MAIN_TAB_IDS.includes(id) && !mobileHideIds.has(id));

// Entradas del catálogo ocultas en móvil (mobileHide) — viven fuera del sheet.
const mobileHideIds = new Set<string>();
const collectHide = (entries: { id?: string; mobileHide?: boolean; children?: any[] }[]) => {
  for (const e of entries) {
    if (e.mobileHide && e.id) mobileHideIds.add(e.id);
    if (e.children) collectHide(e.children);
  }
};
collectHide(NAVIGATION_SECTIONS as unknown as { children?: any[] }[]);

const sheetGroups = (role: UserRole) => buildMobileSheetGroups(role);
const sheetSections = (role: UserRole): string[] => sheetGroups(role).map(g => g.section);
/** Ítems del sheet provenientes del CATÁLOGO (excluye INICIO fijo y ACCIONES). */
const catalogSheetIds = (role: UserRole): string[] =>
  sheetGroups(role)
    .filter(g => g.section !== 'INICIO' && g.section !== 'ACCIONES')
    .flatMap(g => g.items.map(i => i.id));
const actionSheetIds = (role: UserRole): string[] => {
  const g = sheetGroups(role).find(g => g.section === 'ACCIONES');
  return g ? g.items.map(i => i.id) : [];
};
const tabIds = (role: UserRole): string[] => visibleMobileMainTabs(role).map(t => t.id);

// ═══════════════════════════════════════════════════════════════════════
// 1) tenant_admin SIN membresías (estado creado por el trigger de Iteración 13)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 1: tenant_admin puro (sin membresías)', () => {
  it('el sheet «Más» queda en INICIO + AYUDA — sin alcance operativo por membresía inexistente', () => {
    const sections = sheetSections('tenant_admin');
    expect(sections[0]).toBe('INICIO');
    expect(sections).toContain('AYUDA');
    expect(sections).not.toContain('OPERACIÓN');
    expect(sections).not.toContain('ANÁLISIS');
    expect(sections).not.toContain('SISTEMA');
    expect(sections).not.toContain('EN DESARROLLO');
  });

  it('NINGÚN tab fijo visible: los 4 (Vender/Recibir/Inventario/Caja) eran visibles-denegados', () => {
    expect(tabIds('tenant_admin')).toEqual([]);
  });

  it('el guard niega las vistas operativas y administrativas (navegación directa → AccessDenied)', () => {
    // 'management-hub' es la vista gated de gestión de tiendas ('stores' es
    // un ViewType contextual fuera del catálogo — permitido por diseño).
    for (const view of ['pos', 'cash', 'inventory', 'reception_list', 'users', 'management-hub', 'organizations', 'settings']) {
      expect(isViewAllowedForRole(view, 'tenant_admin')).toBe(false);
    }
    // La home sigue accesible.
    expect(isViewAllowedForRole('dashboard', 'tenant_admin')).toBe(true);
  });

  it('paridad con el sidebar desktop: sheet(catálogo) == hojas desktop del mismo rol', () => {
    // El tenant_admin puro no tiene hojas de catálogo visibles: el sheet
    // también queda vacío de catálogo (solo INICIO fijo + AYUDA).
    expect(catalogSheetIds('tenant_admin')).toEqual(
      desktopSheetLeaves('tenant_admin'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2) tenant_admin CON membresía operativa — la membresía NO amplía el menú
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 2: tenant_admin con membresía operativa', () => {
  const pure = userWith('tenant_admin', []);
  const withClerk = userWith('tenant_admin', [membership('store-a', 'clerk')]);
  const withAdmin = userWith('tenant_admin', [membership('store-a', 'admin')]);

  it('precondición de la divergencia D1: hasRole SÍ satisface con membresía (la fuente histórica del bug)', () => {
    expect(hasRole(pure, 'admin')).toBe(false);
    expect(hasRole(withClerk, 'clerk')).toBe(true);
    expect(hasRole(withAdmin, 'admin')).toBe(true); // paso 3 de hasRole
  });

  it('la visibilidad del sheet y de los tabs es IDÉNTICA con o sin membresía (doctrina por rol global)', () => {
    // La función pura solo depende del ROL GLOBAL: buildMobileSheetGroups/
    // visibleMobileMainTabs no reciben membresías — con membresía admin en
    // una tienda, el menú del tenant_admin NO muestra SISTEMA (antes sí).
    expect(sheetSections('tenant_admin')).not.toContain('SISTEMA');
    expect(tabIds('tenant_admin')).toEqual([]);
  });

  it('el guard de las vistas operativas sigue siendo el del catálogo (sin cambios de autorización)', () => {
    expect(isViewAllowedForRole('pos', 'tenant_admin')).toBe(false);
    expect(isViewAllowedForRole('cash', 'tenant_admin')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3) Usuario operativo con membresía restringida (warehouse + membresía clerk)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 3: warehouse global con membresía restringida', () => {
  const wh = userWith('warehouse', [membership('store-a', 'clerk')]);

  it('precondición: la membresía clerk es real para hasRole', () => {
    expect(hasRole(wh, 'clerk')).toBe(true);
  });

  it('tabs visibles = los que el guard permite a warehouse: Recibir + Inventario (NO Vender/Caja)', () => {
    expect(tabIds('warehouse')).toEqual(['reception_list', 'inventory']);
    expect(isViewAllowedForRole('pos', 'warehouse')).toBe(false);
    expect(isViewAllowedForRole('cash', 'warehouse')).toBe(false);
  });

  it('el sheet sigue la doctrina del rol global warehouse (la membresía clerk no la altera)', () => {
    const sections = sheetSections('warehouse');
    expect(sections).not.toContain('SISTEMA');
    expect(catalogSheetIds('warehouse')).toEqual(desktopSheetLeaves('warehouse'));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4) Usuario con membresía ADMINISTRATIVA en una tienda (clerk + membresía
//    admin) — la CLASE GENERAL del defecto D1 (visible-denied en SISTEMA)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 4: clerk global con membresía admin en una tienda', () => {
  const clerkAdmin = userWith('clerk', [membership('store-a', 'admin')]);

  it('precondición: hasRole satisface admin vía membresía (antes esto abría SISTEMA en el sheet)', () => {
    expect(hasRole(clerkAdmin, 'admin')).toBe(true);
  });

  it('el sheet YA NO muestra SISTEMA/EN DESARROLLO/AUDITORÍA para clerk (fin del visible-denied)', () => {
    const sections = sheetSections('clerk');
    expect(sections).not.toContain('SISTEMA');
    expect(sections).not.toContain('EN DESARROLLO');
    // El guard nunca le permitió estas vistas administrativas:
    expect(isViewAllowedForRole('users', 'clerk')).toBe(false);
    expect(isViewAllowedForRole('management-hub', 'clerk')).toBe(false);
    expect(isViewAllowedForRole('organizations', 'clerk')).toBe(false);
  });

  it('tabs del clerk = Vender + Caja (el guard niega Inventario/Recibir a clerk)', () => {
    expect(tabIds('clerk')).toEqual(['pos', 'cash']);
  });

  it('paridad con desktop: clerk ve en el sheet exactamente las hojas desktop de clerk', () => {
    expect(catalogSheetIds('clerk')).toEqual(desktopSheetLeaves('clerk'));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5) admin y superadmin — paridad CP-ORG-002 INTACTA (sin regresión)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 5: admin y superadmin', () => {
  it('superadmin ve EXACTAMENTE lo mismo que admin en sheet y tabs (effectiveNavRole preservada)', () => {
    expect(sheetGroups('superadmin')).toEqual(sheetGroups('admin'));
    expect(tabIds('superadmin')).toEqual(tabIds('admin'));
  });

  it('admin/superadmin conservan los 4 tabs fijos y las 5 secciones del catálogo', () => {
    expect(tabIds('admin')).toEqual(MOBILE_MAIN_TABS.map(t => t.id));
    const sections = sheetSections('admin');
    for (const s of ['OPERACIÓN', 'ANÁLISIS', 'SISTEMA', 'AYUDA', 'EN DESARROLLO']) {
      expect(sections).toContain(s);
    }
  });

  it('paridad con desktop para admin/superadmin (regresión CP-ORG-002 no alterada)', () => {
    expect(catalogSheetIds('admin')).toEqual(desktopSheetLeaves('admin'));
    expect(catalogSheetIds('superadmin')).toEqual(desktopSheetLeaves('superadmin'));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6) Navegación directa a vistas protegidas — resultado del GUARD por rol
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 6: navegación directa (guard) vs visibilidad', () => {
  it('vistas operativas: guard por rol del catálogo (fuente única)', () => {
    const guarded: Array<[string, UserRole, boolean]> = [
      ['pos', 'clerk', true], ['pos', 'usuario', true], ['pos', 'warehouse', false],
      ['cash', 'clerk', true], ['cash', 'warehouse', false],
      ['inventory', 'warehouse', true], ['inventory', 'clerk', false],
      ['reception_list', 'warehouse', true], ['reception_list', 'clerk', false],
      ['cost-sheets', 'costo', true], ['cost-sheets', 'clerk', false],
    ];
    for (const [view, role, expected] of guarded) {
      expect(isViewAllowedForRole(view, role)).toBe(expected);
    }
  });

  it('vistas administrativas: solo nivel admin (tenant_admin/costo/clerk excluidos)', () => {
    for (const view of ['users', 'management-hub', 'organizations', 'settings']) {
      expect(isViewAllowedForRole(view, 'admin')).toBe(true);
      expect(isViewAllowedForRole(view, 'superadmin')).toBe(true);
      expect(isViewAllowedForRole(view, 'tenant_admin')).toBe(false);
      expect(isViewAllowedForRole(view, 'costo')).toBe(false);
      expect(isViewAllowedForRole(view, 'clerk')).toBe(false);
    }
  });

  it('vistas contextuales fuera del catálogo siguen permitidas (comportamiento previo)', () => {
    expect(isViewAllowedForRole('recepcion', 'tenant_admin')).toBe(true);
    expect(isViewAllowedForRole('recepcion', 'clerk')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7) Cambio de tienda y persistencia del contexto
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 7: la visibilidad no depende del contexto de tienda', () => {
  it('sheet y tabs son función PURA del rol: no reciben tienda activa ni membresías', () => {
    // El selector de tiendas del sheet («Cambiar Sucursal») vive FUERA de
    // buildMobileSheetGroups/visibleMobileMainTabs — cambiar de tienda no
    // puede alterar la visibilidad del menú (lección CP-ORG-002 §6).
    const groupsA = buildMobileSheetGroups('clerk');
    const groupsB = buildMobileSheetGroups('clerk');
    expect(groupsA).toEqual(groupsB);
    expect(groupsA.some(g => g.items.some(i => i.id === 'stores'))).toBe(false);
  });

  it('con membresías en varias tiendas, el menú del rol no cambia (membresía ≠ wayfinding)', () => {
    const multiStore = userWith('encargado', [
      membership('store-a', 'encargado'),
      membership('store-b', 'admin'),
    ]);
    expect(hasRole(multiStore, 'admin')).toBe(true); // paso 3 — autorización por tienda viva
    // La VISIBILIDAD sigue siendo la del rol global encargado:
    expect(catalogSheetIds('encargado')).toEqual(desktopSheetLeaves('encargado'));
    expect(tabIds('encargado')).toEqual(['pos', 'reception_list', 'inventory', 'cash']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8) NINGÚN usuario ve opciones que no puede ejecutar — invariantes globales
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-003 F1 — Escenario 8: cero visible-denied por construcción (todos los roles)', () => {
  it('INVARIANTE: cada ítem visible del sheet pasa el guard de SU vista', () => {
    for (const role of ALL_ROLES) {
      for (const id of [...catalogSheetIds(role), ...actionSheetIds(role), 'dashboard']) {
        expect(
          isViewAllowedForRole(id, role),
          `rol=${role} ítem=${id} visible en sheet pero guard lo deniega`,
        ).toBe(true);
      }
    }
  });

  it('INVARIANTE: cada tab fijo visible pasa el guard de su vista', () => {
    for (const role of ALL_ROLES) {
      for (const id of tabIds(role)) {
        expect(
          isViewAllowedForRole(id, role),
          `rol=${role} tab=${id} visible pero guard lo deniega`,
        ).toBe(true);
      }
    }
  });

  it('INVARIANTE de paridad: el móvil alcanza exactamente lo que desktop muestra (todos los roles)', () => {
    for (const role of ALL_ROLES) {
      const desktopVisible = new Set(desktopLeaves(role));
      const desktopReachable = new Set(
        desktopLeaves(role).filter(id => !mobileHideIds.has(id)),
      );
      const mobileReachable = new Set([...catalogSheetIds(role), ...tabIds(role)]);

      // c) COMPLETITUD: toda hoja desktop visible (no oculta en móvil) es
      // alcanzable en móvil — vía sheet o vía tab fijo.
      for (const id of desktopReachable) {
        expect(
          mobileReachable.has(id),
          `rol=${role} hoja desktop ${id} inalcanzable en móvil`,
        ).toBe(true);
      }

      // d) SIN EXTRAS: todo ítem del sheet (catálogo) es hoja desktop
      // visible para el mismo rol — el móvil no muestra nada más.
      for (const id of catalogSheetIds(role)) {
        expect(
          desktopVisible.has(id),
          `rol=${role} ítem sheet ${id} no existe en desktop`,
        ).toBe(true);
      }

      // e) TABS: todo tab visible es hoja desktop visible (coherencia
      // guard ↔ catálogo en los 4 destinos de la bottom bar).
      for (const id of tabIds(role)) {
        expect(
          desktopVisible.has(id),
          `rol=${role} tab ${id} visible sin hoja desktop correspondiente`,
        ).toBe(true);
      }
    }
  });

  it('nadie ve opciones administrativas de SISTEMA sin rol admin/superadmin', () => {
    for (const role of ALL_ROLES) {
      const seesSystem = sheetSections(role).includes('SISTEMA');
      const isAdminRole = role === 'admin' || role === 'superadmin';
      expect(seesSystem, `rol=${role} ve SISTEMA sin ser admin`).toBe(isAdminRole);
    }
  });

  it('mobileRoleAllows implementa la doctrina del catálogo (sin jerarquía ni membresías)', () => {
    expect(mobileRoleAllows(['admin', 'manager', 'encargado'], 'superadmin')).toBe(true); // normalización CP-ORG-002
    expect(mobileRoleAllows(['admin', 'manager', 'encargado'], 'tenant_admin')).toBe(false);
    expect(mobileRoleAllows(undefined, 'tenant_admin')).toBe(true); // universal
    expect(mobileRoleAllows(['admin'], null)).toBe(false); // sin sesión: solo universales
  });

  it('sin rol resuelto se preserva el comportamiento previo (optimistic tabs, sheet universal)', () => {
    expect(visibleMobileMainTabs(null).map(t => t.id)).toEqual(MOBILE_MAIN_TABS.map(t => t.id));
    const sections = buildMobileSheetGroups(null).map(g => g.section);
    expect(sections).toEqual(['INICIO', 'AYUDA']);
  });
});
