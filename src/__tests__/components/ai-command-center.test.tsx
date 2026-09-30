/**
 * AI COMMAND CENTER — tests del nuevo Inicio.
 *
 * Cobertura:
 *   - lib/darian/recent-actions: roundtrip, cap 20, user-scoping (GATE 17),
 *     dedupe 60s, tiempo relativo.
 *   - AICommandCenterView: estado inicial (chat + recents vacíos) y GATE 9
 *     (conversación activa → recents desmontados).
 *   - RecentActivityPanel: render de entradas, reapertura de navegación
 *     (GATE 19), reapertura de consulta (evento conversación) y filtro por
 *     tienda activa (GATE 17).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import React from 'react';

// ─── MOCK: next/dynamic resuelve el loader inmediatamente ──────────────────
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: (loader: any) => {
      return function DynamicMock(props: any) {
        const [Comp, setComp] = React.useState<any>(null);
        React.useEffect(() => {
          let alive = true;
          Promise.resolve(loader()).then((m: any) => {
            if (alive) setComp(() => m);
          });
          return () => { alive = false; };
        }, [loader]);
        if (!Comp) return <div data-testid="dynamic-loading" />;
        const C = Comp;
        return <C {...props} />;
      };
    },
  };
});

// ─── MOCK: ChatBot (el motor real se valida en QA de browser) ───────────────
vi.mock('@/components/ui/ChatBot', () => ({
  ChatBot: ({ embedded, onConversationChange }: any) => (
    <div data-testid="chatbot-embedded" data-embedded={String(Boolean(embedded))}>
      <button
        type="button"
        data-testid="simulate-active"
        onClick={() => onConversationChange?.(true, 'convo-1')}
      >
        start
      </button>
      <button
        type="button"
        data-testid="simulate-idle"
        onClick={() => onConversationChange?.(false, null)}
      >
        clear
      </button>
    </div>
  ),
}));

// ─── MOCK: DashboardView (el dashboard real se valida en QA de browser) ────
vi.mock('@/components/views/terminal/views/dashboard/DashboardView', () => ({
  default: ({ embedded }: any) => (
    <div
      data-testid="store-dashboard-embedded"
      data-embedded={String(Boolean(embedded))}
    />
  ),
}));

// ─── MOCK: stores (zustand mínimo — mismos selectores que usa el código) ────
const setCurrentViewMock = vi.fn();
vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useUIStore = create(() => ({
    currentView: 'dashboard' as string,
    setCurrentView: (...args: any[]) => setCurrentViewMock(...args),
    isChatBotOpen: false,
    setIsChatBotOpen: vi.fn(),
  }));
  const useAuthStore = create(() => ({
    user: { id: 'user-a', activeStoreId: 'store-1', name: 'QA' },
  }));
  return { useUIStore, useAuthStore };
});

import { recordDarianAction, getDarianActions, formatRelativeTime, type RecentDarianAction } from '@/lib/darian/recent-actions';
import AICommandCenterView from '@/components/views/terminal/views/dashboard/AICommandCenterView';
import RecentActivityPanel from '@/components/views/terminal/views/dashboard/RecentActivityPanel';

const KEY_A = 'darian_recent_actions_user-a';
const KEY_B = 'darian_recent_actions_user-b';

beforeEach(() => {
  localStorage.clear();
  setCurrentViewMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('recent-actions (log user-scoped)', () => {
  it('registra y lee una acción (roundtrip)', () => {
    recordDarianAction({ kind: 'navigation', title: 'Navegó a pos', viewId: 'pos' }, 'user-a');
    const entries = getDarianActions('user-a');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('navigation');
    expect(entries[0].title).toBe('Navegó a pos');
    expect(entries[0].viewId).toBe('pos');
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('cap 20 entradas — lo más reciente queda primero (GATE 6)', () => {
    for (let i = 0; i < 25; i++) {
      recordDarianAction({ kind: 'query', title: `Consulta ${i}` }, 'user-a');
    }
    const entries = getDarianActions('user-a');
    expect(entries).toHaveLength(20);
    expect(entries[0].title).toBe('Consulta 24');
    expect(entries[19].title).toBe('Consulta 5');
  });

  it('user-scoping: el log de user-a jamás es visible para user-b (GATE 17)', () => {
    recordDarianAction({ kind: 'query', title: ' secreto de A' }, 'user-a');
    expect(getDarianActions('user-b')).toHaveLength(0);
    expect(localStorage.getItem(KEY_B)).toBeNull();
    // guest es namespace distinto también
    expect(getDarianActions(null)).toHaveLength(0);
  });

  it('dedupe: misma kind+title en <60s refresca sin duplicar', () => {
    recordDarianAction({ kind: 'query', title: '¿Qué vendió hoy?' }, 'user-a');
    const first = getDarianActions('user-a')[0];
    recordDarianAction({ kind: 'query', title: '¿Qué vendió hoy?' }, 'user-a');
    const entries = getDarianActions('user-a');
    expect(entries).toHaveLength(1);
    expect(entries[0].timestamp).toBeGreaterThanOrEqual(first.timestamp);
  });

  it('sanitiza títulos multilínea/largos', () => {
    const long = 'x  '.repeat(60) + '\nsegunda línea';
    recordDarianAction({ kind: 'query', title: long }, 'user-a');
    const entry = getDarianActions('user-a')[0];
    expect(entry.title).not.toContain('\n');
    expect(entry.title.length).toBeLessThanOrEqual(73); // 72 + ellipsis
  });

  it('formatRelativeTime produce tiempos relativos legibles', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 10_000, now)).toBe('Ahora mismo');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('Hace 5 min');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('Hace 3 h');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('Hace 2 d');
  });
});

describe('AICommandCenterView (Inicio)', () => {
  it('estado inicial: Dashboard de la tienda activa + chat embebido + recents (CAMBIO 1)', async () => {
    render(<AICommandCenterView />);
    await waitFor(() => {
      expect(screen.getByTestId('chatbot-embedded')).toBeInTheDocument();
    });
    expect(screen.getByTestId('chatbot-embedded').getAttribute('data-embedded')).toBe('true');
    // CAMBIO 1: el dashboard de la tienda activa va encima de Darian,
    // reutilizando la vista existente en modo embebido (PageHeader h2)
    await waitFor(() => {
      expect(screen.getByTestId('inicio-store-dashboard')).toBeInTheDocument();
    });
    const embedded = screen.getByTestId('store-dashboard-embedded');
    expect(embedded.getAttribute('data-embedded')).toBe('true');
    expect(screen.getByTestId('recent-activity-empty')).toBeInTheDocument();
  });

  it('GATE 9 + CAMBIO 1: conversación activa → recents Y dashboard desmontados; idle → regresan', async () => {
    render(<AICommandCenterView />);
    await waitFor(() => screen.getByTestId('chatbot-embedded'));
    await waitFor(() => screen.getByTestId('store-dashboard-embedded'));

    fireEvent.click(screen.getByTestId('simulate-active'));
    await waitFor(() => {
      expect(screen.queryByTestId('recent-activity-empty')).not.toBeInTheDocument();
      // La conversación toma prioridad: el dashboard embebido se desmonta
      expect(screen.queryByTestId('inicio-store-dashboard')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('simulate-idle'));
    await waitFor(() => {
      expect(screen.getByTestId('recent-activity-empty')).toBeInTheDocument();
      expect(screen.getByTestId('inicio-store-dashboard')).toBeInTheDocument();
    });
  });

  it('estado inicial con entradas: muestra el panel, no el empty state', async () => {
    recordDarianAction({ kind: 'navigation', title: 'Navegó a pos', viewId: 'pos', storeId: 'store-1' }, 'user-a');
    render(<AICommandCenterView />);
    await waitFor(() => screen.getByTestId('chatbot-embedded'));
    await waitFor(() => {
      expect(screen.queryByTestId('recent-activity-empty')).not.toBeInTheDocument();
      expect(screen.getByTestId('recent-activity-list')).toBeInTheDocument();
    });
  });
});

describe('RecentActivityPanel', () => {
  it('reapertura de navegación → setCurrentView con el destino (GATE 19)', () => {
    recordDarianAction({ kind: 'navigation', title: 'Navegó a pos', viewId: 'pos', storeId: 'store-1' }, 'user-a');
    render(<RecentActivityPanel />);
    expect(screen.getByText('Navegó a pos')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recent-reopen'));
    expect(setCurrentViewMock).toHaveBeenCalledWith('pos');
  });

  it('reapertura de consulta → evento conversación + vista chat (GATE 19)', () => {
    recordDarianAction({ kind: 'query', title: '¿Qué vendió hoy?', conversationId: 'c-42', storeId: 'store-1' }, 'user-a');
    const listener = vi.fn();
    window.addEventListener('darian:open-conversation', listener);
    render(<RecentActivityPanel />);
    fireEvent.click(screen.getByTestId('recent-reopen'));
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.conversationId).toBe('c-42');
    expect(setCurrentViewMock).toHaveBeenCalledWith('chat');
    window.removeEventListener('darian:open-conversation', listener);
  });

  it('GATE 17: entradas de otra tienda no se muestran', () => {
    recordDarianAction({ kind: 'query', title: 'otra tienda', storeId: 'otra-tienda-xyz' }, 'user-a');
    recordDarianAction({ kind: 'query', title: 'mi tienda', storeId: 'store-1' }, 'user-a');
    recordDarianAction({ kind: 'query', title: 'sin tienda' }, 'user-a');
    render(<RecentActivityPanel />);
    expect(screen.getByText('mi tienda')).toBeInTheDocument();
    expect(screen.getByText('sin tienda')).toBeInTheDocument();
    expect(screen.queryByText('otra tienda')).not.toBeInTheDocument();
  });

  it('acciones sin contexto reabrible no muestran botón Reabrir', () => {
    recordDarianAction({ kind: 'export', title: 'Generó exportación CSV' }, 'user-a');
    render(<RecentActivityPanel />);
    expect(screen.getByText('Generó exportación CSV')).toBeInTheDocument();
    expect(screen.queryByTestId('recent-reopen')).not.toBeInTheDocument();
  });
});
