/**
 * Contrato de fuente — Reporte de Caja como VISTA dedicada (CAMBIO 2026-10).
 *
 * Garantías anti-regresión verificadas sobre el código fuente:
 *   1. El modal antiguo NO existe y nadie lo importa (fuente única = CashReportView).
 *   2. Ningún módulo del reporte importa 'jspdf' de forma estática
 *      (W2/W3: jspdf solo descarga al previsualizar/exportar).
 *   3. Los tres accesos (menú Ventas, botón POS, botón Caja) apuntan a la MISMA
 *      vista `cash_report` — sin accesos que abran un overlay antiguo.
 *   4. La vista dedicada usa la infraestructura estándar (PageHeader + case en
 *      TerminalShell) y extrae la lógica a cash-report-core/pdf (sin duplicar).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const VIEW = 'src/components/views/terminal/views/cash/CashReportView.tsx';
const CORE = 'src/components/views/terminal/views/cash/cash-report-core.ts';
const PDF = 'src/components/views/terminal/views/cash/cash-report-pdf.ts';
const SHELL = 'src/components/views/TerminalShell.tsx';
const CLOSURE = 'src/components/views/terminal/views/cash_closure/CashClosureView.tsx';
const POS = 'src/components/views/terminal/views/pos/POSView.tsx';

describe('Reporte de Caja — vista dedicada (fuente única)', () => {
  it('el modal antiguo fue eliminado y ningún módulo lo importa', () => {
    const modalPath = resolve(root, 'src/components/views/terminal/views/cash/CashReportModal.tsx');
    expect(existsSync(modalPath)).toBe(false);
    // Sin imports vivos del modal en todo src/ (los comentarios documentales no cuentan)
    const { execSync } = require('child_process') as typeof import('child_process');
    const out = execSync(
      `rg -l "from '@/components/views/terminal/views/cash/CashReportModal'" src/ -g '!src/__tests__/**' || true`,
      { encoding: 'utf-8' },
    ).trim();
    expect(out).toBe('');
  });

  it('ningún módulo del reporte importa jspdf de forma estática (W2/W3)', () => {
    for (const f of [VIEW, CORE, PDF, SHELL, CLOSURE]) {
      const src = read(f);
      expect(src, f).not.toMatch(/import\s+jsPDF\s+from\s+'jspdf'/);
      expect(src, f).not.toMatch(/import\s+\{\s*jsPDF[^}]*\}\s+from\s+'jspdf'/);
    }
    // El builder obtiene el doc vía createPDFDocument (import dinámico interno)
    expect(read(PDF)).toMatch(/createPDFDocument/);
    expect(read('src/lib/export/lazy-pdf.ts')).toMatch(/import\('jspdf'\)/);
  });

  it('TerminalShell renderiza la vista dedicada en el case cash_report (sin wrapper de modal)', () => {
    const src = read(SHELL);
    expect(src).toMatch(/case 'cash_report':\s*return <ViewErrorBoundary viewName="Reporte de Entrega"><CashReportView \/><\/ViewErrorBoundary>;/);
    // Sin wrapper del modal (ni definición ni uso); el nombre solo puede quedar en comentarios históricos
    expect(src).not.toMatch(/function CashReportWrapper/);
    expect(src).not.toMatch(/<CashReportWrapper/);
    // Import dinámico de la vista
    expect(src).toMatch(/dynamic\(\(\) => import\('@\/components\/views\/terminal\/views\/cash\/CashReportView'\)/);
  });

  it('Caja (CashClosureView) redirige a la vista dedicada y no monta overlays del reporte', () => {
    const src = read(CLOSURE);
    expect(src).toMatch(/setCurrentView\('cash_report'\)/);
    expect(src).not.toMatch(/<CashReportModal/);
  });

  it('POSView navega a la misma vista cash_report (un único destino para los 3 accesos)', () => {
    const src = read(POS);
    expect(src).toMatch(/setCurrentView\('cash_report'\)/);
    expect(src).not.toMatch(/CashReportModal\s+open=/);
  });

  it('la vista usa PageHeader (jerarquía estándar) y la lógica vive en core/pdf extraídos', () => {
    const view = read(VIEW);
    expect(view).toMatch(/<PageHeader/);
    // Botón principal único (Generar/Actualizar) — sin recálculo automático
    expect(view).toMatch(/Generar reporte/);
    expect(view).toMatch(/Actualizar reporte/);
    expect(read(CORE)).toMatch(/export function isReportStale/);
    expect(read(PDF)).toMatch(/export async function buildCashReportPdf/);
  });

  it('la pestaña de vista previa muestra el documento sin obligar a descargar y revoca el blob', () => {
    const view = read(VIEW);
    expect(view).toMatch(/Vista previa/);
    expect(view).toMatch(/doc\.output\('bloburl'\)/);
    expect(view).toMatch(/revokeObjectURL/);
    // La descarga sigue siendo explícita e independiente
    expect(view).toMatch(/\.save\(/);
  });

  it('la configuración no dispara cálculos: sin useEffect que dependa de fechas para fetchear', () => {
    const view = read(VIEW);
    // El único fetch del reporte vive en handleGenerate (callback explícito)
    expect(view).toMatch(/const handleGenerate/);
    // No existe un efecto con [.., startDate, endDate] que llame a apiFetch('/api/cash-report
    const effects = view.match(/useEffect\([\s\S]*?\}\s*,\s*\[[^\]]*\]\);/g) || [];
    for (const eff of effects) {
      expect(eff.includes("apiFetch(`/api/cash-report?")).toBe(false);
    }
  });
});
