/**
 * sidebar-hover-expand — tests de integración (Fase hover-expand)
 *
 * Cobertura Fase 15:
 *  [Sidebar principal]
 *   - Collapsed (rail) → solo iconos (sin etiquetas de texto).
 *   - Hover sobre el ASIDE completo → expande temporalmente (sin clic).
 *   - Mouse leave → vuelve a rail.
 *   - Anti-flapping (re-entrada cancela el colapso).
 *   - Expandido fijado → leave NO colapsa.
 *   - Clic navega; clic en módulo raíz fija expandido (pin preservado).
 *   - Teclado: Enter sobre icono de rail funciona sin hover.
 *   - Móvil/touch: hover NO expande.
 *   - Persistencia: el ciclo hover no muta sidebarState.
 *  [Biblioteca del Centro de Ayuda]
 *   - Collapsed → rail; hover → flyout expandido (sin clic); leave → rail.
 *   - helpLibraryCollapsed NUNCA cambia por hover.
 *   - Expandida fija → sin flyout.
 *   - Touch → sin flyout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import React from 'react';
import Sidebar from '@/components/views/terminal/Sidebar';
import HelpLayout from '@/components/views/terminal/views/help/HelpLayout';
import HelpSidebar from '@/components/views/terminal/views/help/HelpSidebar';
import { SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
import { useUIStore } from '@/store';
import type { SectionEntry } from '@/components/views/terminal/views/help/hooks/useHelpContent';

const hoverState = { finePointer: true };

// jsdom no implementa matchMedia — stub controlable (desktop por defecto).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('hover: hover') ? hoverState.finePointer : false,
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

// React sintetiza onMouseEnter/onMouseLeave a partir de mouseover/mouseout —
// fireEvent.mouseEnter puro no dispara el handler sintético.
const hoverIn = (el: Element) => fireEvent.mouseOver(el);
const hoverOut = (el: Element) => fireEvent.mouseOut(el);

const getAside = (container: HTMLElement) => container.querySelector('aside[data-sidebar]') as HTMLElement;
const getHelpAside = (container: HTMLElement) => container.querySelector('#help-biblioteca') as HTMLElement;
// Los timers disparan setHoverExpanded → deben ejecutarse dentro de act()
// para que React flush-ee el re-render antes de las aserciones.
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

const FIRST_MODULE_LABEL = SIDEBAR_STRUCTURE[0].label;

// ─────────────────────────── Sidebar principal ───────────────────────────

describe('Sidebar principal — hover expand (rail → expandido temporal)', () => {
  const view = {
    onViewChange: vi.fn(),
    onLogout: vi.fn(),
    onClose: vi.fn(),
    onPrefetchView: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hoverState.finePointer = true;
    setViewport(1280);
    localStorage.clear();
    useUIStore.setState({ sidebarState: 'rail' });
    Object.values(view).forEach(fn => fn.mockClear());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('F15.1 collapsed: muestra solo iconos (sin etiquetas) y ancho rail', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);
    expect(aside.className).toContain('w-20');
    // Rail: botones con aria-label pero SIN spans de texto con la etiqueta.
    expect(screen.getByRole('button', { name: FIRST_MODULE_LABEL })).toBeTruthy();
    expect(screen.queryByText(FIRST_MODULE_LABEL)).toBeNull();
  });

  it('F15.2 hover sobre el aside → expande tras el delay, SIN clic; store intacto', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(99);
    expect(screen.queryByText(FIRST_MODULE_LABEL)).toBeNull(); // aún en delay
    advance(1);
    expect(screen.queryByText(FIRST_MODULE_LABEL)).not.toBeNull(); // expandido
    expect(aside.className).toContain('w-64');
    // El hover NO muta el estado persistido.
    expect(useUIStore.getState().sidebarState).toBe('rail');
  });

  it('F15.3 mouse leave → vuelve a rail', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(100);
    expect(aside.className).toContain('w-64');

    hoverOut(aside);
    advance(179);
    expect(aside.className).toContain('w-64'); // aún en delay de contracción
    advance(1);
    expect(aside.className).toContain('w-20');
    expect(screen.queryByText(FIRST_MODULE_LABEL)).toBeNull();
  });

  it('F15.4 anti-flapping: re-entrada dentro del delay de contracción mantiene expandido', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(100);
    hoverOut(aside);
    advance(100); // < collapseDelayMs
    hoverIn(aside); // re-entra → cancela colapso
    advance(300);
    expect(aside.className).toContain('w-64');
  });

  it('F15.5 expandido fijado: mouse leave NO colapsa', () => {
    useUIStore.setState({ sidebarState: 'expanded' });
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(300);
    hoverOut(aside);
    advance(500);
    expect(aside.className).toContain('w-64');
    expect(screen.queryByText(FIRST_MODULE_LABEL)).not.toBeNull();
    expect(useUIStore.getState().sidebarState).toBe('expanded');
  });

  it('F15.6 clic en módulo raíz (hover-expandido) navega y FIJA expandido (pin preservado)', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(100);
    fireEvent.click(screen.getByRole('button', { name: FIRST_MODULE_LABEL }));

    expect(view.onViewChange).toHaveBeenCalledWith('pos'); // MODULE_DEFAULT_VIEW.operacion
    expect(useUIStore.getState().sidebarState).toBe('expanded'); // enterFocusMode fija
  });

  it('F15.7 teclado: Enter/click en icono de rail funciona sin hover (accesible)', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);
    expect(aside.className).toContain('w-20');

    // Usuario de teclado: focus + activación directa sobre el icono del rail.
    fireEvent.click(screen.getByRole('button', { name: FIRST_MODULE_LABEL }));
    expect(view.onViewChange).toHaveBeenCalledWith('pos');
    expect(useUIStore.getState().sidebarState).toBe('expanded');
  });

  it('F15.8 móvil/touch: hover NO expande (patrón drawer intacto)', () => {
    hoverState.finePointer = false; // dispositivo táctil
    setViewport(375);
    useUIStore.setState({ sidebarState: 'expanded' }); // drawer abierto en móvil
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(1000);
    // En touch el drawer se comporta igual; no hay lógica de hover.
    expect(useUIStore.getState().sidebarState).toBe('expanded');
  });

  it('F15.9 persistencia: ciclo hover completo no altera sidebarState en memoria', () => {
    const { container } = render(<Sidebar {...view} />);
    const aside = getAside(container);

    hoverIn(aside);
    advance(100);
    hoverOut(aside);
    advance(200);
    expect(useUIStore.getState().sidebarState).toBe('rail');
  });
});

// ─────────────────────── Biblioteca (Centro de Ayuda) ───────────────────────

describe('Help Library — hover flyout (collapsed → expandida temporal)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hoverState.finePointer = true;
    setViewport(1280);
    localStorage.clear();
    useUIStore.setState({ helpLibraryCollapsed: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('F15.10 collapsed: rail visible, sin flyout', () => {
    const { container } = renderHelp();
    const aside = getHelpAside(container);

    expect(aside.className).toContain('w-[68px]');
    expect(screen.getByRole('navigation', { name: 'Biblioteca' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar biblioteca' })).toBeTruthy();
    expect(screen.queryByTestId('help-library-flyout')).toBeNull();
  });

  it('F15.11 hover sobre el aside → flyout expandido sin clic; preferencia intacta', () => {
    const { container } = renderHelp();
    const aside = getHelpAside(container);

    hoverIn(aside);
    advance(100);

    const flyout = screen.getByTestId('help-library-flyout');
    expect(within(flyout).getByRole('button', { name: 'Ocultar biblioteca' })).toBeTruthy();
    expect(within(flyout).getByText('Tutoriales')).toBeTruthy(); // categorías expandidas
    // El rail queda oculto (visibility + aria-hidden → fuera del árbol accesible,
    // no duplica foco ni nombres mientras el flyout está activo).
    const railShowBtn = container.querySelector('button[title="Mostrar biblioteca"]') as HTMLElement;
    expect(railShowBtn).not.toBeNull();
    expect(railShowBtn.closest('[aria-hidden="true"]')).not.toBeNull();
    // El hover NUNCA cambia la preferencia persistida.
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(true);
  });

  it('F15.12 mouse leave → flyout desaparece y vuelve el rail', () => {
    const { container } = renderHelp();
    const aside = getHelpAside(container);

    hoverIn(aside);
    advance(100);
    hoverOut(aside);
    advance(180);

    expect(screen.queryByTestId('help-library-flyout')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mostrar biblioteca' })).toBeTruthy();
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(true);
  });

  it('F15.13 expandida fija: hover/leave NO montan flyout', () => {
    useUIStore.setState({ helpLibraryCollapsed: false });
    const { container } = renderHelp();
    const aside = getHelpAside(container);

    expect(aside.className).toContain('w-[300px]');
    hoverIn(aside);
    advance(300);
    expect(screen.queryByTestId('help-library-flyout')).toBeNull();
    hoverOut(aside);
    advance(300);
    expect(screen.getByRole('button', { name: 'Ocultar biblioteca' })).toBeTruthy();
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(false);
  });

  it('F15.14 touch: sin puntero fino no hay flyout', () => {
    hoverState.finePointer = false;
    const { container } = renderHelp();
    const aside = getHelpAside(container);

    hoverIn(aside);
    advance(1000);
    expect(screen.queryByTestId('help-library-flyout')).toBeNull();
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(true);
  });

  it('F15.15 botón "Mostrar biblioteca" (sin hover) fija expandida — comportamiento persistente intacto', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar biblioteca' }));
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(false);
    expect(screen.queryByTestId('help-library-flyout')).toBeNull();
  });
});
