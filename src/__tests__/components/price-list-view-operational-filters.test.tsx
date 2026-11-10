/**
 * price-list-view-operational-filters.test.tsx — CP-OPERATIONAL-CLASS-001.
 *
 * Contrato de UI del Listado de precios (§3-§5, §8.9-§8.17):
 *  · Chips de «Clasificación operativa» (multi-select + Todas + Sin
 *    clasificar) y «Estado del precio» (Todos/Con precio/Sin precio),
 *    combinables entre sí (§8.14) con estados visibles (aria-pressed).
 *  · Contadores EN VIVO que responden al cambiar filtros sin generar
 *    la vista previa (§5, §8.16).
 *  · «Limpiar filtros» recupera el listado completo (§8.15).
 *  · La vista previa/PDF se genera con los MISMOS filtros de la pantalla
 *    (un solo pipeline, §8.17).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import PriceListView from '@/components/views/terminal/views/price_list/PriceListView';
import type { PriceListSourceItem, PriceListModel } from '@/lib/price-list/model';

// ── Fixture: cada combinación que el filtro debe distinguir ────────────────
function item(over: Partial<PriceListSourceItem> & { id: string }): PriceListSourceItem {
  return {
    sku: over.id,
    name: `Producto ${over.id}`,
    price: 100,
    price_currency: 'CUP',
    stock_current: 10,
    is_active: true,
    is_service: false,
    operational_class: 'venta',
    ...over,
  } as PriceListSourceItem;
}

const FIXTURE: PriceListSourceItem[] = [
  item({ id: '1', name: 'Refresco', operational_class: 'venta', price: 150 }),
  item({ id: '2', name: 'Refresco sin precio', operational_class: 'venta', price: null }),
  item({ id: '3', name: 'Detergente operativo (precio 0 legítimo)', operational_class: 'insumo', price: 0 }),
  item({ id: '4', name: 'Refrigerador', operational_class: 'activo_fijo', price: null }),
  item({ id: '5', name: 'Histórico sin clasificar', operational_class: null, price: 300 }),
];

const storeInfo = { id: 'store-1', name: 'Tienda Central', logoUrl: null, reeup: null, nit: null };

vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: { id: 'u-1', activeStoreId: 'store-1' } }) : { user: { id: 'u-1', activeStoreId: 'store-1' } },
}));

vi.mock('@/hooks/api/usePriceListProducts', () => ({
  usePriceListProducts: vi.fn(() => ({ data: FIXTURE, isLoading: false, error: null })),
  fetchPriceListStoreInfo: vi.fn(() => Promise.resolve(storeInfo)),
}));

const pdfMock = vi.hoisted(() => ({
  renderPriceListPdf: vi.fn(async (..._args: unknown[]) => ({ output: vi.fn(() => 'blob:mock-url'), save: vi.fn() })),
  priceListFileName: vi.fn(() => 'listado.pdf'),
}));
vi.mock('@/lib/price-list/pdf', () => pdfMock);

// CP-PRODUCT-COMMISSION-001 TAREA 2: el hook de reglas de comisión es carga
// diferida de la API real — en estos tests se mockea (reglas vacías ⇒ la
// columna visible presenta «Sin regla», jamás valores inventados).
vi.mock('@/hooks/api/useCommissionRules', () => ({
  useCommissionRules: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const liveCount = () => screen.getByTestId('price-list-live-count').textContent ?? '';
const activeFilters = () => screen.queryByTestId('price-list-active-filters')?.textContent ?? null;

describe('CP-OPERATIONAL-CLASS-001 · filtros en el Listado de precios (UI)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('§3 · los dos grupos de filtros existen y «Todas»/«Todos» parten activos', () => {
    render(<PriceListView />);
    expect(screen.getByText('Clasificación operativa')).toBeTruthy();
    expect(screen.getByText('Estado del precio')).toBeTruthy();
    expect(screen.getByTestId('opclass-all').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('price-status-all').getAttribute('aria-pressed')).toBe('true');
    for (const v of ['venta', 'insumo', 'activo_fijo', 'util_herramienta', 'unclassified']) {
      expect(screen.getByTestId(`opclass-${v}`).getAttribute('aria-pressed')).toBe('false');
    }
    // Contador en vivo con el dataset completo (sin filtros).
    expect(liveCount()).toContain('5');
    expect(activeFilters()).toBeNull();
  });

  it('§8.9 · filtrar Venta acota el contador y muestra el estado seleccionado', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('opclass-venta'));
    expect(screen.getByTestId('opclass-venta').getAttribute('aria-pressed')).toBe('true');
    expect(liveCount()).toContain('2'); // solo los 2 de Venta
    expect(activeFilters()).toContain('Clasificación: Venta');
  });

  it('§8.13/§4 · criterio REAL verificado: Sin precio = NULL y 0 (price NOT NULL DEFAULT 0)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('price-status-without_price'));
    // Sin precio: id 2 (NULL) e id 3 (cero — el esquema vigente lo representa
    // así; HALLAZGO CP-OPERATIONAL-CLASS-002) e id 4 (NULL).
    expect(liveCount()).toContain('3');
    await user.click(screen.getByTestId('price-status-with_price'));
    // Con precio: 1 (150) y 5 (300).
    expect(liveCount()).toContain('2');
  });

  it('§8.14 · combinación simultánea: Venta + Sin precio (Caso A de la misión)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('opclass-venta'));
    await user.click(screen.getByTestId('price-status-without_price'));
    expect(liveCount()).toContain('1');
    expect(activeFilters()).toContain('Clasificación: Venta');
    expect(activeFilters()).toContain('Precio: Sin precio');
  });

  it('§8.11 · marcar SOLO «Sin clasificar» muestra exclusivamente los pendientes', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('opclass-unclassified'));
    expect(liveCount()).toContain('1');
    expect(activeFilters()).toContain('Clasificación: Sin clasificar');
  });

  it('§8.15 · «Limpiar filtros» recupera el listado completo', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('opclass-venta'));
    await user.click(screen.getByTestId('price-status-without_price'));
    expect(liveCount()).toContain('1');
    await user.click(screen.getByRole('button', { name: /Limpiar filtros/i }));
    expect(liveCount()).toContain('5');
    expect(activeFilters()).toBeNull();
    expect(screen.getByTestId('opclass-all').getAttribute('aria-pressed')).toBe('true');
  });

  it('§8.17 · la vista previa se genera con los MISMOS filtros de la pantalla (un solo pipeline)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('opclass-venta'));
    await user.click(screen.getByTestId('price-status-without_price'));
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    expect(pdfMock.renderPriceListPdf).toHaveBeenCalledTimes(1);
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    expect(model.meta.operationalFilter).toEqual({ classes: ['venta'], priceStatus: 'without_price' });
    expect(model.rows.map((r) => r.id)).toEqual(['2']);
  });

  it('el rango de SKU coexiste con los filtros operativos (§5)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.type(screen.getByLabelText('SKU desde'), '1');
    await user.type(screen.getByLabelText('SKU hasta'), '2');
    await user.click(screen.getByTestId('opclass-venta'));
    await user.click(screen.getByTestId('price-status-without_price'));
    // SKU 1-2 y Venta sin precio → id 2 (SKU "2").
    expect(liveCount()).toContain('1');
    expect(activeFilters()).toContain('Clasificación: Venta');
  });

  it('§7 · el contador EN VIVO incluye el rango de SKU (mismo pipeline que el modelo)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    // Fixture completo = 5. Con rango SKU 1-2 → solo 2 filas (SKU 1 y 2).
    await user.type(screen.getByLabelText('SKU desde'), '1');
    await user.type(screen.getByLabelText('SKU hasta'), '2');
    expect(liveCount()).toContain('2');
    // Rango que no alcanza a ningún SKU del fixture → 0 y nota explicativa.
    await user.clear(screen.getByLabelText('SKU desde'));
    await user.clear(screen.getByLabelText('SKU hasta'));
    await user.type(screen.getByLabelText('SKU desde'), '80');
    await user.type(screen.getByLabelText('SKU hasta'), '90');
    expect(liveCount()).toContain('0');
    expect(screen.getByText(/Ningún producto cumple la combinación de filtros/i)).toBeTruthy();
  });

  it('§7 · el contador coincide EXACTAMENTE con las filas del modelo generado (una sola fuente)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.type(screen.getByLabelText('SKU desde'), '1');
    await user.type(screen.getByLabelText('SKU hasta'), '3');
    await user.click(screen.getByTestId('opclass-venta'));
    await user.click(screen.getByTestId('price-status-without_price'));
    const contador = Number((liveCount().match(/^(\d+)/) ?? [])[1]);
    expect(contador).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    expect(pdfMock.renderPriceListPdf).toHaveBeenCalledTimes(1);
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    expect(model.meta.totalProducts).toBe(contador);
    expect(model.rows).toHaveLength(contador);
  });

  it('§5/§10 · el modelo generado representa «Sin precio» para NULL y cero (esquema real)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    // El fixture: id 2 (Venta, price NULL) e id 3 (Insumo, price 0) — ambos
    // son «Sin precio» bajo el criterio REAL (price NOT NULL DEFAULT 0).
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    const rowSinPrecio = model.rows.find((r) => r.id === '2');
    const rowCero = model.rows.find((r) => r.id === '3');
    expect(rowSinPrecio?.priceLabel).toBe('Sin precio');
    expect(rowCero?.priceLabel).toBe('Sin precio');
    // Y un precio positivo se numeriza con su moneda.
    const rowPrecio = model.rows.find((r) => r.id === '1');
    expect(rowPrecio?.priceLabel).toContain('CUP');
    expect(rowPrecio?.priceLabel).not.toBe('Sin precio');
  });

  it('TAREA 2 · la columna «Comisión» está OCULTA por defecto (modelo sin showCommission)', async () => {
    render(<PriceListView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    expect(model.meta.showCommission).toBe(false);
    expect(model.rows.every((r) => r.commissionLabel === undefined)).toBe(true);
  });

  it('TAREA 2 · al mostrar la columna, el modelo lleva las etiquetas del motor real', async () => {
    render(<PriceListView />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('comision-col-toggle'));
    expect(screen.getByTestId('comision-col-toggle').getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    expect(model.meta.showCommission).toBe(true);
    // Sin reglas cargadas (mock vacío del hook) → «Sin regla», jamás inventado.
    expect(model.rows.every((r) => r.commissionLabel === 'Sin regla')).toBe(true);
    // Ocultar de nuevo restaura el layout histórico.
    await user.click(screen.getByTestId('comision-col-toggle'));
    expect(screen.getByTestId('comision-col-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('cambio de moneda por fila no afectado: el filtro no mezcla monedas (§8.18)', async () => {
    render(<PriceListView />);
    // El fixture es CUP; una fila USD seguiría mostrando su propia moneda:
    // el filtro solo selecciona filas (verificado en el modelo puro).
    expect(liveCount()).toContain('5');
    fireEvent.click(screen.getByTestId('opclass-util_herramienta'));
    expect(liveCount()).toContain('0');
  });
});

// ══════════════════════════════════════════════════════════════════════
// CP-PRECIO-PDF-DESC-001 · «Mostrar descripción en PDF» (Sí/No) en la UI
// La opción controla REALMENTE la inclusión/omisión de la descripción en
// el documento (no es solo un selector visual) y no filtra filas.
// ══════════════════════════════════════════════════════════════════════
describe('CP-PRECIO-PDF-DESC-001 · «Mostrar descripción en PDF» (Sí/No) en la UI', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('la opción existe con Sí/No, «Sí» parte activa y NO altera el contador en vivo', () => {
    render(<PriceListView />);
    expect(screen.getByText('Mostrar descripción en PDF')).toBeTruthy();
    expect(screen.getByTestId('descripcion-pdf-si').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('descripcion-pdf-no').getAttribute('aria-pressed')).toBe('false');
    // Opción de PRESENTACIÓN del documento: no filtra filas.
    expect(liveCount()).toContain('5');
    expect(activeFilters()).toBeNull();
  });

  it('por defecto (Sí) el modelo se construye con includeDescription=true', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    expect(pdfMock.renderPriceListPdf).toHaveBeenCalledTimes(1);
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    expect(model.meta.includeDescription).toBe(true);
    expect(model.rows).toHaveLength(5);
  });

  it('«No — Ocultar descripción» construye el modelo con includeDescription=false (mismas filas)', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByTestId('descripcion-pdf-no'));
    expect(screen.getByTestId('descripcion-pdf-no').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('descripcion-pdf-si').getAttribute('aria-pressed')).toBe('false');
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    expect(pdfMock.renderPriceListPdf).toHaveBeenCalledTimes(1);
    const model = (pdfMock.renderPriceListPdf.mock.calls as unknown[][])[0][0] as PriceListModel;
    expect(model.meta.includeDescription).toBe(false);
    expect(model.rows).toHaveLength(5); // mismos datos, solo cambia el PDF
  });

  it('cambiar la opción tras generar marca la vista previa DESACTUALIZADA', async () => {
    const user = userEvent.setup();
    render(<PriceListView />);
    await user.click(screen.getByRole('button', { name: /Generar vista previa/i }));
    expect(screen.queryByText(/Vista previa desactualizada/i)).toBeNull();
    await user.click(screen.getByTestId('descripcion-pdf-no'));
    expect(screen.getByText(/Vista previa desactualizada/i)).toBeTruthy();
  });
});
