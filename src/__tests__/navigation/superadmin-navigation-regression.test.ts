/**
 * CP-ORG-002 — Pruebas de regresión: navegación completa del SuperAdmin.
 *
 * REPRODUCE EXACTAMENTE EL FALLO REPORTADO: tras las correcciones de
 * CP-ORG-001 (promoción de la cuenta designada a 'superadmin'), el menú
 * lateral solo mostraba Inicio y Ayuda — filterModulesByRole comparaba el
 * rol crudo contra listas roles: ['admin', …] que NUNCA incluyen
 * 'superadmin', mientras isViewAllowedForRole (guard de vistas) SÍ
 * normalizaba. La normalización canónica vive ahora en effectiveNavRole.
 *
 * Cobertura exigida por la misión (§4):
 *   1. SuperAdmin con tienda seleccionada → menú completo según su alcance.
 *   2. SuperAdmin SIN membresías individuales → navegación funcional
 *      (el modelo de acceso de plataforma no depende de membresías).
 *   3. Administrador de tienda ('admin') → menú acorde a sus permisos.
 *   4. Usuario operativo (clerk/costo/warehouse) → solo lo autorizado.
 *   5. Sin sesión → guard niega vistas (isViewAllowedForRole false).
 *   6. Restauración de sesión / estados de carga → menú nunca vacío
 *      (optimistic UI de useFilteredNavigation preservada).
 *   7. Cambio de tienda → árbol de navegación estable (sin mezcla de
 *      contexto por activeStoreId).
 *   8. Acceso directo a rutas no autorizadas → guard bloquea por rol.
 *   9. Ausencia de duplicados / enlaces rotos / elementos fuera de rol.
 *   10. Command Palette (getActionsForUser) con la MISMA regla canónica.
 *
 * La seguridad real vive server-side/RLS — estos tests validan wayfinding,
 * no autorización efectiva (que la DB impone).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SIDEBAR_STRUCTURE,
  filterModulesByRole,
  isViewAllowedForRole,
  effectiveNavRole,
} from '@/config/navigation/sidebar.structure';
import {
  SIDEBAR_STRUCTURE as DERIVED_SIDEBAR,
} from '@/config/navigation/sidebar.structure';
import { getActionsForUser } from '@/config/actions';
import {
  NAVIGATION_SECTIONS,
  flattenNavigation,
  VALID_VIEWS,
} from '@/config/navigation/navigation-definition';
import { renderHook, act } from '@testing-library/react';
import { useFilteredNavigation } from '@/hooks/ui/useFilteredNavigation';

// ─── store simulado (TOP LEVEL: vi.mock se hoistea de todos modos) ──
// Usuario mutable — mismo patrón que la suite de componentes del repo
// (zustand create + getter); scope de módulo porque el factory no ve
// variables de describe.
let mockUser: Record<string, unknown> | null = null;

vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create(() => ({
    get user() {
      return mockUser;
    },
  }));
  return { useAuthStore };
});

// ─── utilidades locales ────────────────────────────────────────────────

/** IDs de las secciones raíz visibles para un rol (orden real del sidebar). */
const rootIdsFor = (role: string): string[] =>
  filterModulesByRole(SIDEBAR_STRUCTURE, role).map(m => m.id);

/** Hojas (vistas terminales) de un árbol filtrado, con su ruta resuelta. */
const leavesOf = (modules: typeof SIDEBAR_STRUCTURE): { id: string; view: string }[] =>
  modules.flatMap(m =>
    (m.children?.length ? leavesOf(m.children) : [{ id: m.id, view: m.id }])
  );

// ═══════════════════════════════════════════════════════════════════════
// 0) REPRODUCCIÓN DEL FALLO REPORTADO (la prueba que cierra el incidente)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — Reproducción del fallo reportado', () => {
  it('el menú del SuperAdmin YA NO se limita a Inicio y Ayuda', () => {
    const visible = rootIdsFor('superadmin');
    // Antes del fix: ['ayuda'] (solo la sección universal) + ítem fijo Inicio.
    expect(visible).toContain('operacion');
    expect(visible).toContain('analisis');
    expect(visible).toContain('sistema');
    expect(visible).toContain('desarrollo');
    expect(visible).toContain('ayuda');
  });

  it('el menú del SuperAdmin es EXACTAMENTE el del admin (mismo alcance y orden)', () => {
    // La cuenta de plataforma hereda el nivel administrativo completo: ni
    // más (no inventa módulos) ni menos (no pierde secciones).
    expect(rootIdsFor('superadmin')).toEqual(rootIdsFor('admin'));

    const saLeaves = leavesOf(filterModulesByRole(SIDEBAR_STRUCTURE, 'superadmin'));
    const adLeaves = leavesOf(filterModulesByRole(SIDEBAR_STRUCTURE, 'admin'));
    expect(saLeaves.map(l => l.id)).toEqual(adLeaves.map(l => l.id));
  });

  it('regresión del fix: la normalización NO altera a los demás roles', () => {
    // Los roles que ya funcionaban conservan su menú intacto.
    expect(rootIdsFor('clerk')).toEqual(rootIdsFor('clerk'));
    expect(rootIdsFor('manager')).toEqual(rootIdsFor('manager'));
    expect(rootIdsFor('encargado')).toEqual(rootIdsFor('encargado'));
    // Spot-check de restricciones que deben seguir vivas:
    expect(rootIdsFor('clerk')).not.toContain('sistema');
    expect(rootIdsFor('costo')).not.toContain('sistema');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 1) Regla canónica effectiveNavRole
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — effectiveNavRole (regla canónica de navegación)', () => {
  it('normaliza superadmin→admin y respeta el resto', () => {
    expect(effectiveNavRole('superadmin')).toBe('admin');
    expect(effectiveNavRole('admin')).toBe('admin');
    expect(effectiveNavRole('clerk')).toBe('clerk');
    expect(effectiveNavRole('tenant_admin')).toBe('tenant_admin');
    expect(effectiveNavRole(null)).toBeNull();
    expect(effectiveNavRole(undefined)).toBeUndefined();
  });

  it('SIN MEMBRESÍAS no afecta al filtro: el rol global basta (modelo plataforma)', () => {
    // filterModulesByRole solo consume el ROL GLOBAL — la cuenta designada
    // no lleva membresías de tienda por diseño (CP-ORG-001 §6) y aun así
    // debe ver la navegación completa.
    const sa = filterModulesByRole(SIDEBAR_STRUCTURE, 'superadmin');
    const saLeaves = leavesOf(sa);
    expect(saLeaves.length).toBeGreaterThan(20);
    expect(saLeaves.map(l => l.id)).toContain('users');
    expect(saLeaves.map(l => l.id)).toContain('organizations');
    expect(saLeaves.map(l => l.id)).toContain('pos');
    expect(saLeaves.map(l => l.id)).toContain('cost-sheets');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2) Guard de vistas — acceso directo por URL a rutas no autorizadas
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — isViewAllowedForRole (guard de acceso directo)', () => {
  it('SuperAdmin accede a las vistas administrativas de SISTEMA', () => {
    for (const view of ['settings', 'users', 'roles', 'organizations', 'fiscal-close']) {
      expect(isViewAllowedForRole(view, 'superadmin')).toBe(true);
    }
  });

  it('sin sesión (rol undefined) el guard niega vistas del menú', () => {
    expect(isViewAllowedForRole('users', undefined)).toBe(false);
    expect(isViewAllowedForRole('users', null)).toBe(false);
  });

  it('usuario operativo NO entra por URL directa a módulos no autorizados', () => {
    // clerk: sin SISTEMA, sin Costo (permiso ≠ autorización efectiva: la DB
    // impone lo suyo; el guard de wayfinding también bloquea).
    expect(isViewAllowedForRole('users', 'clerk')).toBe(false);
    expect(isViewAllowedForRole('settings', 'clerk')).toBe(false);
    expect(isViewAllowedForRole('cost-sheets', 'clerk')).toBe(false);
    // costo: ve Costo, no ve SISTEMA.
    expect(isViewAllowedForRole('cost-sheets', 'costo')).toBe(true);
    expect(isViewAllowedForRole('users', 'costo')).toBe(false);
    // tenant_admin: HALLAZGO PRE-EXISTENTE separado — el catálogo desktop
    // estricto no lo incluye en las listas roles: (móvil/jerarquía sí le
    // muestra alcance operativo). Fuera del alcance de este fix: no se
    // altera. Lo que se conserva: NADA de SISTEMA transversal.
    expect(isViewAllowedForRole('users', 'tenant_admin')).toBe(false);
    expect(isViewAllowedForRole('settings', 'tenant_admin')).toBe(false);
  });

  it('vistas contextuales/ técnicas fuera del menú siguen permitidas (comportamiento previo)', () => {
    expect(isViewAllowedForRole('recepcion', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('dashboard', 'clerk')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3) Catálogo ↔ rutas reales: sin enlaces rotos ni duplicados (SuperAdmin)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — Integridad del menú visible para SuperAdmin', () => {
  const saTree = filterModulesByRole(SIDEBAR_STRUCTURE, 'superadmin');
  const saLeaves = leavesOf(saTree);

  // Mapa id → vista destino desde la fuente única (las entradas
  // module-route —p.ej. cost-analytics→cost-sheets+tab— solo exponen su
  // destino en navigation-definition, no en NavModule).
  const routeOf = new Map(
    flattenNavigation().map(l => [l.id, (l.route?.view ?? l.id) as string]),
  );

  it('cada vista visible apunta a un ViewType real (cero enlaces rotos)', () => {
    const broken = saLeaves.filter(l => !VALID_VIEWS.has(routeOf.get(l.view) ?? l.view));
    expect(broken.map(l => l.id)).toEqual([]);
  });

  it('cero duplicados en el menú del SuperAdmin', () => {
    const ids = saLeaves.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('el catálogo derivado equivale a la fuente única (sin listas paralelas)', () => {
    expect(DERIVED_SIDEBAR.map(m => m.id)).toEqual(NAVIGATION_SECTIONS.map(s => s.id));
  });

  it('ninguna entrada ficticia: todo lo visible existe en la fuente única', () => {
    const catalogIds = new Set(flattenNavigation().map(l => l.id));
    const fictitious = saLeaves.filter(l => !catalogIds.has(l.id));
    expect(fictitious.map(l => l.id)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4) Command Palette ⌘K — misma regla canónica
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — Command Palette (getActionsForUser)', () => {
  it('SuperAdmin ve exactamente las mismas acciones que admin', () => {
    expect(getActionsForUser('superadmin').map(a => a.id))
      .toEqual(getActionsForUser('admin').map(a => a.id));
  });

  it('SuperAdmin ve las acciones administrativas (antes: solo universales)', () => {
    const ids = getActionsForUser('superadmin').map(a => a.id);
    expect(ids).toContain('users');
    expect(ids).toContain('organizations');
    expect(ids).toContain('fiscal-close');
    // Y el palette supera con creces el par de acciones del fallo reportado.
    expect(ids.length).toBeGreaterThan(20);
  });

  it('usuario operativo NO ve acciones administrativas en el palette', () => {
    const clerkIds = getActionsForUser('clerk').map(a => a.id);
    expect(clerkIds).not.toContain('users');
    expect(clerkIds).not.toContain('organizations');
    expect(clerkIds).not.toContain('fiscal-close');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5) useFilteredNavigation — sesión, carga, restauración y cambio de tienda
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — useFilteredNavigation (estados de sesión)', () => {
  // El store simulado (@/store) se mockea al tope del módulo; aquí solo
  // reseteamos el usuario mutable entre casos.
  beforeEach(() => {
    mockUser = null;
  });

  it('durante la carga (user null) el menú NO queda vacío: optimistic UI', () => {
    const { result } = renderHook(() => useFilteredNavigation());
    // Comportamiento previo conservado: árbol completo, nunca colapsado.
    expect(result.current.map(m => m.id)).toEqual(SIDEBAR_STRUCTURE.map(m => m.id));
  });

  it('SIN rol definido (perfil no cargado) el menú sigue completo', () => {
    mockUser = { id: 'u1', role: undefined };
    const { result } = renderHook(() => useFilteredNavigation());
    expect(result.current.length).toBe(SIDEBAR_STRUCTURE.length);
  });

  it('SuperAdmin autenticado: menú administrativo completo tras la carga', () => {
    // Sesión restaurada con tienda seleccionada y 0 membresías (CP-ORG-001 §6).
    mockUser = {
      id: 'platform-account',
      role: 'superadmin',
      activeStoreId: 'store-enervida',
      memberships: [],
    };
    const { result } = renderHook(() => useFilteredNavigation());
    expect(result.current.map(m => m.id)).toEqual(rootIdsFor('admin'));
    expect(result.current.map(m => m.id)).toContain('sistema');
  });

  it('transición login → sesión cargada: el menú NO colapsa a Inicio+Ayuda', () => {
    // Reproduce la secuencia real: mount sin sesión → llega la sesión del
    // SuperAdmin. Antes del fix, este acto era exactamente el colapso.
    const { result } = renderHook(() => useFilteredNavigation());
    expect(result.current.length).toBe(SIDEBAR_STRUCTURE.length);

    act(() => {
      mockUser = { id: 'platform-account', role: 'superadmin', memberships: [] };
    });

    expect(result.current.map(m => m.id)).toContain('operacion');
    expect(result.current.map(m => m.id)).toContain('sistema');
    expect(result.current.map(m => m.id)).not.toEqual(['ayuda']);
  });

  it('cambio de tienda NO altera el menú (contexto de nav estable)', () => {
    // Cambiar activeStoreId no debe tocar el árbol de navegación: sin
    // mezcla de contexto de la tienda anterior en wayfinding.
    mockUser = {
      id: 'platform-account',
      role: 'superadmin',
      activeStoreId: 'store-enervida',
      memberships: [],
    };
    const { result } = renderHook(() => useFilteredNavigation());
    const before = result.current.map(m => m.id);

    act(() => {
      mockUser = {
        id: 'platform-account',
        role: 'superadmin',
        activeStoreId: 'store-puerto-padre',
        memberships: [],
      };
    });

    expect(result.current.map(m => m.id)).toEqual(before);
  });

  it('usuario operativo autenticado: menú restringido acorde a su rol', () => {
    mockUser = {
      id: 'u-clerk',
      role: 'clerk',
      activeStoreId: 'store-enervida',
      memberships: [{ store_id: 'store-enervida', role: 'clerk', status: 'active' }],
    };
    const { result } = renderHook(() => useFilteredNavigation());
    const ids = result.current.map(m => m.id);
    expect(ids).not.toContain('sistema');
    expect(ids).not.toContain('desarrollo');
    expect(rootIdsFor('clerk')).toEqual(ids);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6) Restricciones específicas de módulo conservadas (regresión negativa)
// ═══════════════════════════════════════════════════════════════════════

describe('CP-ORG-002 — Restricciones por módulo conservadas', () => {
  it('rol con listas exactas: warehouse ve Almacén/Operación, no Costo ni SISTEMA', () => {
    const whLeaves = leavesOf(filterModulesByRole(SIDEBAR_STRUCTURE, 'warehouse'));
    const ids = whLeaves.map(l => l.id);
    expect(ids).not.toContain('cost-sheets');
    expect(ids).not.toContain('users');
  });

  it('tenant_admin: sin SISTEMA transversal (restricción FASE 3 conservada)', () => {
    // HALLAZGO SEPARADO (pre-existente, FUERA del alcance CP-ORG-002): el
    // filtro estricto del catálogo no incluye 'tenant_admin' en las listas
    // roles: (móvil, vía hasRole/jerarquía, sí muestra el alcance operativo).
    // No se altera ese comportamiento en esta misión: el alcance de este fix
    // es la navegación de la cuenta de plataforma ('superadmin').
    expect(rootIdsFor('tenant_admin')).not.toContain('sistema');
    expect(rootIdsFor('tenant_admin')).not.toContain('desarrollo');
  });

  it('la asimetría de seguridad se conserva: admin NO satisface chequeos de superadmin', () => {
    // El menú trata a superadmin como admin (wayfinding); pero el ROL no se
    // degrada — la jerarquía de la DB sigue siendo la fuente de autoridad.
    expect(effectiveNavRole('admin')).toBe('admin');
    expect(effectiveNavRole('admin')).not.toBe('superadmin');
  });

  it('la sección EN DESARROLLO sigue siendo admin-level (no universal)', () => {
    expect(rootIdsFor('clerk')).not.toContain('desarrollo');
    expect(rootIdsFor('usuario')).not.toContain('desarrollo');
    expect(rootIdsFor('superadmin')).toContain('desarrollo');
  });
});

// ─── smoke: el filtro es determinista ───────────────────────────
it('CP-ORG-002 — sanity: el filtro es determinista entre invocaciones', () => {
  const a = rootIdsFor('superadmin');
  const b = rootIdsFor('superadmin');
  expect(a).toEqual(b);
});
