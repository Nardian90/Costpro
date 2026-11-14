/**
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14) — presentación del modal de detalle
 * de recepción con LÍNEAS EN DIVISA.
 *
 * Defecto del caso FAC-VITALLCONS-001: el «Total Costo» de cabecera está en
 * CUP (Σ qty·unit_cost·tasa) pero los subtotales de línea se mostraban en
 * MONEDA ORIGINAL con etiqueta «CUP» (formatCurrency default) → el
 * propietario comparaba 5.404.573,25 «CUP» (mezcla CUP+USD sin convertir)
 * contra 192.039.436,00 CUP y leía una diferencia inexplicable de
 * 186.634.862,75.
 *
 * Verifica el contrato nuevo: cada línea declara su moneda, las líneas FX
 * muestran su equivalente CUP con la tasa congelada, el pie resume en CUP y
 * la tarjeta de cabecera se etiqueta «Total Costo (CUP)».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'order', 'single', 'insert', 'update', 'delete']) {
        chain[m] = vi.fn().mockReturnThis();
      }
      chain.then = (ok: any) => Promise.resolve({ data: [], error: null }).then(ok);
      return chain;
    },
  },
}));
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/components/ui/OperationDatePicker', () => ({
  OperationDatePicker: () => null,
  useOperationDateValidation: () => ({ selectedDate: null, setDate: vi.fn(), error: null }),
  formatOperationDateForRPC: () => '',
}));

import { ReceptionDetailsModal } from '@/components/views/terminal/views/receptions/ReceptionDetailsModal';
import { formatCurrency } from '@/lib/utils';

const RECEIPT = {
  id: 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63',
  store_id: '5e6fe821-5465-48b1-b3f1-3aa3182edc38',
  user_id: 'a1111111-1111-1111-1111-111111111111',
  supplier: 'Vitallcons',
  reception_date: '2026-07-01',
  reference_doc: 'FAC-VITALLCONS-001',
  total_cost: 136500,
  status: 'active',
  created_at: '2026-08-11T22:49:18.423872+00:00',
  payment_status: 'unpaid',
  paid_amount: 0,
} as any;

// Réplica de la estructura de fd9d6c88 (escala reducida): 1 línea CUP + 1 línea USD@680.
const ITEMS = [
  {
    id: 'item-cup-1', receipt_id: RECEIPT.id, product_id: 'p-cup',
    quantity: 2, unit_cost: 250, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
    created_at: '2026-08-11T22:49:18Z', updated_at: '2026-08-11T22:49:18Z', variant_id: null,
    products: { name: 'Tornillo con arandela', sku: '106', image_url: null, public_image_url: null },
  },
  {
    id: 'item-usd-1', receipt_id: RECEIPT.id, product_id: 'p-usd',
    quantity: 2, unit_cost: 100, moneda_recepcion: 'USD', tasa_cambio_recepcion: 680,
    created_at: '2026-08-11T22:49:18Z', updated_at: '2026-08-11T22:49:18Z', variant_id: null,
    products: { name: 'Yee MC4', sku: '119', image_url: null, public_image_url: null },
  },
] as any;

// Σ(q·uc·tasa) = 2·250·1 + 2·100·680 = 500 + 136000 = 136500 CUP
const CUP_EQUIV_USD_LINE = 2 * 100 * 680;

function setup(items = ITEMS, receipt = RECEIPT) {
  return render(
    <ReceptionDetailsModal
      receipt={receipt}
      isOpen
      onClose={() => {}}
      items={items}
      isLoading={false}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReceptionDetailsModal — monedas explícitas en líneas y resumen en CUP', () => {
  it('la línea USD muestra su subtotal en USD con su equivalente ≈ CUP (tasa congelada)', () => {
    setup();
    const equiv = screen.getByTitle('Equivalente en CUP con la tasa congelada de la línea');
    expect(equiv.textContent).toContain(formatCurrency(CUP_EQUIV_USD_LINE));
    // Subtotal de la línea en su moneda original (200 USD)
    expect(screen.getAllByText(formatCurrency(200, 'USD')).length).toBeGreaterThan(0);
  });

  it('la línea CUP muestra su subtotal en CUP (sin equivalente redundante)', () => {
    setup();
    expect(screen.getAllByText(formatCurrency(500, 'CUP')).length).toBeGreaterThan(0);
  });

  it('el resumen declara «Subtotal (CUP)» con la suma convertida de las líneas', () => {
    setup();
    const label = screen.getByText('Subtotal (CUP):');
    expect(label.parentElement?.textContent).toContain(formatCurrency(136500));
  });

  it('el total se etiqueta «Total (CUP)» (nunca un CUP ambiguo junto a líneas FX)', () => {
    setup();
    const label = screen.getByText('Total (CUP):');
    expect(label.parentElement?.textContent).toContain(formatCurrency(136500));
  });

  it('con monedas mixtas aparece el desglose por moneda de las líneas', () => {
    setup();
    const label = screen.getByText('Líneas por moneda:');
    expect(label.parentElement?.textContent).toContain(formatCurrency(500, 'CUP'));
    expect(label.parentElement?.textContent).toContain(formatCurrency(200, 'USD'));
  });

  it('la tarjeta de cabecera dice «Total Costo (CUP)» y avisa de la conversión única', () => {
    setup();
    expect(screen.getByText('Total Costo (CUP)')).toBeDefined();
    expect(screen.getByText(/Incluye líneas en divisa convertidas una sola vez/i)).toBeDefined();
  });

  it('recepción 100% CUP: sin desglose ni equivalencias (no ruido)', () => {
    setup([
      { ...ITEMS[0], quantity: 2, unit_cost: 250, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 },
    ] as any, { ...RECEIPT, total_cost: 500 } as any);
    expect(screen.queryByText('Líneas por moneda:')).toBeNull();
    expect(screen.queryByTitle('Equivalente en CUP con la tasa congelada de la línea')).toBeNull();
    expect(screen.getByText('Subtotal (CUP):').parentElement?.textContent).toContain(formatCurrency(500));
  });

  it('la recepción anulada mantiene la etiqueta «Anulada» en la tarjeta de total', () => {
    setup(ITEMS, { ...RECEIPT, status: 'voided' } as any);
    expect(screen.getByText('Anulada')).toBeDefined();
    expect(screen.queryByText(/Incluye líneas en divisa/i)).toBeNull();
  });
});
