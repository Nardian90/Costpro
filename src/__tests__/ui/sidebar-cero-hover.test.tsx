/**
 * CP-SIDEBAR-RESTORATION-001 (2026-11-24) — CERO expansión automática.
 *
 * Sustituye a los antiguos sidebar-hover-expand / useSidebarHoverExpand:
 * el hover NUNCA modifica el ancho ni el estado del menú (§4 de la misión).
 *  · mouseenter/mouseleave/mouseover sobre la barra NO expanden ni contraen.
 *  · No existen temporizadores que expandan (se avanzan 1s relojes falsos).
 *  · La expansión solo ocurre por CLIC en el control único del encabezado.
 *  · Los tooltips discreto (title / Radix) no alteran el layout.
 *  · La Biblioteca de Ayuda perdió su flyout por hover: solo el control
 *    persistente «Mostrar biblioteca» la expande.
 * Store REAL (zustand + persist) — sin mocks de '@/store'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import React from 'react';
import Sidebar from '@/components/views/terminal/Sidebar';
import HelpLayout from '@/components/views/terminal/views/help/HelpLayout';
import HelpSidebar from '@/components/views/terminal/views/help/HelpSidebar';
import { useUIStore } from '@/store';
import type { SectionEntry } from '@/components/views/terminal/views/help/hooks/useHelpContent';

// jsdom no implementa matchMedia — stub neutro (el componente ya no lo usa
// para hover; se registra para otros consumidores si aparecieran).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

const setViewport = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
};

// React sintetiza onMouseEnter/onMouseLeave desde mouseover/mouseout.
const hoverIn = (el: Element) => fireEvent.mouseOver(el);
const hoverOut = (el: Element) => fireEvent.mouseOut(el);
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

const getAside = (container: HTMLElement) => container.querySelector('aside[data-sidebar]') as HTMLElement;
const getHelpAside = (container: HTMLElement) => container.querySelector('#help-biblioteca') as HTMLElement;

// ── Fixtures Biblioteca (mismo patrón que help-center-library.test.tsx) ──
const section = (id: string, label: string, files: string[]): SectionEntry => ({
  id,
  dir: `help/${id}`,
  label,
  icon: 'Settings',
  files: files.map(f => ({ filename: f, title: f.replace('.md', '') })),
});

const STRUCTURE = {
  sections: [section('01-tutoriales', 'Tutoriales', ['01-primer-inicio.md'])],
  compliance: { id: 'compliance', label: 'Cumplimiento Normativo', icon: 'Shield', files: [] },
  user_help: false,
};

const renderHelp = () =>
  render(
    <HelpLayout
      sidebar={
        <HelpSidebar
          structure={STRUCTURE}
          toc={[]}
          onSelect={vi.fn()}
          activePath={undefined}
          isAccessibilityActive={false}
          onSelectAccessibility={vi.fn()}
          autoExpandForPath={null}
          railMode // HelpView pasa railMode={helpLibraryCollapsed}
        />
      }
      scrollProgress={0}
      onMainScroll={vi.fn()}
    >
      <div>ARTICULO</div>
    </HelpLayout>,
  );

const noop = () => {};
const mountSidebar = () =>
  render(<Sidebar onViewChange={noop} onLogout={noop} onPrefetchView={noop} />);

// ─────────────────────── Sidebar principal — CERO hover ───────────────────────

describe('CP-SIDEBAR-RESTORATION-001 · Sidebar principal — hover NO modifica nada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setViewport(1366);
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'dashboard' });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('ESTADO B (rail): mouseenter/leave sobre la barra NO expanden — ni ahora ni tras 1s', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    const { container } = mountSidebar();
    const aside = getAside(container);
    expect(aside.className).toContain('w-20');

    hoverIn(aside);
    advance(1000); // más que cualquier timer histórico (100/180 ms)
    expect(aside.className).toContain('w-20');
    expect(aside.className).not.toContain('w-64');
    expect(useUIStore.getState().sidebarState).toBe('rail');

    hoverOut(aside);
    advance(1000);
    expect(aside.className).toContain('w-20');
    expect(useUIStore.getState().sidebarState).toBe('rail');
    // Los iconos siguen; las etiquetas NO aparecen por hover
    expect(screen.getByRole('button', { name: 'OPERACIÓN' })).toBeTruthy();
    expect(screen.queryByText('OPERACIÓN', { selector: 'span' })).toBeNull();
  });

  it('ESTADO A (expandido): el hover no contrae ni altera el estado', () => {
    const { container } = mountSidebar();
    const aside = getAside(container);
    expect(aside.className).toContain('w-64');

    hoverIn(aside);
    advance(1000);
    expect(aside.className).toContain('w-64');
    expect(useUIStore.getState().sidebarState).toBe('expanded');

    hoverOut(aside);
    advance(1000);
    expect(useUIStore.getState().sidebarState).toBe('expanded');
  });

  it('la ÚNICA expansión posible: CLIC en el control del encabezado (ida y vuelta)', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    const { container } = mountSidebar();
    const aside = getAside(container);

    // Hover no basta; el clic en el control único sí
    hoverIn(aside);
    advance(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menú lateral' }));
    advance(50);
    expect(useUIStore.getState().sidebarState).toBe('expanded');
    expect(getAside(container).className).toContain('w-64');

    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú lateral' }));
    advance(50);
    expect(useUIStore.getState().sidebarState).toBe('rail');
    expect(getAside(container).className).toContain('w-20');
  });

  it('inspección visual: exactamente UN control del menú en cada estado (sin pin/show-hide)', () => {
    const { container } = mountSidebar();
    let aside = getAside(container);
    expect(within(aside).getAllByRole('button', { name: /menú lateral/ })).toHaveLength(1);
    expect(within(aside).queryByRole('button', { name: /Fijar menú lateral/ })).toBeNull();
    expect(within(aside).queryByRole('button', { name: /Desfijar menú lateral/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú lateral' }));
    aside = getAside(container);
    expect(within(aside).getAllByRole('button', { name: /menú lateral/ })).toHaveLength(1);
  });
});

// ─────────────────────── Biblioteca de Ayuda — sin flyout ───────────────────────

describe('CP-SIDEBAR-RESTORATION-001 · Biblioteca de Ayuda — hover sin flyout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setViewport(1366);
    useUIStore.setState({ helpLibraryCollapsed: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('colapsada: el hover sobre el aside NO monta flyout ni cambia el ancho', () => {
    const { container } = renderHelp();
    const aside = getHelpAside(container);
    expect(aside.className).toContain('w-[68px]');

    hoverIn(aside);
    advance(1000);
    expect(container.querySelector('[data-testid="help-library-flyout"]')).toBeNull();
    expect(aside.className).toContain('w-[68px]');

    hoverOut(aside);
    advance(200);
    expect(container.querySelector('[data-testid="help-library-flyout"]')).toBeNull();
  });

  it('la expansión es exclusiva del control persistente «Mostrar biblioteca»', () => {
    const { container } = renderHelp();
    const aside = getHelpAside(container);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar biblioteca' }));
    advance(50);
    expect(aside.className).toContain('w-[300px]');
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar biblioteca' }));
    advance(50);
    expect(aside.className).toContain('w-[68px]');
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(true);
  });
});
