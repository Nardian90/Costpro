/**
 * Pruebas de UI de los FILTROS DE RESULTADOS del IPV (petición 2026-11-06).
 *
 * Vista real IpvVentasView con la API mockeada (dataset sintético de 4
 * productos que cubren los casos A, B, E y F de la petición):
 *   · Producto Entra y Sale (A): Ei 0 · entradas 50 · vendidas 50 · Ef 0.
 *   · Producto Quieto (B): Ei 20 · sin movimientos · Ef 20.
 *   · Producto Activo (E): Ei 5 · entradas 20 · vendidas 10 · Ef 15.
 *   · Producto Negativo (F): Ei 5 · vendidas 8 · Ef −3.
 *
 * Verifica: chips tras «Mes anterior», aria-pressed, conteo «N de M
 * productos», badge de filtros activos, «Restablecer filtros», exclusión/
 * inclusión de filas en tabla, y mensaje vacío cuando nada cumple.
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
        { productId: 'p-a', sku: '100', name: 'Producto Entra y Sale', unit: 'un', existenciaInicial: 0, cantidadesVendidas: 50, valesSalidas: 0, entradas: 50, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 0, ventasImporteCup: 2500, ventasImporteUsd: 0, hasPeriodMovements: true, incidenceTypes: [] },
        { productId: 'p-b', sku: '200', name: 'Producto Quieto', unit: 'un', existenciaInicial: 20, cantidadesVendidas: 0, valesSalidas: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 20, ventasImporteCup: 0, ventasImporteUsd: 0, hasPeriodMovements: false, incidenceTypes: [] },
        { productId: 'p-e', sku: '300', name: 'Producto Activo', unit: 'un', existenciaInicial: 5, cantidadesVendidas: 10, valesSalidas: 0, entradas: 20, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 15, ventasImporteCup: 1000, ventasImporteUsd: 0, hasPeriodMovements: true, incidenceTypes: [] },
        { productId: 'p-f', sku: '400', name: 'Producto Negativo', unit: 'un', existenciaInicial: 5, cantidadesVendidas: 8, valesSalidas: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: -3, ventasImporteCup: 800, ventasImporteUsd: 0, hasPeriodMovements: true, incidenceTypes: [] },
      ];
      const totals = {
        existenciaInicial: 30, cantidadesVendidas: 68, valesSalidas: 0,
        entradas: 70, devoluciones: 0, ajustes: 0, transferencias: 0,
        existenciaFinal: 32, ventasImporteCup: 4300, ventasImporteUsd: 0,
      };
      return {
        store: { id: 'store-1', name: 'Costpro Central' },
        window: { fromISO: '2026-11-01T04:00:00.000Z', toISO: '2026-11-06T03:59:59.999Z' },
        result: { rows, incidences: [], totals, excludedCount: 0 },
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
  buildIpvVentasPdf: vi.fn(),
  ipvFileName: vi.fn(() => 'ipv.pdf'),
}));
vi.mock('@/components/views/terminal/views/ipv_ventas/ipv-ventas-excel', () => ({
  buildIpvVentasWorkbook: vi.fn(),
}));

import IpvVentasView from '@/components/views/terminal/views/ipv_ventas/IpvVentasView';

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

beforeEach(() => {
  cleanup();
});

describe('IPV — filtros «Con movimiento» y «Existencia final > 0» en la vista', () => {
  it('los chips aparecen después de «Mes anterior» y sin filtros muestra el IPV completo', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    const grupoFiltros = screen.getByRole('group', { name: 'Filtros de resultados del IPV' });
    const chipMov = within(grupoFiltros).getByRole('button', { name: /Con movimiento/ });
    const chipEf = within(grupoFiltros).getByRole('button', { name: /Existencia final > 0/ });
    expect(chipMov).toHaveAttribute('aria-pressed', 'false');
    expect(chipEf).toHaveAttribute('aria-pressed', 'false');
    // Sin filtros activos NO hay botón de restablecer ni badge.
    expect(screen.queryByRole('button', { name: /Restablecer filtros/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ipv-filtros-activos')).not.toBeInTheDocument();
    for (const n of NOMBRES) expect(nombreEnTabla(n)).toBe(true);
  });

  it('«Con movimiento» excluye al producto sin movimientos (Caso B en UI)', async () => {
    render(<IpvVentasView />);
    await generarInforme();

    fireEvent.click(within(screen.getByRole('group', { name: 'Filtros de resultados del IPV' })).getByRole('button', { name: /Con movimiento/ }));

    await waitFor(() => expect(screen.getByText(/3 de 4 productos/)).toBeInTheDocument());
    expect(screen.getByTestId('ipv-filtros-activos')).toHaveTextContent('Filtros: Con movimiento');
    expect(nombreEnTabla('Producto Entra y Sale')).toBe(true);  // A: entradas 50, vendidas 50
    expect(nombreEnTabla('Producto Activo')).toBe(true);        // E
    expect(nombreEnTabla('Producto Negativo')).toBe(true);      // F: vendidas 8
    expect(nombreEnTabla('Producto Quieto')).toBe(false);       // B: sin movimientos
    expect(screen.getByRole('button', { name: /Con movimiento/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Restablecer filtros/ })).toBeInTheDocument();
  });

  it('ambos filtros combinados (AND) muestran solo el producto con movimiento y Ef > 0 (Caso E en UI)', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = screen.getByRole('group', { name: 'Filtros de resultados del IPV' });

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
    const grupo = screen.getByRole('group', { name: 'Filtros de resultados del IPV' });

    fireEvent.click(within(grupo).getByRole('button', { name: /Existencia final > 0/ }));
    await waitFor(() => expect(screen.getByText(/2 de 4 productos/)).toBeInTheDocument());
    expect(nombreEnTabla('Producto Quieto')).toBe(true);   // Ef 20
    expect(nombreEnTabla('Producto Activo')).toBe(true);   // Ef 15
    expect(nombreEnTabla('Producto Entra y Sale')).toBe(false); // Ef 0
    expect(nombreEnTabla('Producto Negativo')).toBe(false);     // Ef −3
  });

  it('«Restablecer filtros» apaga todos los filtros y restaura el IPV completo', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = screen.getByRole('group', { name: 'Filtros de resultados del IPV' });

    fireEvent.click(within(grupo).getByRole('button', { name: /Con movimiento/ }));
    fireEvent.click(within(grupo).getByRole('button', { name: /Existencia final > 0/ }));
    await waitFor(() => expect(screen.getByText(/1 de 4 productos/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Restablecer filtros/ }));
    await waitFor(() => expect(screen.getByText(/4 de 4 productos/)).toBeInTheDocument());
    expect(screen.queryByTestId('ipv-filtros-activos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restablecer filtros/ })).not.toBeInTheDocument();
    for (const n of NOMBRES) expect(nombreEnTabla(n)).toBe(true);
  });

  it('los toggles se pueden activar y desactivar individualmente (idempotentes)', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = screen.getByRole('group', { name: 'Filtros de resultados del IPV' });
    const chipMov = within(grupo).getByRole('button', { name: /Con movimiento/ });

    fireEvent.click(chipMov);
    await waitFor(() => expect(screen.getByText(/3 de 4 productos/)).toBeInTheDocument());
    fireEvent.click(chipMov); // desactivar
    await waitFor(() => expect(screen.getByText(/4 de 4 productos/)).toBeInTheDocument());
    expect(chipMov).toHaveAttribute('aria-pressed', 'false');
  });

  it('mensaje vacío claro cuando la búsqueda y los filtros no producen resultados', async () => {
    render(<IpvVentasView />);
    await generarInforme();
    const grupo = screen.getByRole('group', { name: 'Filtros de resultados del IPV' });

    fireEvent.click(within(grupo).getByRole('button', { name: /Con movimiento/ }));
    const search = screen.getByLabelText(/Buscar producto/i);
    fireEvent.change(search, { target: { value: 'zzz-no-existe' } });

    await waitFor(() =>
      expect(screen.getByText(/Ningún producto cumple la búsqueda y los filtros activos/i)).toBeInTheDocument(),
    );
  });
});
