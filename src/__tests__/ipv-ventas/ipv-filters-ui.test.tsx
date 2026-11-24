/**
 * Pruebas de UI de los FILTROS DE RESULTADOS del IPV (petición 2026-11-06,
 * ampliada misión 2026-11-24: filtro de movimientos Todos/Con/Sin, opción
 * «Ocultar columnas sin valores» y selector de orientación del PDF).
 *
 * Vista real IpvVentasView con la API mockeada (dataset sintético de 4
 * productos que cubren los casos A, B, E y F de la petición):
 *   · Producto Entra y Sale (A): Ei 0 · entradas 50 · vendidas 50 · Ef 0.
 *   · Producto Quieto (B): Ei 20 · sin movimientos · Ef 20.
 *   · Producto Activo (E): Ei 5 · entradas 20 · vendidas 10 · Ef 15.
 *   · Producto Negativo (F): Ei 5 · vendidas 8 · Ef −3.
 *
 * Verifica: grupo de movimientos (selección exclusiva), aria-pressed, conteo
 * «N de M productos», badge de filtros activos, «Restablecer filtros»,
 * exclusión/inclusión de filas, mensaje vacío, ocultado de columnas sin
 * valores (con recálculo al cambiar el filtro de filas) y orientación del PDF.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/stores')) {
      return { data: [{ id: 'store-1', name: 'Costpro Central' }] };
    }
    if (u.includes('/api/ipv-ventas')) {
      const rows = [
        { productId: 'p-a', sku: '100', name: 'Producto Entra y Sale', unit: 'un', existenciaInicial: 0, cantidadesVendidas: 50, valesSalidas: 0, entradas: 50, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 0, ventasImporteCup: 2500, ventasImporteUsd: 0, ventasCupHistorico: 0, hasPeriodMovements: true, incidenceTypes: [] },
        { productId: 'p-b', sku: '200', name: 'Producto Quieto', unit: 'un', existenciaInicial: 20, cantidadesVendidas: 0, valesSalidas: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 20, ventasImporteCup: 0, ventasImporteUsd: 0, ventasCupHistorico: 0, hasPeriodMovements: false, incidenceTypes: [] },
        { productId: 'p-e', sku: '300', name: 'Producto Activo', unit: 'un', existenciaInicial: 5, cantidadesVendidas: 10, valesSalidas: 0, entradas: 20, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 15, ventasImporteCup: 1000, ventasImporteUsd: 0, ventasCupHistorico: 0, hasPeriodMovements: true, incidenceTypes: [] },
        { productId: 'p-f', sku: '400', name: 'Producto Negativo', unit: 'un', existenciaInicial: 5, cantidadesVendidas: 8, valesSalidas: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: -3, ventasImporteCup: 800, ventasImporteUsd: 0, ventasCupHistorico: 0, hasPeriodMovements: true, incidenceTypes: [] },
      ];
      const totals = {
        existenciaInicial: 30, cantidadesVendidas: 68, valesSalidas: 0,
        entradas: 70, devoluciones: 0, ajustes: 0, transferencias: 0,
        existenciaFinal: 32, ventasImporteCup: 4300, ventasImporteUsd: 0,
        ventasCupHistorico: 0,
      };
      return {
        store: { id: 'store-1', name: 'Costpro Central' },
        window: { fromISO: '2026-11-01T04:00:00.000Z', toISO: '2026-11-06T03:59:59.999Z' },
        result: { rows, incidences: [], totals, excludedCount: 0, devolucionesNoAtribuibles: { cup: 0, usd: 0 } },
        generatedAt: '2026-11-06T12:00:00.000Z',
      };
    }
    return {};
  }),
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({
    user: {
      id: 'u1',
      fullName: 'Admin Demo',
      role: 'admin',
      activeStoreId: 'store-1',
      memberships: [{ store_id: 'store-1', status: 'active' }],
    },
  }),
  useUIStore: (sel: (s: unknown) => unknown) => sel({}),
}));

// Exportaciones pesadas (jspdf / xlsx): fuera del alcance de estas pruebas.
vi.mock('@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf', () => ({
  buildIpvVentasPdf: vi.fn(async () => ({ output: () => 'blob:mock', save: vi.fn() })),
  ipvFileName: vi.fn(() => 'ipv.pdf'),
}));
vi.mock('@/components/views/terminal/views/ipv_ventas/ipv-ventas-excel', () => ({
  buildIpvVentasWorkbook: vi.fn(),
}));

import IpvVentasView from '@/components/views/terminal/views/ipv_ventas/IpvVentasView';
import { buildIpvVentasPdf } from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';

const NOMBRES = ['Producto Entra y Sale', 'Producto Quieto', 'Producto Activo', 'Producto Negativo'];

function nombreEnTabla(nombre: string): boolean {
  const cell = screen.queryByText(nombre);
  return !!cell;
}

async function generarInforme() {
  const btn = screen.getByRole('button', { name: /Generar informe/i });
  fireEvent.click(btn);
  await waitFor(() => screen.getByRole('button', { name: /Actualizar informe/i }));
  await waitFor(() => expect(screen.getByText(/4 de 4 productos/)).toBeInTheDocument());
}

function grupoFiltros(): HTMLElement {
  return screen.getByRole('group', { name: 'Filtros de resultados del IPV' });
}
function grupoMovimientos(): HTMLElement {
  return screen.getByRole('group', { name: 'Filtro de movimientos' });
}

beforeEach(() => {
  cleanup();
  vi.mocked(buildIpvVentasPdf).mockClear();
});

describe('IPV — filtro de movimientos Todos / Con movimiento / Sin movimiento (misión 2026-11-24)', () => {
  it('los tres estados aparecen con selección exclusiva: solo «Todos» pulsado por defecto', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    const movs = grupoMovimientos();
    const btnTodos = within(movs).getByRole('button', { name: 'Todos' });
    const btnCon = within(movs).getByRole('button', { name: /Con movimiento/ });
    const btnSin = within(movs).getByRole('button', { name: /Sin movimiento/ });
    expect(btnTodos).toHaveAttribute('aria-pressed', 'true');
    expect(btnCon).toHaveAttribute('aria-pressed', 'false');
    expect(btnSin).toHaveAttribute('aria-pressed', 'false');
    // Sin filtros activos NO hay botón de restablecer ni badge.
    expect(screen.queryByRole('button', { name: /Restablecer filtros/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ipv-filtros-activos')).not.toBeInTheDocument();
    for (const n of NOMBRES) expect(nombreEnTabla(n)).toBe(true);
  });

  it('«Con movimiento» excluye al producto sin movimientos (Caso B en UI)', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    fireEvent.click(within(grupoMovimientos()).getByRole('button', { name: /Con movimiento/ }));

    await waitFor(() => expect(screen.getByText(/3 de 4 productos/)).toBeInTheDocument());
    expect(screen.getByTestId('ipv-filtros-activos')).toHaveTextContent('Filtros: Con movimiento');
    expect(nombreEnTabla('Producto Entra y Sale')).toBe(true);  // A: entradas 50, vendidas 50
    expect(nombreEnTabla('Producto Activo')).toBe(true);        // E
    expect(nombreEnTabla('Producto Negativo')).toBe(true);      // F: vendidas 8
    expect(nombreEnTabla('Producto Quieto')).toBe(false);       // B: sin movimientos
    expect(within(grupoMovimientos()).getByRole('button', { name: /Con movimiento/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Restablecer filtros/ })).toBeInTheDocument();
  });

  it('«Sin movimiento» muestra SOLO el producto sin movimientos (Caso B) — negación exacta', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    fireEvent.click(within(grupoMovimientos()).getByRole('button', { name: /Sin movimiento/ }));

    await waitFor(() => expect(screen.getByText(/1 de 4 productos/)).toBeInTheDocument());
    expect(screen.getByTestId('ipv-filtros-activos')).toHaveTextContent('Filtros: Sin movimiento');
    expect(nombreEnTabla('Producto Quieto')).toBe(true);        // B: único sin movimiento
    expect(nombreEnTabla('Producto Entra y Sale')).toBe(false);
    expect(nombreEnTabla('Producto Activo')).toBe(false);
    expect(nombreEnTabla('Producto Negativo')).toBe(false);
    expect(within(grupoMovimientos()).getByRole('button', { name: /Sin movimiento/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selección exclusiva: pulsar «Todos» restaura el IPV completo (3/4 → 4/4)', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const movs = grupoMovimientos();

    fireEvent.click(within(movs).getByRole('button', { name: /Con movimiento/ }));
    await waitFor(() => expect(screen.getByText(/3 de 4 productos/)).toBeInTheDocument());

    fireEvent.click(within(movs).getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getByText(/4 de 4 productos/)).toBeInTheDocument());
    expect(within(movs).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(movs).getByRole('button', { name: /Con movimiento/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('ipv-filtros-activos')).not.toBeInTheDocument();
  });

  it('ambos filtros combinados (AND) muestran solo el producto con movimiento y Ef > 0 (Caso E en UI)', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = grupoFiltros();

    fireEvent.click(within(grupo).getByRole('button', { name: /Con movimiento/ }));
    fireEvent.click(within(grupo).getByRole('button', { name: /Existencia final > 0/ }));

    await waitFor(() => expect(screen.getByText(/1 de 4 productos/)).toBeInTheDocument());
    expect(screen.getByTestId('ipv-filtros-activos')).toHaveTextContent('Con movimiento + Existencia final > 0');
    expect(nombreEnTabla('Producto Activo')).toBe(true);        // E: movimiento + Ef 15
    expect(nombreEnTabla('Producto Entra y Sale')).toBe(false); // A: Ef 0
    expect(nombreEnTabla('Producto Quieto')).toBe(false);       // B
    expect(nombreEnTabla('Producto Negativo')).toBe(false);     // F: Ef −3
  });

  it('«Existencia final > 0» excluye Ef 0 y Ef negativa (Casos A y F en UI)', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = grupoFiltros();

    fireEvent.click(within(grupo).getByRole('button', { name: /Existencia final > 0/ }));
    await waitFor(() => expect(screen.getByText(/2 de 4 productos/)).toBeInTheDocument());
    expect(nombreEnTabla('Producto Quieto')).toBe(true);   // Ef 20
    expect(nombreEnTabla('Producto Activo')).toBe(true);   // Ef 15
    expect(nombreEnTabla('Producto Entra y Sale')).toBe(false); // Ef 0
    expect(nombreEnTabla('Producto Negativo')).toBe(false);     // Ef −3
  });

  it('«Restablecer filtros» vuelve a «Todos» y apaga «Existencia final > 0»', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = grupoFiltros();

    fireEvent.click(within(grupo).getByRole('button', { name: /Sin movimiento/ }));
    fireEvent.click(within(grupo).getByRole('button', { name: /Existencia final > 0/ }));
    await waitFor(() => expect(screen.getByText(/1 de 4 productos/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Restablecer filtros/ }));
    await waitFor(() => expect(screen.getByText(/4 de 4 productos/)).toBeInTheDocument());
    expect(screen.queryByTestId('ipv-filtros-activos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restablecer filtros/ })).not.toBeInTheDocument();
    for (const n of NOMBRES) expect(nombreEnTabla(n)).toBe(true);
  });

  it('mensaje vacío claro cuando la búsqueda y los filtros no producen resultados', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = grupoFiltros();

    fireEvent.click(within(grupo).getByRole('button', { name: /Con movimiento/ }));
    const search = screen.getByLabelText(/Buscar producto/i);
    fireEvent.change(search, { target: { value: 'zzz-no-existe' } });

    await waitFor(() =>
      expect(screen.getByText(/Ningún producto cumple la búsqueda y los filtros activos/i)).toBeInTheDocument(),
    );
  });
});

describe('IPV — «Ocultar columnas sin valores» (misión 2026-11-24 fase 4B)', () => {
  it('activada: oculta SOLO las columnas numéricas sin ningún valor en el conjunto filtrado; Código y Descripción permanecen', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    // Dataset completo: Devoluciones/Ajustes/Transf./Vales/USD son 0 en TODOS
    // los productos; Entradas (50/20), Vendidas (50/10/8), Ei/Ef y CUP tienen valores.
    expect(screen.getByRole('columnheader', { name: 'Devoluciones' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ventas USD (cobrado)' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ipv-ocultar-vacias'));

    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Devoluciones' })).not.toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: 'Ajustes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Transferencias' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Ventas USD (cobrado)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Vales salidas' })).not.toBeInTheDocument();
    // Con al menos un valor ≠ 0: permanecen.
    expect(screen.getByRole('columnheader', { name: 'Entradas' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cantidades vendidas' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ventas CUP (cobrado)' })).toBeInTheDocument();
    // Código y Descripción SIEMPRE visibles (no configurables).
    expect(screen.getByRole('columnheader', { name: 'Código' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Descripción' })).toBeInTheDocument();
    // Reversible: al desactivar vuelven TODAS las columnas.
    fireEvent.click(screen.getByTestId('ipv-ocultar-vacias'));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Devoluciones' })).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Ventas USD (cobrado)' })).toBeInTheDocument();
  });

  it('recalcula la visibilidad al cambiar el filtro de filas: «Sin movimiento» deja el subconjunto sin valores de venta', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    fireEvent.click(screen.getByTestId('ipv-ocultar-vacias'));
    // Con el conjunto completo, Ventas CUP tiene valores → visible.
    expect(screen.getByRole('columnheader', { name: 'Ventas CUP (cobrado)' })).toBeInTheDocument();

    // Cambia el SUBCONJUNTO: solo el Producto Quieto (todo 0 salvo Ei/Ef).
    fireEvent.click(within(grupoMovimientos()).getByRole('button', { name: /Sin movimiento/ }));
    await waitFor(() => expect(screen.getByText(/1 de 4 productos/)).toBeInTheDocument());

    // Recalculado sobre el nuevo resultado filtrado: las columnas de venta y
    // movimientos ya no tienen ningún valor → ocultas; Ei/Ef sí → visibles.
    expect(screen.queryByRole('columnheader', { name: 'Ventas CUP (cobrado)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Cantidades vendidas' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Existencia inicial' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Existencia final' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Código' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Descripción' })).toBeInTheDocument();
  });
});

describe('IPV — selector de orientación del PDF (misión 2026-11-24 fase 5)', () => {
  it('por defecto Horizontal; al elegir Vertical, preview y descarga piden la MISMA orientación', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    const grupo = screen.getByRole('group', { name: 'Orientación del PDF' });
    const btnH = within(grupo).getByRole('button', { name: 'Horizontal' });
    const btnV = within(grupo).getByRole('button', { name: 'Vertical' });
    expect(btnH).toHaveAttribute('aria-pressed', 'true');
    expect(btnV).toHaveAttribute('aria-pressed', 'false');

    // Orientación por defecto (horizontal) en la primera exportación.
    // (El nombre accesible del botón es «PDF»; el title complementa el tooltip.)
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(vi.mocked(buildIpvVentasPdf)).toHaveBeenCalled());
    expect(vi.mocked(buildIpvVentasPdf).mock.calls[0]?.[0]?.orientation).toBe('landscape');

    fireEvent.click(btnV);
    expect(btnV).toHaveAttribute('aria-pressed', 'true');
    expect(btnH).toHaveAttribute('aria-pressed', 'false');

    // La vista previa (tab PDF) y la descarga comparten buildDoc → la
    // orientación elegida rige AMBAS (preview = export, misión fase 5.1).
    fireEvent.click(within(grupoFiltros()).getByRole('button', { name: /Con movimiento/ }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(vi.mocked(buildIpvVentasPdf).mock.calls.length).toBeGreaterThan(1));
    const last = vi.mocked(buildIpvVentasPdf).mock.calls.at(-1)?.[0];
    expect(last?.orientation).toBe('portrait');
    expect(last?.rows.every((r) => r.cantidadesVendidas !== 0)).toBe(true); // respeta «Con movimiento»
  });
});
