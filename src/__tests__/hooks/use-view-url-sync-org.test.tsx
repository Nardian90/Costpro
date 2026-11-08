/**
 * CP-UX-ORG-STORES-002 — Esquema de URL de la página dedicada de organización.
 *
 * Contrato (misión §2.B: «la selección de pestaña debe ser compatible con la
 * URL»): /?view=organization-detail&org=<uuid>&tab=<tiendas|terceros>
 *  · Montaje: la URL GANA → restaura organización y pestaña (refresh, share).
 *  · Store→URL: cada cambio de contexto/pestaña hace pushState.
 *  · Popstate (Back/Forward): la URL vuelve a mandar.
 *  · Sin org en la URL: redirección al listado de organizaciones.
 *  · La URL representa NAVIGACIÓN, no autorización (las APIs validan 403/404).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

const ORG_A = 'aaaaaaaa-1111-1111-1111-111111111111';

function Probe() {
  useViewUrlSyncProbe();
  return null;
}

// El hook real se importa dinámicamente tras fijar la URL inicial
import { useUIStore } from '@/store';
import { useEffect } from 'react';
function useViewUrlSyncProbe() {
  const mod = (globalThis as any).__urlSyncModule;
  const hook = mod?.useViewUrlSync;
  if (hook) hook();
  return null;
}

beforeEach(() => {
  // Estado limpio del store real
  useUIStore.setState({
    currentView: 'dashboard',
    organizationDetailState: { orgId: null, tab: 'tiendas' },
  } as any);
});

describe('useViewUrlSync — contexto de organización en la URL', () => {
  it('montaje con ?view=organization-detail&org&tab=terceros → restaura contexto en el store', async () => {
    window.history.replaceState(null, '', `/?view=organization-detail&org=${ORG_A}&tab=terceros`);
    const { useViewUrlSync } = await import('@/hooks/ui/useViewUrlSync');
    (globalThis as any).__urlSyncModule = { useViewUrlSync };
    render(<Probe />);
    await waitFor(() => {
      const st = useUIStore.getState();
      expect(st.currentView).toBe('organization-detail');
      expect(st.organizationDetailState.orgId).toBe(ORG_A);
      expect(st.organizationDetailState.tab).toBe('terceros');
    });
    cleanup();
  });

  it('montaje SIN org en la URL → redirige al listado de organizaciones', async () => {
    window.history.replaceState(null, '', '/?view=organization-detail');
    const { useViewUrlSync } = await import('@/hooks/ui/useViewUrlSync');
    (globalThis as any).__urlSyncModule = { useViewUrlSync };
    render(<Probe />);
    await waitFor(() => {
      expect(useUIStore.getState().currentView).toBe('organizations');
    });
    cleanup();
  });

  it('cambio de contexto/pestaña en el store → pushState con view+org+tab', async () => {
    const { useViewUrlSync } = await import('@/hooks/ui/useViewUrlSync');
    (globalThis as any).__urlSyncModule = { useViewUrlSync };
    window.history.replaceState(null, '', '/');
    render(<Probe />);
    useUIStore.setState({
      currentView: 'organization-detail',
      organizationDetailState: { orgId: ORG_A, tab: 'terceros' },
    } as any);
    await waitFor(() => {
      expect(window.location.search).toBe(`?view=organization-detail&org=${ORG_A}&tab=terceros`);
    });
    cleanup();
  });

  it('montaje con tab=catalogo (pestaña absorbida del modal) → restaura esa pestaña', async () => {
    window.history.replaceState(null, '', `/?view=organization-detail&org=${ORG_A}&tab=catalogo`);
    const { useViewUrlSync } = await import('@/hooks/ui/useViewUrlSync');
    (globalThis as any).__urlSyncModule = { useViewUrlSync };
    render(<Probe />);
    await waitFor(() => {
      const st = useUIStore.getState();
      expect(st.currentView).toBe('organization-detail');
      expect(st.organizationDetailState.tab).toBe('catalogo');
    });
    cleanup();
  });

  it('tab desconocido en la URL → aterriza en la entrada principal (tiendas)', async () => {
    window.history.replaceState(null, '', `/?view=organization-detail&org=${ORG_A}&tab=hackeado`);
    const { useViewUrlSync } = await import('@/hooks/ui/useViewUrlSync');
    (globalThis as any).__urlSyncModule = { useViewUrlSync };
    render(<Probe />);
    await waitFor(() => {
      const st = useUIStore.getState();
      expect(st.currentView).toBe('organization-detail');
      expect(st.organizationDetailState.tab).toBe('tiendas');
    });
    cleanup();
  });

  it('popstate (Back/Forward) restaura organización y pestaña desde la URL', async () => {
    const { useViewUrlSync } = await import('@/hooks/ui/useViewUrlSync');
    (globalThis as any).__urlSyncModule = { useViewUrlSync };
    render(<Probe />);
    // Simular historial: hacia una URL anterior de la misma página en otro tab
    window.history.pushState(null, '', `/?view=organization-detail&org=${ORG_A}&tab=tiendas`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => {
      const st = useUIStore.getState();
      expect(st.currentView).toBe('organization-detail');
      expect(st.organizationDetailState.orgId).toBe(ORG_A);
      expect(st.organizationDetailState.tab).toBe('tiendas');
    });
    cleanup();
  });
});
