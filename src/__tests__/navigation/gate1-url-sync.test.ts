/**
 * GATE 1 §6 — Tests del hook useViewUrlSync (URL ↔ navegación).
 *
 * Cubre los comportamientos contractuales aprobados:
 *   - pushState al cambiar de vista (Back/Forward del navegador)
 *   - popstate: Back restaura la vista anterior en el store
 *   - Refresh/Deep link: la URL gana sobre el estado persistido
 *   - Alias legacy: ?view=occ → dashboard
 *   - Home limpia: dashboard ⇒ '/'
 *   - Tabs de módulo: ?view=ipv&tab=… y ?view=cost-sheets&tab=…
 *
 * Nota jsdom: los efectos y popstate se asientan en micro/macro-tareas —
 * cada interacción se espera con un tick antes de asertar.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewUrlSync } from '@/hooks/ui/useViewUrlSync';
import { useUIStore } from '@/store';

const ROUTE = '/';
const tick = () => new Promise(r => setTimeout(r, 10));

function setUrl(search: string) {
  const clean = search.replace(/^\?/, ''); // tolera llamadas con o sin '?'
  window.history.replaceState(null, '', clean ? `${ROUTE}?${clean}` : ROUTE);
}

describe('useViewUrlSync', () => {
  beforeEach(() => {
    setUrl('');
    useUIStore.setState({ currentView: 'dashboard', ipvActiveTab: 'dashboard', activeCostSection: 'gen-easy' });
  });

  afterEach(() => {
    setUrl('');
  });

  it('home limpia: dashboard ⇒ URL "/" sin query', async () => {
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    unmount();
  });

  it('cambio de vista hace pushState con formato canónico', async () => {
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    await act(async () => {
      useUIStore.getState().setCurrentView('pos');
    });
    expect(window.location.search).toBe('?view=pos');
    unmount();
  });

  it('cambio a home vuelve a URL limpia "/"', async () => {
    setUrl('?view=inventory');
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    await act(async () => {
      useUIStore.getState().setCurrentView('dashboard');
    });
    expect(window.location.search).toBe('');
    unmount();
  });

  it('Back del navegador restaura la vista anterior (popstate)', async () => {
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    await act(async () => {
      useUIStore.getState().setCurrentView('pos');
    });
    expect(useUIStore.getState().currentView).toBe('pos');
    expect(window.location.search).toBe('?view=pos');

    await act(async () => {
      window.history.back();
      await tick();
    });

    expect(useUIStore.getState().currentView).toBe('dashboard');
    expect(window.location.search).toBe('');
    unmount();
  });

  it('deep link: URL gana sobre el estado al montar', async () => {
    setUrl('?view=inventory');
    useUIStore.setState({ currentView: 'dashboard' });
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    expect(useUIStore.getState().currentView).toBe('inventory');
    unmount();
  });

  it('alias legacy: ?view=occ aterriza en dashboard', async () => {
    setUrl('?view=occ');
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    expect(useUIStore.getState().currentView).toBe('dashboard');
    unmount();
  });

  it('vista-módulo con tab: ?view=ipv&tab=transactions hidrata vista y tab', async () => {
    setUrl('?view=ipv&tab=transactions');
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    expect(useUIStore.getState().currentView).toBe('ipv');
    expect(useUIStore.getState().ipvActiveTab).toBe('transactions');
    unmount();
  });

  it('vista-módulo cost-sheets: ?view=cost-sheets&tab=gen-easy hidrata sección', async () => {
    setUrl('?view=cost-sheets&tab=gen-easy');
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    expect(useUIStore.getState().currentView).toBe('cost-sheets');
    expect(useUIStore.getState().activeCostSection).toBe('gen-easy');
    unmount();
  });

  it('cambio de tab de hub actualiza la URL (pushState por tab)', async () => {
    setUrl('?view=ipv&tab=dashboard');
    useUIStore.setState({ currentView: 'ipv', ipvActiveTab: 'dashboard' });
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    await act(async () => {
      useUIStore.getState().setIpvActiveTab('transactions');
    });
    expect(window.location.search).toBe('?view=ipv&tab=transactions');
    unmount();
  });

  it('la URL no concede autorización: el hook aplica la vista solicitada y el guard de render es quien bloquea', async () => {
    // Documentación contractual: el hook setea 'users' aunque el rol no
    // permita — TerminalShell.isViewAllowedForRole es la capa que bloquea
    // (ver gate1-navigation.test.ts) y el backend/RLS manda al final.
    setUrl('?view=users');
    const { unmount } = renderHook(() => useViewUrlSync());
    await act(tick);
    expect(useUIStore.getState().currentView).toBe('users');
    unmount();
  });
});
