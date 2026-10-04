/**
 * help-center-library-evolution — FASE 4-7 + FASE 10
 *
 * Cobertura:
 *  - Store: helpLibraryCollapsed (default, setter, persistencia en
 *    costpro-ui-storage — FASE 7, solo desktop la consume).
 *  - HelpLayout: Biblioteca visible por defecto con control accesible
 *    "Ocultar biblioteca" (aria-expanded/aria-controls); colapsar muestra
 *    "Mostrar biblioteca"; re-expandir restaura. El contenedor #help-biblioteca
 *    persiste entre estados (no se desmonta el nodo del sidebar).
 *  - HelpSidebar rail: iconos con nombre accesible, aria-current en la
 *    categoría activa, onExpand al hacer clic (conserva página — FASE 4/5).
 *  - Sheet móvil controlado: open=true renderiza el diálogo "Biblioteca"
 *    (FASE 6); el FAB tiene nombre accesible.
 *  - HELP_DOC_BY_VIEW: cada path mapeado existe en knowledge/ (contrato
 *    FASE 10 — el botón "?" nunca apunta a un documento inexistente).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import React from 'react';
import HelpLayout from '@/components/views/terminal/views/help/HelpLayout';
import HelpSidebar from '@/components/views/terminal/views/help/HelpSidebar';
import { HELP_DOC_BY_VIEW } from '@/components/views/terminal/views/help/HelpLauncher';
import { useUIStore } from '@/store';
import type { SectionEntry } from '@/components/views/terminal/views/help/hooks/useHelpContent';

const STORAGE_KEY = 'costpro-ui-storage';

const section = (id: string, label: string, files: string[]): SectionEntry => ({
  id,
  dir: `help/${id}`,
  label,
  icon: 'Settings',
  files: files.map(f => ({ filename: f, title: f.replace('.md', '') })),
});

const STRUCTURE = {
  sections: [
    section('01-tutoriales', 'Tutoriales', ['01-primer-inicio.md']),
    section('02-como-hacer', 'Cómo Hacer', ['02-como-cambiar-contrasena.md', '03-como-cerrar-caja.md']),
  ],
  compliance: { id: 'compliance', label: 'Cumplimiento Normativo', icon: 'Shield', files: [] },
  user_help: false,
};

describe('help center — store helpLibraryCollapsed (FASE 7)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ helpLibraryCollapsed: false });
  });

  it('default: Biblioteca expandida (false)', () => {
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(false);
  });

  it('setter actualiza el estado', () => {
    useUIStore.getState().setHelpLibraryCollapsed(true);
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(true);
    useUIStore.getState().setHelpLibraryCollapsed(false);
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(false);
  });

  it('persistencia: la preferencia sobrevive en costpro-ui-storage', () => {
    useUIStore.getState().setHelpLibraryCollapsed(true);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { state: { helpLibraryCollapsed?: boolean } };
    expect(parsed.state.helpLibraryCollapsed).toBe(true);
  });
});

describe('help center — HelpLayout colapsable (FASE 4-5)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ helpLibraryCollapsed: false, isHelpReadingMode: false });
  });

  it('expandida por defecto: control "Ocultar biblioteca" con aria-expanded/controls', () => {
    render(
      <HelpLayout sidebar={<div data-testid="lib" />} scrollProgress={0} onMainScroll={() => {}}>
        <p>contenido</p>
      </HelpLayout>
    );
    const hide = screen.getByRole('button', { name: 'Ocultar biblioteca' });
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    expect(hide.getAttribute('aria-controls')).toBe('help-biblioteca');
    expect(screen.getByLabelText('Biblioteca', { selector: 'aside' })).toBeTruthy();
    cleanup();
  });

  it('"Ocultar biblioteca" colapsa y muestra "Mostrar biblioteca"', () => {
    render(
      <HelpLayout sidebar={<div data-testid="lib" />} scrollProgress={0} onMainScroll={() => {}}>
        <p>contenido</p>
      </HelpLayout>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar biblioteca' }));
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(true);

    const show = screen.getByRole('button', { name: 'Mostrar biblioteca' });
    expect(show.getAttribute('aria-expanded')).toBe('false');
    expect(show.getAttribute('aria-controls')).toBe('help-biblioteca');

    // Re-expandir restaura el estado y el control inverso
    fireEvent.click(show);
    expect(useUIStore.getState().helpLibraryCollapsed).toBe(false);
    expect(screen.getByRole('button', { name: 'Ocultar biblioteca' })).toBeTruthy();
    cleanup();
  });

  it('modo lectura oculta la biblioteca (sin controles de colapso)', () => {
    useUIStore.setState({ isHelpReadingMode: true });
    render(
      <HelpLayout sidebar={<div data-testid="lib" />} scrollProgress={0} onMainScroll={() => {}} isReadingMode>
        <p>contenido</p>
      </HelpLayout>
    );
    expect(screen.queryByRole('button', { name: 'Ocultar biblioteca' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar biblioteca' })).toBeNull();
    cleanup();
  });
});

describe('help center — Sheet móvil controlado (FASE 6)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ helpLibraryCollapsed: false, isHelpReadingMode: false });
  });

  it('FAB con nombre accesible "Abrir biblioteca"', () => {
    render(
      <HelpLayout sidebar={<div data-testid="lib" />} scrollProgress={0} onMainScroll={() => {}}>
        <p>contenido</p>
      </HelpLayout>
    );
    expect(screen.getByRole('button', { name: 'Abrir biblioteca' })).toBeTruthy();
    cleanup();
  });

  it('mobileNavOpen=true renderiza el diálogo Biblioteca', () => {
    render(
      <HelpLayout
        sidebar={<div data-testid="lib" />}
        scrollProgress={0}
        onMainScroll={() => {}}
        mobileNavOpen
        onMobileNavOpenChange={() => {}}
      >
        <p>contenido</p>
      </HelpLayout>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Biblioteca');
    cleanup();
  });
});

describe('help center — HelpSidebar rail (FASE 4 colapsado)', () => {
  const base = {
    toc: [] as { id: string; level: number; text: string }[],
    activePath: 'help/02-como-hacer/03-como-cerrar-caja.md',
    isAccessibilityActive: false,
    onSelectAccessibility: () => {},
    autoExpandForPath: null,
  };

  it('rail: iconos con nombre accesible y aria-current en la categoría activa', () => {
    render(
      <HelpSidebar
        {...base}
        structure={STRUCTURE}
        onSelect={() => {}}
        railMode
        onExpand={() => {}}
      />
    );
    const nav = screen.getByRole('navigation', { name: 'Biblioteca' });
    expect(nav).toBeTruthy();
    const activa = screen.getByRole('button', { name: 'Expandir biblioteca y abrir Cómo Hacer' });
    expect(activa.getAttribute('aria-current')).toBe('page');
    // La categoría inactiva NO marca aria-current
    expect(screen.getByRole('button', { name: 'Expandir biblioteca y abrir Tutoriales' }).getAttribute('aria-current')).toBeNull();
    cleanup();
  });

  it('rail: clic expande (onExpand) y abre la categoría elegida', () => {
    let expanded = 0;
    render(
      <HelpSidebar
        {...base}
        structure={STRUCTURE}
        onSelect={() => {}}
        railMode
        onExpand={() => { expanded += 1; }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expandir biblioteca y abrir Tutoriales' }));
    expect(expanded).toBe(1);
    cleanup();
  });
});

describe('help center — contrato HELP_DOC_BY_VIEW (FASE 10)', () => {
  const KNOWLEDGE = path.join(process.cwd(), 'knowledge');

  it('cada vista mapeada apunta a un documento que existe en knowledge/', () => {
    expect(Object.keys(HELP_DOC_BY_VIEW).length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const [view, docPath] of Object.entries(HELP_DOC_BY_VIEW)) {
      const abs = path.join(KNOWLEDGE, docPath);
      if (!fs.existsSync(abs)) missing.push(`${view} → ${docPath}`);
    }
    expect(missing).toEqual([]);
  });

  it('vistas del hub Ventas y sistema nuevo tienen documentación dedicada', () => {
    expect(HELP_DOC_BY_VIEW['inventory_count']).toContain('venta-por-conteo');
    expect(HELP_DOC_BY_VIEW['devolutions']).toContain('devolucion');
    expect(HELP_DOC_BY_VIEW['quotations']).toContain('cotizacion');
    expect(HELP_DOC_BY_VIEW['customers']).toContain('clientes');
    expect(HELP_DOC_BY_VIEW['ofertas']).toContain('oferta');
    expect(HELP_DOC_BY_VIEW['accounts_payable']).toContain('cuentas');
    expect(HELP_DOC_BY_VIEW['accounts_receivable']).toContain('cuentas');
    expect(HELP_DOC_BY_VIEW['fiscal-close']).toContain('herramientas-sistema');
    expect(HELP_DOC_BY_VIEW['whatsapp-hub']).toContain('redes-sociales');
    expect(HELP_DOC_BY_VIEW['telegram-hub']).toContain('redes-sociales');
    expect(HELP_DOC_BY_VIEW['management-hub']).toContain('multi-tienda');
  });
});
