/**
 * GATE 1.1 — CONTRATO ViewId: regresión del bug "[object Object]".
 *
 * Causa raíz (documentada en el informe GATE 1.1):
 *   Durante GATE 1 existió una build intermedia con
 *   `currentView: normalizeLegacyView(view)` (objeto, sin `.view`) en el
 *   store. El servidor dev sirvió esa ventana → navegadores reales
 *   persistieron `currentView` como OBJETO en `costpro-ui-storage` con
 *   `version: 4`. Tras el fix del commit, `migrate` solo corre si la versión
 *   difiere (4 === 4 → se salta) y el merge por defecto inyectaba el objeto
 *   crudo en el store. El breadcrumb (`String(currentView)`) y el shell
 *   (`String(view)`) renderizaban "[object Object]" + "Módulo No Disponible".
 *
 * Contrato canónico (no negociable):
 *   Un destino de navegación es SIEMPRE `ViewType` (string). Los objetos
 *   ricos (NavEntry, NavRoute, HOME_ITEM) viven solo en
 *   navigation-definition.ts y se aplanan a `entry.id` / `entry.route.view`.
 *
 * Cobertura exigida (GATE 1.1 §19):
 *   - Navigation contract : NavigationItem/objeto → ViewId (nunca objeto)
 *   - Breadcrumb          : viewId inválido → labels string, nunca coerción
 *   - Shell               : ViewId inválido → fallback con diagnóstico
 *   - Invalid view        : string desconocido → "Módulo No Disponible" (se
 *                           PRESERVA el fallback legítimo)
 *   - Home                : HOME_ITEM → 'dashboard' SIN pasar el objeto
 *   - Rehidratación       : localStorage envenenado (objeto, v4) → curado a
 *                           'dashboard' en cada carga (LA REGRESIÓN EXACTA)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  normalizeLegacyView,
  sanitizeViewId,
  isViewIdContractViolation,
  HOME_ITEM,
  HOME_VIEW,
} from '@/config/navigation/navigation-definition';
import { getBreadcrumbForView } from '@/config/navigation/navigation-map';
import { useUIStore } from '@/store';
import NavigationBreadcrumb from '@/components/ui/NavigationBreadcrumb';

const STORAGE_KEY = 'costpro-ui-storage';

describe('GATE 1.1 — contrato ViewId: isViewIdContractViolation', () => {
  it('objeto → violación', () => {
    expect(isViewIdContractViolation({ view: 'dashboard' })).toBe(true);
    expect(isViewIdContractViolation(HOME_ITEM)).toBe(true);
    expect(isViewIdContractViolation(null)).toBe(true);
    expect(isViewIdContractViolation(undefined)).toBe(true);
    expect(isViewIdContractViolation(42)).toBe(true);
  });

  it('artefactos de coerción string → violación', () => {
    expect(isViewIdContractViolation('[object Object]')).toBe(true);
    expect(isViewIdContractViolation('undefined')).toBe(true);
    expect(isViewIdContractViolation('null')).toBe(true);
    expect(isViewIdContractViolation('')).toBe(true);
  });

  it('ViewIds legítimos → NO violación', () => {
    expect(isViewIdContractViolation('dashboard')).toBe(false);
    expect(isViewIdContractViolation('pos')).toBe(false);
    expect(isViewIdContractViolation('cost-sheets')).toBe(false);
  });
});

describe('GATE 1.1 — NavigationItem → ViewId (normalizeLegacyView / sanitizeViewId)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it('HOME_ITEM (objeto) nunca pasa como view: aterriza en Home como STRING + diagnóstico', () => {
    const result = normalizeLegacyView(HOME_ITEM as unknown as string);
    expect(result.view).toBe(HOME_VIEW);
    expect(result.view).toBe('dashboard');
    expect(typeof result.view).toBe('string');
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid navigation target'),
      expect.objectContaining({ received: HOME_ITEM })
    );
  });

  it('NavRoute { view, tab } (objeto) → Home + diagnóstico, jamás "[object Object]"', () => {
    const route = { view: 'cost-sheets', tab: 'gen-easy' };
    const result = normalizeLegacyView(route as unknown as string);
    expect(result).toEqual({ view: 'dashboard' });
    expect(String(result.view)).not.toBe('[object Object]');
    expect(errSpy).toHaveBeenCalled();
  });

  it('artefacto de coerción "[object Object]" (como string) → Home + diagnóstico', () => {
    expect(normalizeLegacyView('[object Object]').view).toBe('dashboard');
    expect(sanitizeViewId('[object Object]', 'test')).toBe('dashboard');
    expect(errSpy).toHaveBeenCalled();
  });

  it('sanitizeViewId garantiza string para cualquier entrada hostil', () => {
    for (const hostile of [{}, [], NaN, 0, true, null, undefined]) {
      expect(typeof sanitizeViewId(hostile, 'test')).toBe('string');
      expect(sanitizeViewId(hostile, 'test')).toBe('dashboard');
    }
  });

  it('NO rompe el comportamiento legítimo: alias legacy y passthrough', () => {
    errSpy.mockRestore(); // estas llamadas NO deben diagnosticar
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(normalizeLegacyView('occ').view).toBe('dashboard'); // migración obligatoria §1
    expect(normalizeLegacyView('costos').view).toBe('cost-sheets');
    expect(normalizeLegacyView('costos').tab).toBe('gen-easy');
    expect(normalizeLegacyView('pos').view).toBe('pos');
    expect(normalizeLegacyView('pos').tab).toBeUndefined();
    expect(sanitizeViewId('inventory', 'test')).toBe('inventory');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('GATE 1.1 — rehidratación del store: LA REGRESIÓN EXACTA', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
    useUIStore.setState({ currentView: 'dashboard', previousView: null });
  });
  afterEach(() => {
    localStorage.clear();
    errSpy.mockRestore();
    useUIStore.setState({ currentView: 'dashboard', previousView: null });
  });

  it('localStorage envenenado con currentView OBJETO (v4) → curado a dashboard al rehidratar', async () => {
    // Estado que dejó la ventana del bug: objeto {view, tab} persistido con
    // version 4 — migrate NO corre (versión coincide), merge POR DEFECTO lo
    // inyectaba crudo → "[object Object]" en breadcrumb y shell.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          currentView: { view: 'dashboard', tab: undefined },
          previousView: { view: 'pos' },
          themePreference: 'dark',
        },
        version: 4,
      })
    );

    await useUIStore.persist.rehydrate();

    const s = useUIStore.getState();
    expect(typeof s.currentView).toBe('string');
    expect(s.currentView).toBe('dashboard'); // Home única, NUNCA el objeto
    expect(typeof s.previousView).toBe('string');
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid navigation target'),
      expect.anything()
    );
    // El resto del estado persistido legítimo se PRESERVA (merge no borra)
    expect(s.themePreference).toBe('dark');
  });

  it('localStorage con "[object Object]" ya coercido a string → curado a dashboard', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: '[object Object]' }, version: 4 })
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().currentView).toBe('dashboard');
  });

  it('localStorage con estado legacy válido (occ) → migra a dashboard igual que antes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: 'occ' }, version: 3 })
    );
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().currentView).toBe('dashboard');
  });

  it('NO rompe la rehidratación legítima: vistas y preferencias se respetan', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { currentView: 'inventory', themePreference: 'auto', sidebarState: 'rail' },
        version: 4,
      })
    );
    await useUIStore.persist.rehydrate();
    const s = useUIStore.getState();
    expect(s.currentView).toBe('inventory');
    expect(s.themePreference).toBe('auto');
    expect(s.sidebarState).toBe('rail');
    expect(errSpy).not.toHaveBeenCalled(); // sin diagnósticos falsos
  });

  it('setCurrentView jamás almacena un objeto (llamada hostil con HOME_ITEM)', () => {
    useUIStore.getState().setCurrentView(HOME_ITEM as unknown as never);
    const s = useUIStore.getState();
    expect(typeof s.currentView).toBe('string');
    expect(s.currentView).toBe('dashboard');
  });

  it('setCurrentView sigue normalizando alias legacy en el punto único', () => {
    useUIStore.getState().setCurrentView('occ' as never);
    expect(useUIStore.getState().currentView).toBe('dashboard');
  });
});

describe('GATE 1.1 — breadcrumb: nunca "[object Object]"', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it('viewId OBJETO → aterriza en Inicio (labels string), sin coerción', () => {
    const items = getBreadcrumbForView({ view: 'dashboard' } as unknown as string);
    expect(items).toEqual([{ label: 'Inicio', isCurrent: true }]);
    expect(items.every(i => typeof i.label === 'string')).toBe(true);
  });

  it('artefacto "[object Object]" como string → Inicio, nunca el fallback con coerción', () => {
    const items = getBreadcrumbForView('[object Object]');
    expect(items.map(i => i.label)).toEqual(['Inicio']);
  });

  it('string desconocido LEGÍTIMO → fallback "Módulo No Disponible" PRESERVADO (§6)', () => {
    const items = getBreadcrumbForView('vista-inexistente');
    expect(items.map(i => i.label)).toEqual(['vista inexistente', 'Módulo No Disponible']);
  });

  it('vistas válidas siguen generando path completo desde la definición', () => {
    const items = getBreadcrumbForView('inventory');
    const labels = items.map(i => i.label);
    expect(labels).toContain('OPERACIÓN');
    expect(labels).toContain('Almacén');
    expect(labels).toContain('Inventario');
    expect(items.every(i => typeof i.label === 'string' && !i.label.includes('object'))).toBe(true);
  });
});

describe('GATE 1.1 — NavigationBreadcrumb montado con estado envenenado (síntoma exacto)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    errSpy.mockRestore();
    useUIStore.setState({ currentView: 'dashboard', previousView: null });
  });

  it('currentView objeto → NO renderiza "[object Object]" ni "Módulo No Disponible"', () => {
    useUIStore.setState({ currentView: { view: 'dashboard' } as unknown as never });
    const { container } = render(<NavigationBreadcrumb />);
    expect(container.textContent).not.toContain('[object Object]');
    expect(screen.queryByText('[object Object]')).toBeNull();
    expect(screen.queryByText('Módulo No Disponible')).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid navigation target'),
      expect.anything()
    );
  });

  it('currentView válido profundo → breadcrumb real con labels string', () => {
    useUIStore.setState({ currentView: 'inventory' });
    render(<NavigationBreadcrumb />);
    expect(screen.getByText('Inventario')).toBeInTheDocument();
    expect(screen.queryByText('[object Object]')).toBeNull();
  });
});
