/**
 * cash-report-icon-variant.test.tsx — MISIÓN 2026-10-15 (RE-01).
 *
 * Verifica que el chip del icono de impresora del PageHeader de Reporte
 * Entrega usa la variante NEUTRA (bg-muted/text-muted-foreground) y NO el
 * chip de marca (bg-brand → #39ff14 en dark, chillón en Dark+Enhanced y
 * confundible con un estado de éxito).
 *
 * RE-04: el resto de vistas NO cambia — PageHeader con default 'brand'
 * sigue pintando bg-brand (assert paralelo con una vista equivalente).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => ({})),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const authState = vi.hoisted(() => ({
  user: { id: 'u-1', role: 'admin', fullName: 'Admin Demo', activeStoreId: 'store-1', memberships: [] },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView: vi.fn(), commissionNavContext: null, setCommissionNavContext: vi.fn() })
      : { setCurrentView: vi.fn(), commissionNavContext: null, setCommissionNavContext: vi.fn() },
}));

vi.mock('@/components/views/terminal/views/cash/cash-report-pdf', () => ({
  DEFAULT_PDF_OPTIONS: {
    detailPayments: false, detailProduction: false,
    includeBreakdown: true, includeUsd: true, includeSignature: true,
    includeOtReport: true, includeCommissionColumn: true, usdSeparatePage: true,
  },
  buildCashReportPdf: vi.fn(async () => ({ output: vi.fn(() => 'blob:mock'), save: vi.fn() })),
  fetchDiarioSummaries: vi.fn(async () => ({})),
  methodLabel: (m: string) => (m === 'cash' ? 'Efectivo' : 'Transferencia'),
}));

// next-intl real no está disponible en este test de aislamiento
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));

import CashReportView from '@/components/views/terminal/views/cash/CashReportView';
import PageHeader from '@/components/ui/PageHeader';
import { FileText } from 'lucide-react';

function getIconChip() {
  // El chip del icono es el primer cuadrado 10x10 junto al título de la vista
  const title = screen.getByText('Reporte de Caja — Entrega');
  const header = title.closest('div')?.parentElement?.parentElement; // icon chip ← text wrapper ← row
  return header?.querySelector('div.rounded-xl');
}

beforeEach(() => { cleanup(); });
afterEach(() => { cleanup(); });

describe('RE-01 — chip del icono de impresora (Reporte Entrega)', () => {
  it('usa la variante neutra (bg-muted) — sin verde de marca en el chip', () => {
    render(<CashReportView />);
    const chip = getIconChip();
    expect(chip).toBeTruthy();
    const cls = chip!.className;
    expect(cls).toContain('bg-muted');
    expect(cls).toContain('text-muted-foreground');
    expect(cls).not.toContain('bg-brand');
    expect(cls).not.toContain('text-brand-foreground');
  });
});

describe('RE-04 — PageHeader default intacto en el resto de vistas', () => {
  it('sin iconVariant explícito el chip conserva bg-brand (momento de marca)', () => {
    // Render directo del PageHeader con la firma que usan las demás vistas
    const { container } = render(
      <PageHeader title="Vista genérica" icon={FileText} />,
    );
    const chip = container.querySelector('div.rounded-xl');
    expect(chip).toBeTruthy();
    expect(chip!.className).toContain('bg-brand');
    expect(chip!.className).not.toContain('bg-muted');
  });
});
